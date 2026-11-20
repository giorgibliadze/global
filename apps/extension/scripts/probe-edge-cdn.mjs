// Read-only real-CDN probe using an unpacked extension in an EMPTY isolated profile.
// No authenticated website is opened, no cookies are inspected, no photos are uploaded.
import {spawn,execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const python=`import zipfile,xml.etree.ElementTree as E,json\nfrom html.parser import HTMLParser\nfrom urllib.parse import urlsplit\nclass P(HTMLParser):\n def __init__(self):super().__init__();self.main=None;self.og=None\n def handle_starttag(self,t,a):\n  d=dict(a)\n  if t=='img' and 'main-image' in d.get('class','').split() and not self.main:self.main=d.get('src')\n  if t=='meta' and d.get('property')=='og:image':self.og=d.get('content')\nimport sys\nwith zipfile.ZipFile(sys.argv[1]) as z:r=E.fromstring(z.read('word/document.xml'))\nns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}\ns='\\n'.join(''.join(n.text or '' for n in p.findall('.//w:t',ns)) for p in r.findall('.//w:p',ns));p=P();p.feed(s)\nprint(json.dumps({'main':p.main,'og':p.og}))`
const ids=['58c1f23621a285813056d6e586d5f99d','abeddc8e352ccbba5280bdb363558716']
let cases=ids.flatMap((id,index)=>{
 const values=JSON.parse(execFileSync('python3',['-c',python,'/Users/macbook/Downloads/https___www.edgepipeline.com_components_vehicle_detail_'+id+'.docx'],{encoding:'utf8'}))
 return Object.entries(values).map(([kind,value])=>{const u=new URL(value.startsWith('//')?'https:'+value:value);if(u.hostname!=='file3.autolookout.net'||u.search||u.username||u.password)throw Error('Unverified/sensitive image URL');return {fixture:index===0?'BMW':'Tesla',kind,url:u.href}})
})
cases=cases.flatMap(test=>test.kind==='og'? [test,{...test,kind:'og-https-same-path',url:test.url.replace(/^http:/,'https:')}]:[test,{...test,kind:'main-http-same-path',url:test.url.replace(/^https:/,'http:')}])
const profile=await mkdtemp(join(tmpdir(),'edge-real-cdn-'))
let chrome,socket
try{
 const endpoint=await new Promise((resolve,reject)=>{
  chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking','--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']})
  let stderr='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000)
  chrome.stderr.on('data',chunk=>{stderr+=chunk;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1])}});chrome.on('error',reject)
 })
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 let next=0;const pending=new Map(),network=[]
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))})
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return}
  if(m.method==='Network.requestWillBeSent'&&m.params.redirectResponse)network.push({stage:'redirect',status:m.params.redirectResponse.status,from:new URL(m.params.redirectResponse.url).origin,to:new URL(m.params.request.url).origin})
  if(m.method==='Network.loadingFailed')network.push({stage:'network-failed',code:/^net::ERR_[A-Z_]+$/.test(m.params.errorText)?m.params.errorText:'NETWORK_REJECTED',cors:m.params.corsErrorStatus?.corsError,blocked:m.params.blockedReason})
 })
 const {id}=await command('Extensions.loadUnpacked',{path:join(root,'apps/extension/dist')});let worker
 for(let attempt=0;attempt<100;attempt++){worker=(await command('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.includes(id));if(worker)break;await new Promise(r=>setTimeout(r,100))}
 if(!worker)throw Error('Extension worker unavailable')
 const {sessionId}=await command('Target.attachToTarget',{targetId:worker.targetId,flatten:true});await command('Runtime.enable',{},sessionId);await command('Network.enable',{},sessionId)
 const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error('Probe evaluation failed: '+(r.exceptionDetails.exception?.description??r.exceptionDetails.text).split('\n')[0]);return r.result.value}
 for(let attempt=0;attempt<50;attempt++){if(await evaluate("typeof chrome==='object'&&!!chrome.runtime?.id"))break;await new Promise(resolve=>setTimeout(resolve,100))}
 console.log('EDGE_CDN_PERMISSIONS '+JSON.stringify(await evaluate(`({declared:chrome.runtime.getManifest().host_permissions.filter(origin=>origin.includes('autolookout.net')),grantedAPIAvailable:!!chrome.permissions?.contains})`)))
 for(const test of cases)for(const mode of ['error','follow']){
  network.length=0
  const result=await evaluate(`(async()=>{const started=performance.now();try{const response=await fetch(${JSON.stringify(test.url)},{credentials:'include',redirect:${JSON.stringify(mode)},referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),cache:'no-store'});const bytes=new Uint8Array(await response.arrayBuffer());let dimensions;try{const image=await createImageBitmap(new Blob([bytes]));dimensions={width:image.width,height:image.height};image.close()}catch{}const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');return {ok:response.ok,status:response.status,origin:new URL(response.url).origin,redirected:response.redirected,mime:response.headers.get('content-type'),sha256:hash,dimensions,bytes:bytes.length,jpeg:bytes[0]===255&&bytes[1]===216&&bytes[2]===255,png:[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b),ms:Math.round(performance.now()-started)}}catch(error){return {ok:false,errorName:error?.name,ms:Math.round(performance.now()-started)}}})()`)
  console.log('EDGE_REAL_CDN '+JSON.stringify({fixture:test.fixture,source:test.kind,protocol:new URL(test.url).protocol,redirectMode:mode,...result,network:[...network]}))
 }
}finally{socket?.close();chrome?.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
