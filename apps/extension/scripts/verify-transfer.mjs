import {readEdgeRealFixtures} from './edge-real-fixtures.mjs'
import {edgeBenchmarkAsset} from './edge-benchmark-assets.mjs'
import { buildReactFixture } from '../../../packages/parsers/tests/build-react-fixture.mjs'
// Runs the built, unpacked MV3 extension with REAL Chrome messaging/storage APIs.
// Auction/destination requests use sanitized fixtures; AUTO_EDGE_REAL_CDN permits only real EDGE CDN photos.
// The MyAuto form/server is simulated; this is not an authenticated live-site test.
import assert from 'node:assert/strict'
import { spawn,execFileSync } from 'node:child_process'
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const extensionDist=process.env.AUTO_EXTENSION_DIST ?? join(root,'apps/extension/dist')
for(const file of await readdir(join(extensionDist,'assets'))){
  if(file.endsWith('.js'))assert.ok(!(await readFile(join(extensionDist,'assets',file),'utf8')).includes('vite:preloadError'),'Built extension never dispatches website-global Vite preload errors')
}
const stressTabs=Number(process.env.AUTO_STRESS_TABS??0)
const stressLegacy=stressTabs?await readFile(join(root,'packages/parsers/tests/fixtures/manheim24.html'),'utf8'):''
const stressRegular=stressTabs?await readFile(join(root,'packages/parsers/tests/fixtures/search-manheim.html'),'utf8'):''
const edgeTest=process.env.AUTO_EDGE_TEST==='1'
const edgeHeld=edgeTest&&process.env.AUTO_EDGE_HOLD_GALLERY==='1'
const edge28=edgeTest&&process.env.AUTO_EDGE_28==='1'
const edgeReal=edgeTest&&process.env.AUTO_EDGE_REAL_CDN==='1'
const realFixtures=edgeReal?readEdgeRealFixtures():undefined
const edgeRuntime=edgeTest&&process.env.AUTO_EDGE_RUNTIME==='1'
const edgeTrials=edgeTest?Number(process.env.AUTO_EDGE_TRIALS??1):1
assert.ok(Number.isInteger(edgeTrials)&&edgeTrials>=1&&edgeTrials<=5)
const edgeSpeed=edgeTest&&process.env.AUTO_EDGE_SPEED==='1'
const edgeRuntimeUnique=edgeRuntime&&process.env.AUTO_EDGE_RUNTIME_UNIQUE_COUNT?Number(process.env.AUTO_EDGE_RUNTIME_UNIQUE_COUNT):undefined
assert.ok(edgeRuntimeUnique===undefined||Number.isInteger(edgeRuntimeUnique)&&edgeRuntimeUnique>=1&&edgeRuntimeUnique<=15)
const edgePhotoCount=edgeSpeed&&process.env.AUTO_EDGE_PHOTO_COUNT?Number(process.env.AUTO_EDGE_PHOTO_COUNT):undefined
assert.ok(edgePhotoCount===undefined||[1,5,10,15,23].includes(edgePhotoCount))
const edgeRuntimeDuplicates=edgeRuntime&&process.env.AUTO_EDGE_RUNTIME_DUPLICATES==='1'
const snapshot24=process.env.AUTO_24_SNAPSHOT==='1'
const search24Test=process.env.AUTO_24_SEARCH_TEST==='1'
const searchTest=process.env.AUTO_SEARCH_TEST==='1'
const siteTest=process.env.AUTO_SITE_TEST==='1'
const sourceHost=edgeTest?'www.edgepipeline.com':search24Test?'search.manheim24.com':searchTest?'search.manheim.com':siteTest?'site.manheim.com':'home.manheim24.com'
const expectedSource=edgeTest?'EdgePipeline':search24Test?'Manheim24Search':searchTest?'ManheimSearch':siteTest?'ManheimSite':'Manheim24'
const locationTest=process.env.AUTO_LOCATION_TEST==='1'
const specificationTest=process.env.AUTO_SPEC_TEST==='1'
let sourceA=(await readFile(join(root,'packages/parsers/tests/fixtures/'+(edgeTest?(edge28?'edge-28.html':'edge-gasoline.html'):snapshot24?'manheim24-search-snapshot.html':searchTest?'search-manheim.html':'manheim24.html')),'utf8')).replace('&quot;equipment&quot;: null',specificationTest?'&quot;equipment&quot;: [&quot;Right Hand Drive&quot;]':'&quot;equipment&quot;: null')
let sourceB=edgeTest?await readFile(join(root,'packages/parsers/tests/fixtures/edge-electric.html'),'utf8'):snapshot24?sourceA.replaceAll('1HGCM82633A004352','2HGCM82633A004352').replaceAll('X3','X4').replaceAll('/vehicle/','/next-vehicle/').replaceAll('fixture-search24-primary','fixture-search24-primary-b'):searchTest?sourceA.replaceAll('SALKZ9F90RA229948','2HGCM82633A004352').replaceAll('Range Rover','Range Rover Sport').replaceAll('fixture-search-','fixture-search-b-'):sourceA.replaceAll('1HGCM82633A004352','2HGCM82633A004352').replaceAll('1HGCM82633 A004352','2HGCM82633 A004352').replaceAll('M5 Touring Wagon','M3 Touring').replaceAll('&quot;M5&quot;','&quot;M3&quot;').replaceAll('"M5"','"M3"').replaceAll('/fixture/','/fixture-b/')
if(edgeReal){sourceA=realFixtures[edge28?2:0].replace(sourceA);sourceB=realFixtures[1].replace(sourceB)}
const form=await readFile(join(root,'packages/parsers/tests/fixtures/myauto.html'),'utf8')
const png='iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAA+UlEQVR4nO3RQQ0AIAzAwJlBGfIxgYw9ekkFNLk592mxWT+IBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtPnAWxWXIaEEjAAAAAElFTkSuQmCC'
const lazyPhotosTest=process.env.AUTO_LAZY_PHOTOS_TEST==='1'
const prefetchTest=process.env.AUTO_PREFETCH_TEST==='1'
const reactTest=process.env.AUTO_REACT_TEST==='1'
const rhfTest=reactTest && !!process.env.AUTO_RHF_MODULE
const mechanismOnly=process.env.AUTO_MECHANISM_ONLY==='1'
const batchTest=reactTest && process.env.AUTO_BATCHED_TEST==='1'
const reactFixture=reactTest?await buildReactFixture():''
let photoRequests=0,activePhotoRequests=0,peakPhotoRequests=0,controlledDestinations=false
const edgeRuntimeScript=edgeReal&&process.env.AUTO_EDGE_REAL_DOM_ONLY==='1'?'':edgeReal?`<script>window.jQuery=()=>({on:(events,callback)=>{window.fixtureEdgeSubscriptions=(window.fixtureEdgeSubscriptions||0)+1;window.fixtureEdgeNotify=callback},data:()=>({data:document.querySelector('meta[property="og:url"]').content.endsWith('a'.repeat(32))?${JSON.stringify(realFixtures?.[edge28?2:0].runtime)}:${JSON.stringify(realFixtures?.[1].runtime)}})})</script>`:(edgeRuntime?`<script>${edgePhotoCount?"document.querySelector('#vdp .fotorama__nav__shaft')?.remove();document.querySelector('#vdp .slide-counts > span:last-child').textContent="+edgePhotoCount+";":''}window.jQuery=()=>({data:()=>({data:Array.from({length:document.querySelector('meta[property="og:url"]').content.endsWith('a'.repeat(32))?(${edgePhotoCount??0}||document.querySelectorAll('#vdp .fotorama__nav__frame--thumb').length||1):1},(_,i)=>({full:'https://file3.autolookout.net/runtime/'+document.querySelector('meta[property="og:url"]').content.split('/').pop()+'-'+${edgeRuntimeUnique?'i%'+edgeRuntimeUnique:edgeRuntimeDuplicates?'Math.max(0,i-1)':'i'}+'.jpg'}))})})</script>`:'')
const edgeHeldScript=`<script>(()=>{const gallery=document.querySelector('#vdp .gallery');const html=gallery.innerHTML;gallery.innerHTML='';window.fixtureRestoreEdgePhotos=()=>{gallery.innerHTML=html}})()</script>`
let source=sourceA+edgeRuntimeScript+(edgeHeld?edgeHeldScript:''),model=edgeTest?'2-Series':snapshot24?'X3 Sports Activity Vehicle xDrive30i':searchTest?'Range Rover SV':'M5 Touring Wagon',locationLabel='აშშ'
const timingScript=`<script>addEventListener('input',event=>{const input=event.target;if(!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.type==='hidden' || input.type==='search' || !input.value || !(input.name?.startsWith('primaryFeatures.') || input.dataset.testid==='description-textarea'))return;window.fixtureFirstFieldAt ??=Date.now();if(input.name==='primaryFeatures.mileage')window.fixtureMileageAt ??=Date.now()},true)</script>`
function destination() {
  // Only this local fixture has these synthetic options/IDs and upload acknowledgments.
  if(reactTest)return '<!doctype html><meta charset="utf-8"><body>'+timingScript+'<script>window.fixtureConfiguration='+JSON.stringify({edgePhotos:edgeTest,model,mileageUnit:edgeTest||searchTest||search24Test||siteTest?'mi':undefined,make:edgeTest&&source===sourceB?'Tesla':searchTest?'Land Rover':'BMW',year:edgeTest?(source===sourceB?'2024':'2026'):snapshot24?'2021':searchTest?'2024':'2026',engine:snapshot24?'2.0':'4.4',cylinders:edgeTest?'6':snapshot24?'4':'8',fuel:edgeTest?(source===sourceB?'ელექტრო':'ბენზინი'):searchTest||snapshot24?'ბენზინი':'დამუხტვადი ჰიბრიდი',body:edgeTest?(source===sourceB?'პიკაპი':'კუპე'):searchTest||snapshot24?'ჯიპი':'უნივერსალი',locationLabel,batchedValidation:batchTest,resetAfterUpload:true,pointerOnly:true,failFuel:false})+';</script><script>'+reactFixture.replaceAll('</script','<\\/script')+'</script>'
  return form+timingScript+`<script>
    window.fixtureFailFuel=false;window.fixtureOpenCounts={};
    const labels={manufacturer:'BMW',model:${JSON.stringify(model)},issueYear:'2026',fuelType:'დამუხტვადი ჰიბრიდი',engineVolume:'4.4',cylinders:'8',vehicleCategory:'უნივერსალი'};
    const modelTrigger=document.querySelector('[data-testid="single-select-trigger-primaryFeatures.model"]');modelTrigger.setAttribute('aria-disabled','true');
    for(const [key,label] of Object.entries(labels)) {
      const owner=document.querySelector('[data-testid="single-select-primaryFeatures.'+key+'"]');
      const trigger=owner.querySelector('[data-testid^="single-select-trigger-"]');trigger.tabIndex=0;
      const search=document.createElement('input');search.type='hidden';search.dataset.testid='single-select-search-primaryFeatures.'+key;owner.append(search);
      let list;
      const close=()=>{list?.remove();list=undefined;trigger.setAttribute('aria-expanded','false');search.type='hidden';};
      const populate=()=>{
        if(!list)return;list.replaceChildren();if(key==='fuelType' && window.fixtureFailFuel)return;
        if(search.value && !label.toLowerCase().includes(search.value.toLowerCase()))return;
        const item=document.createElement('div');item.setAttribute('role','option');item.textContent=label;list.append(item);
        item.onclick=()=>{
          owner.querySelector('[data-testid^="single-select-value-"]').textContent=label;
          owner.querySelector('[data-testid^="single-select-input-"]').value='fixture-'+key;
          close();if(key==='manufacturer')setTimeout(()=>modelTrigger.removeAttribute('aria-disabled'),40);
        };
      };
      trigger.onclick=()=>{
        if(list){close();return;}window.fixtureOpenCounts[key]=(window.fixtureOpenCounts[key] ?? 0)+1;if(trigger.getAttribute('aria-disabled')==='true')return;
        list=document.createElement('div');list.id='fixture-portal-'+key;list.setAttribute('role','listbox');document.body.append(list);
        trigger.setAttribute('aria-owns',list.id);trigger.setAttribute('aria-expanded','true');search.type='search';search.value='';setTimeout(populate,25);
      };
      search.addEventListener('input',populate);trigger.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
    }
    for(const control of document.querySelectorAll('[data-testid^="single-checkbox-primaryFeatures."]'))control.onclick=()=>{control.querySelector('input').value=control.dataset.testid.split('-').at(-1)};
    const input=document.querySelector('[data-testid="photo-video-dropzone"] input[type="file"]');
    input.addEventListener('change',()=>{
      const container=document.querySelector('[data-testid="photo-video-container"]');
      container.querySelector('.fixture-photo-count').textContent='ფოტო '+input.files.length+'/15';
      for(let i=0;i<input.files.length;i++){
        const img=document.createElement('img');img.src='https://cdn.example.test/'+input.files[i].name;container.append(img);
      }
    });
  </script>`
}
const benchmark=process.env.AUTO_BENCHMARK ?? ''
let workerSession,sourceSessionForDiagnostics
if(edgeSpeed){
  for(const html of [sourceA,sourceB])for(const match of html.matchAll(/(?:src|data-src)="(\/\/file3\.autolookout\.net\/[^" ]+)"/g))edgeBenchmarkAsset('https:'+match[1])
  for(const [id,count] of [['a',Math.min(edgePhotoCount??15,15)],['b',1]])for(let index=0;index<count;index++)edgeBenchmarkAsset('https://file3.autolookout.net/runtime/'+id.repeat(32)+'-'+index+'.jpg')
}
const profile=await mkdtemp(join(tmpdir(),'auto-importer-mv3-'))
let chromeProcess,socket
try {
  const endpoint=await new Promise((resolve,reject)=>{
    chromeProcess=spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',...(edgeSpeed&&process.env.AUTO_EDGE_DISABLE_BFCACHE==='1'?['--disable-features=BackForwardCache']:[]),...(rhfTest?['--window-size=1280,900']:[]),'--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking',...(edgeReal?[]:['--host-resolver-rules=MAP * ~NOTFOUND']),'--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']})
    let stderr='';const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),15000)
    chromeProcess.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1])}})
    chromeProcess.on('error',reject)
  })
  socket=new WebSocket(endpoint)
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  let nextId=0
  const photoMarkers=[]
  const pending=new Map(),sessions=new Map(),failures=[],networkDownloads=[],networkPending=new Map()
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))})
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data)
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task?.reject(new Error(message.error.message)):task?.resolve(message.result);return}
    if(edgeReal&&message.method==='Runtime.consoleAPICalled'&&message.params.args?.[0]?.value==='[Auto Importer photo checkpoint]'){
      const object=message.params.args[1],preview=new Map((object?.preview?.properties??[]).map(property=>[property.name,property.value]))
      if(object?.objectId&&['PHOTO_SOURCE_READY','PHOTO_URLS_EXTRACTED'].includes(preview.get('stage')))void command('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){return {id:this.transferId,stage:this.stage,count:this.photoCount,timestamp:this.timestamp}}',returnByValue:true},message.sessionId).then(result=>{const marker=result.result?.value;if(marker&&/^[a-f0-9-]{36}$/.test(marker.id)&&marker.count>0&&marker.count<=1000&&Number.isFinite(Date.parse(marker.timestamp)))photoMarkers.push(marker)}).catch(()=>{})
    }
    if(edgeSpeed&&message.sessionId===workerSession&&message.method==='Network.requestWillBeSent'){
      try{if(new URL(message.params.request.url).hostname==='file3.autolookout.net')networkPending.set(message.params.requestId,message.params.timestamp)}catch{/* Not a photo. */}
    }
    if(edgeSpeed&&message.sessionId===workerSession&&message.method==='Network.loadingFinished'&&networkPending.has(message.params.requestId)){
      networkDownloads.push({start:networkPending.get(message.params.requestId),end:message.params.timestamp,bytes:message.params.encodedDataLength});networkPending.delete(message.params.requestId)
    }
    if(edgeSpeed&&message.sessionId===sourceSessionForDiagnostics&&message.method==='Runtime.consoleAPICalled'&&message.params.args?.[0]?.value==='EDGE_BFCACHE_PAGEHIDE')console.log('EDGE_BFCACHE '+JSON.stringify({persisted:message.params.args[1]?.value}))
    if(message.method==='Runtime.exceptionThrown')failures.push('Unexpected fixture runtime exception')
    if(message.method==='Fetch.requestPaused')void (async()=>{
      const {requestId,request,resourceType}=message.params
      const url=new URL(request.url),main=resourceType==='Document'
      if(message.sessionId===workerSession && !main){photoRequests++;activePhotoRequests++;peakPhotoRequests=Math.max(peakPhotoRequests,activePhotoRequests)}
      if(edgeReal&&['file3.autolookout.net','dxbrs3zlwqu4z.cloudfront.net'].includes(url.hostname)){await command('Fetch.continueRequest',{requestId},message.sessionId);return}
      if(benchmark && message.sessionId===workerSession && !main)await new Promise(resolve=>setTimeout(resolve,120))
      const lazyScript=`<script>(()=>{const node=document.querySelector('.StockWaveInfo'),gallery=document.querySelector('#fyusion-prism-viewer'),data=JSON.parse(node.textContent);const saved={images:data.images,mainImage:data.mainImage,html:gallery.innerHTML};data.images=[];delete data.mainImage;node.textContent=JSON.stringify(data);gallery.innerHTML='';window.fixtureRestorePhotos=()=>{const current=JSON.parse(node.textContent);current.images=saved.images;if(saved.mainImage)current.mainImage=saved.mainImage;node.textContent=JSON.stringify(current);gallery.innerHTML=saved.html}})()</script>`
      const html=(edgeSpeed&&url.hostname==='www.edgepipeline.com')?(url.pathname.endsWith('b'.repeat(32))?sourceB:sourceA)+edgeRuntimeScript:(stressTabs&&url.hostname==='home.manheim24.com'&&sourceHost!=='home.manheim24.com')?stressLegacy:(stressTabs&&url.hostname==='search.manheim.com'&&sourceHost!=='search.manheim.com')?stressRegular:(url.hostname===sourceHost&&url.pathname!=='/en/locations.html')?source+(lazyPhotosTest?lazyScript:''):url.hostname==='myauto.ge'?destination():url.hostname==='site.manheim.com'?'<h1>Find A Manheim Location</h1><img src="https://images.cdn.manheim.com/location-banner.jpg">':null
      await command('Fetch.fulfillRequest',{requestId,responseCode:main&&!html?404:200,responseHeaders:[{name:'Content-Type',value:main?'text/html; charset=utf-8':'image/png'}],body:main?Buffer.from(html ?? '').toString('base64'):edgeSpeed&&url.hostname==='file3.autolookout.net'?edgeBenchmarkAsset(request.url).base64:png},message.sessionId)
      if(message.sessionId===workerSession&&!main)activePhotoRequests--
    })().catch(()=>failures.push('Fixture request interception failed'))
    if(message.method==='Target.attachedToTarget')void (async()=>{
      const {sessionId,targetInfo}=message.params
      await command('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'http://*'}]},sessionId)
      await command('Runtime.enable',{},sessionId)
      sessions.set(targetInfo.targetId,sessionId)
      // tabs.create may begin its first request before the CDP target event arrives.
      // Restart that navigation while scripts are paused and interception is installed.
      if(targetInfo.url==='https://myauto.ge/ka/add') {
        await command('Page.stopLoading',{},sessionId)
      }
      await command('Runtime.runIfWaitingForDebugger',{},sessionId)
      if(targetInfo.url==='https://myauto.ge/ka/add')await command('Page.navigate',{url:targetInfo.url},sessionId)
      if(edgeReal&&controlledDestinations&&['about:blank',''].includes(targetInfo.url))await command('Page.navigate',{url:'https://myauto.ge/ka/add'},sessionId)
    })().catch(()=>failures.push('Fixture target setup failed'))
  })
  const {id:extensionId}=await command('Extensions.loadUnpacked',{path:process.env.AUTO_EXTENSION_DIST ?? join(root,'apps/extension/dist')})
  const wait=async(predicate,label)=>{for(let attempt=0;attempt<400;attempt++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Timed out: '+label)}
  let worker
  await wait(async()=>{worker=(await command('Target.getTargets')).targetInfos.find(target=>target.type==='service_worker'&&target.url.includes(extensionId));return !!worker},'extension worker')
  ;({sessionId:workerSession}=await command('Target.attachToTarget',{targetId:worker.targetId,flatten:true}))
  await command('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'http://*'}]},workerSession)
  await command('Runtime.enable',{},workerSession)
  if(edgeSpeed)await command('Network.enable',{},workerSession)
  await command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page',exclude:false},{exclude:true}]})
  const {targetId:sourceId}=await command('Target.createTarget',{url:'about:blank'})
  await wait(()=>sessions.has(sourceId),'source target instrumentation')
  const sourceSession=sessions.get(sourceId);sourceSessionForDiagnostics=sourceSession
  const evaluate=async(sessionId,expression)=>{
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId)
    assert.ok(!result.exceptionDetails,'Fixture evaluation has no exception')
    return result.result.value
  }
  if(edgeSpeed)for(const target of (await command('Target.getTargets')).targetInfos)if(target.type==='page'&&target.targetId!==sourceId&&target.url==='about:blank')await command('Target.closeTarget',{targetId:target.targetId})
  const stressIdleTargets=new Set()
  let stressMyautoTabs=0
  if(stressTabs){
    assert.ok(Number.isInteger(stressTabs)&&stressTabs>=1&&stressTabs<=30)
    for(let index=1;index<stressTabs;index++){
      const url=edgeSpeed?(index%3===0?'https://myauto.ge/ka/add':'https://www.edgepipeline.com/components/vehicle/detail/'+(index%2?'a':'b').repeat(32)):index%3===0?'https://myauto.ge/ka/add':index%3===1?'https://home.manheim24.com/landingPage#/results/stress':'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE'
      const {targetId}=await command('Target.createTarget',{url:'about:blank',background:true})
      stressIdleTargets.add(targetId);if(url==='https://myauto.ge/ka/add')stressMyautoTabs++
      await wait(()=>sessions.has(targetId),'stress tab instrumentation')
      await command('Page.navigate',{url},sessions.get(targetId))
      await wait(()=>evaluate(sessions.get(targetId),"document.readyState==='complete'"),'stress page fixture')
    }
    assert.equal(photoRequests,0,'Inactive fixture tabs never download photos through the worker')
    console.log('PASS '+stressTabs+' real Chrome page targets: mixed source and ordinary MyAuto fixtures; no background photo downloads before transfer')
  }
  if(process.env.AUTO_PASSIVE_TEST==='1'){
    await evaluate(workerSession,`globalThis.fixtureClaims={};chrome.runtime.onMessage.addListener((message,sender)=>{if(message?.type==='TRANSFER_CLAIM')globalThis.fixtureClaims[sender.tab.id]=(globalThis.fixtureClaims[sender.tab.id]??0)+1})`)
    const {targetId}=await command('Target.createTarget',{url:'about:blank'})
    await wait(()=>sessions.has(targetId),'ordinary MyAuto target')
    const session=sessions.get(targetId)
    for(const path of ['/','/ka/s/','/ka/pr/fixture','/ka/login','/ka/add']){
      await command('Page.navigate',{url:'https://myauto.ge'+path},session)
      await wait(()=>evaluate(session,"document.readyState==='complete' && !!window.fixtureState"),'ordinary MyAuto '+path)
      const before=await evaluate(workerSession,`Object.values(globalThis.fixtureClaims).reduce((a,b)=>a+b,0)`)
      await evaluate(session,`(()=>{for(let i=0;i<20;i++){const n=document.createElement('span');document.body.append(n);n.remove()}})()`)
      await new Promise(resolve=>setTimeout(resolve,100))
      const after=await evaluate(workerSession,`Object.values(globalThis.fixtureClaims).reduce((a,b)=>a+b,0)`)
      assert.equal(after,before,'DOM changes do not trigger repeated claim scans')
      assert.ok(await evaluate(session,`window.fixtureState.values.vin==='' && window.fixtureState.values.mileage==='' && window.fixtureState.photos===0 && window.fixtureState.published===0 && !document.getElementById('auto-importer-error')`),'Ordinary MyAuto fixture remains untouched')
      console.log('PASS built passive MyAuto '+path+': no autofill, uploads, notice, publication or mutation-driven claim polling')
    }
    const claimsBeforeRefresh=await evaluate(workerSession,`Object.values(globalThis.fixtureClaims).reduce((a,b)=>a+b,0)`)
    await command('Page.reload',{},session)
    await wait(()=>evaluate(session,"document.readyState==='complete' && !!window.fixtureState"),'ordinary MyAuto refresh')
    assert.equal(await evaluate(workerSession,`Object.values(globalThis.fixtureClaims).reduce((a,b)=>a+b,0)`),claimsBeforeRefresh,'Reload does not even probe for an old transfer')
    assert.ok(await evaluate(session,`window.fixtureState.values.vin==='' && window.fixtureState.photos===0 && !document.getElementById('auto-importer-error')`),'Ordinary refresh remains passive')
    await command('Target.closeTarget',{targetId})
  }
  if(process.env.AUTO_SOURCE_GATES_TEST==='1'){
    await command('Page.navigate',{url:'https://site.manheim.com/en/locations.html'},sourceSession)
    await wait(()=>evaluate(sourceSession,`document.readyState==='complete' && document.querySelector('h1')?.textContent==='Find A Manheim Location'`),'informational Manheim page')
    assert.ok(await evaluate(sourceSession,`!document.getElementById('global-auto-transporter-launcher')`),'Informational Manheim page has no launcher or extension DOM')
    assert.equal(photoRequests,0,'Informational page cannot trigger background photo downloads')
    assert.ok(await evaluate(workerSession,`(async()=>{const data=await chrome.storage.session.get(null);return !Object.keys(data).some(k=>k.startsWith('job:'))})()`),'Informational page cannot create a vehicle transfer')
    console.log('PASS built informational locations gate: no launcher, transfer record or background image downloads despite a CDN page image')
  }
  if(batchTest){
    const {targetId}=await command('Target.createTarget',{url:'about:blank'})
    await wait(()=>sessions.has(targetId),'batched React preflight target')
    const session=sessions.get(targetId)
    await command('Target.activateTarget',{targetId})
    await command('Page.navigate',{url:'https://myauto.ge/ka/add'},session)
    await wait(()=>evaluate(session,'!!window.fixtureState'),'controlled React preflight')
    await evaluate(session,`(()=>{const input=document.querySelector('[name="primaryFeatures.mileage"]');const peer=document.querySelector('[data-testid="description-textarea"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'12345');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();peer.focus();peer.blur()})()`)
    await new Promise(resolve=>setTimeout(resolve,100))
    assert.ok(await evaluate(session,`window.fixtureState.values.mileage==='' && document.querySelector('[name="primaryFeatures.mileage"]').value===''`),'Old synchronous blur/peer-blur reproduces lost state in real React fixture')
    await command('Target.closeTarget',{targetId})
    console.log('PASS real React regression: old same-task blur/peer-blur loses mileage before transfer')
  }
  if(rhfTest){
    const {targetId}=await command('Target.createTarget',{url:'about:blank'})
    await wait(()=>sessions.has(targetId),'RHF mechanism target')
    const session=sessions.get(targetId)
    await command('Target.activateTarget',{targetId});await command('Page.navigate',{url:'https://myauto.ge/ka/add'},session)
    await wait(()=>evaluate(session,`!!window.fixtureState && getComputedStyle(document.querySelector('[name="primaryFeatures.mileage"]')).visibility==='visible'`),'real RHF interactive control')
    await evaluate(session,`(()=>{const input=document.querySelector('[name="primaryFeatures.mileage"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'12345');input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'12345'}))})()`)
    await wait(()=>evaluate(session,`window.fixtureState.values.mileage==='12345'`),'RHF mileage committed through native input')
    await evaluate(session,`document.querySelector('[name="primaryFeatures.mileage"]').focus();document.getElementById('fixture-other-field').click();window.fixtureForceRender()`)
    await new Promise(resolve=>setTimeout(resolve,50))
    assert.ok(await evaluate(session,`window.fixtureState.values.mileage==='12345' && document.querySelector('[name="primaryFeatures.mileage"]').defaultValue==='12345'`),'Public RHF controlled mileage survives peer interaction and rerender')
    await evaluate(session,`document.querySelector('[data-testid="single-select-trigger-primaryFeatures.manufacturer"]').click()`)
    await wait(()=>evaluate(session,`!!document.querySelector('[data-testid="single-select-option-primaryFeatures.manufacturer-fixture-manufacturer"]')`),'actual named manufacturer option')
    await evaluate(session,`document.querySelector('[data-testid="single-select-option-primaryFeatures.manufacturer-fixture-manufacturer"]').click()`)
    await wait(()=>evaluate(session,`window.fixtureState.selected.manufacturer?.id==='fixture-manufacturer'`),'manufacturer public controller commit')
    assert.ok(await evaluate(session,`document.querySelector('[data-testid="single-select-input-primaryFeatures.manufacturer"]').value==='' && !!document.querySelector('[data-testid="single-select-clear-primaryFeatures.manufacturer"]')`),'Registration ref stays empty despite committed manufacturer; old ID predicate is invalid')
    await command('Target.closeTarget',{targetId})
    console.log('PASS actual public RHF mechanisms: mileage input commit survives rerender; named manufacturer option commits while ref.value remains empty')
  }
  const shadow=`document.getElementById('global-auto-transporter-launcher')?.shadowRoot`
  await command('Page.navigate',{url:edgeTest?'https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32):'https://'+sourceHost+(searchTest||search24Test?'/results':siteTest?'/inventory/selected':'/landingPage')+(search24Test?'#/details/1HGCM82633A004352/OVE':searchTest?'#/details/SALKZ9F90RA229948/OVE':'#/results/fixture-a')},sourceSession)
  await wait(()=>evaluate(sourceSession,`!!${shadow}?.querySelector('.launcher')`),'injected launcher')
  if(process.env.AUTO_REGULAR_LIFECYCLE_TEST==='1'){
    assert.ok(siteTest||searchTest,'Regular lifecycle fixture cannot alter Manheim24')
    await wait(()=>evaluate(sourceSession,`!${shadow}.querySelector('.launcher').disabled`),'regular initial preparation')
    await evaluate(sourceSession,`dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))`)
    assert.ok(await evaluate(sourceSession,`!document.getElementById('global-auto-transporter-launcher')`),'BFCache suspension removes the regular launcher')
    await evaluate(sourceSession,`dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`)
    await wait(()=>evaluate(sourceSession,`!!${shadow}?.querySelector('.launcher') && !${shadow}.querySelector('.launcher').disabled`),'regular BFCache restoration')
    await evaluate(sourceSession,`history.pushState({},'',location.pathname+'?auto-importer-fixture=1'+location.hash)`)
    await wait(()=>evaluate(sourceSession,`!!${shadow}?.querySelector('.launcher') && !${shadow}.querySelector('.launcher').disabled`),'regular History API route revalidation')
    assert.equal(await evaluate(sourceSession,`document.querySelectorAll('#global-auto-transporter-launcher').length`),1,'Regular navigation never duplicates the launcher')
    console.log('PASS regular launcher BFCache lifecycle and History API query navigation without overriding website APIs')
  }
  if(locationTest)await evaluate(workerSession,`chrome.storage.local.set({'auto-importer:listing-location:v1':'აშშ'})`)
  const memory=async(stage)=>{
    if(!edgeSpeed)return
    if(process.env.AUTO_EDGE_CLEAR_CONSOLE==='1'){await command('Runtime.discardConsoleEntries',{},sourceSession);await command('Runtime.discardConsoleEntries',{},workerSession)}
    await command('HeapProfiler.collectGarbage',{},sourceSession);await command('HeapProfiler.collectGarbage',{},workerSession)
    const sourceHeap=await command('Runtime.getHeapUsage',{},sourceSession),workerHeap=await command('Runtime.getHeapUsage',{},workerSession),dom=await command('Memory.getDOMCounters',{},sourceSession)
    const processes=execFileSync('ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)),owned=new Set([chromeProcess.pid])
    let changed=true;while(changed){changed=false;for(const [pid,parent] of processes)if(owned.has(parent)&&!owned.has(pid)){owned.add(pid);changed=true}}
    const rssKB=processes.filter(([pid])=>owned.has(pid)).reduce((sum,[,,rss])=>sum+rss,0)
    const tabs=(await command('Target.getTargets')).targetInfos.filter(t=>t.type==='page').length
    console.log('EDGE_MEMORY '+JSON.stringify({stage,baselineTabs:stressTabs||1,actualTabs:tabs,chromeProcesses:owned.size,rssKB,sourceDocuments:dom.documents,sourceNodes:dom.nodes,sourceListeners:dom.jsEventListeners,sourceHeap:sourceHeap.usedSize,workerHeap:workerHeap.usedSize}))
  }
  if(edgeReal){
    // Test-only navigation gate: CDP can attach after an initial navigation has
    // begun. Create a real blank Chrome tab, install interception, then navigate
    // once to the fixture. Never send synthetic data to live MyAuto or discard
    // a document after it has claimed a job. Production tabs.create is untouched.
    await evaluate(workerSession,`(()=>{const create=chrome.tabs.create.bind(chrome.tabs);chrome.tabs.create=options=>create(options?.url==='https://myauto.ge/ka/add'?{...options,url:'about:blank'}:options)})()`)
    controlledDestinations=true
  }
  const preloadStatus=()=>evaluate(workerSession,`(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('auto-importer-edge-preload-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('preload db'))});try{const read=name=>new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('preload read'))});const [contexts,photos,jobs]=await Promise.all(['contexts','photos','bindings'].map(read));return {contexts:contexts.map(c=>({id:c.id,sourceTab:c.sourceTab,consumed:c.consumed,known:c.vehicle.images.length,prepared:photos.filter(p=>p.owner===c.id).length,downloads:c.downloads,pageAt:c.pageAt,textReadyAt:c.textReadyAt,firstPhotoAt:c.firstPhotoAt,lastPhotoAt:c.lastPhotoAt,completedAt:c.completedAt,galleryComplete:c.galleryComplete})),jobs:jobs.map(({claimed,...rest})=>({...rest,claimedCount:claimed?.length??0}))}}finally{db.close()}})()`)
  const jobs=[]
  await memory('before')
  for(const [trial,name] of mechanismOnly?[]:Array.from({length:edgeTrials},(_,index)=>[[index,'A'],[index,'B']]).flat()) {
    if(edgeSpeed&&trial>0&&name==='A'){
      source=sourceA+edgeRuntimeScript;model='2-Series'
      await command('Page.navigate',{url:'https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32)},sourceSession)
      await wait(()=>evaluate(sourceSession,"!!document.getElementById('global-auto-transporter-launcher')?.shadowRoot?.querySelector('.launcher')"),'repeated EDGE source ready')
    }
    if(edgeSpeed&&process.env.AUTO_EDGE_DISABLE_BFCACHE==='1'&&name==='A')await evaluate(sourceSession,"addEventListener('pagehide',event=>console.info('EDGE_BFCACHE_PAGEHIDE',event.persisted),{once:true})")
    await command('Target.activateTarget',{targetId:sourceId})
    await wait(()=>evaluate(sourceSession,`!${shadow}.querySelector('.launcher').disabled`),'source action available '+name)
    const downloadsAtSelection=photoRequests,networkAtSelection=networkDownloads.length
    let sourceCounts=edgeSpeed?await evaluate(sourceSession,`(()=>{const start=performance.now(),root=document.querySelector('#vdp'),gallery=root.querySelector('.gallery'),node=root.querySelector('#auto-importer-edge-gallery-data');return {discovered:Number(node?.dataset.frameCount)||gallery.querySelectorAll('.fotorama__nav__frame--thumb').length||1,unique:Number(node?.dataset.uniqueCount)||0,domDiscoveryMs:performance.now()-start}})()`):undefined
    if(name==='B'){
      source=sourceB;model=edgeTest?'Cybertruck':snapshot24?'X4 Sports Activity Vehicle xDrive30i':searchTest?'Range Rover Sport SV':'M3 Touring';if(locationTest)locationLabel='თბილისი'
      if(edgeTest)await evaluate(sourceSession,`history.pushState({},'',${JSON.stringify('https://www.edgepipeline.com/components/vehicle/detail/'+'b'.repeat(32))});const next=new DOMParser().parseFromString(${JSON.stringify(sourceB)},'text/html');document.head.innerHTML=next.head.innerHTML;document.body.innerHTML=next.body.innerHTML`)
      else await evaluate(sourceSession,`document.body.innerHTML=new DOMParser().parseFromString(${JSON.stringify(sourceB)},'text/html').body.innerHTML;history.pushState({},'',${JSON.stringify(searchTest||search24Test?'#/details/2HGCM82633A004352/OVE':'#/results/fixture-b')})`)
    }
    if(prefetchTest){
      await wait(()=>evaluate(sourceSession,`${shadow}.querySelector('.dock').dataset.preparationState==='ready'`),'automatic preparation ready '+name)
      if(!edgeTest)assert.equal(photoRequests,downloadsAtSelection,'Prefetch never downloads full-resolution photos')
      if(edgeReal&&process.env.AUTO_EDGE_REAL_DOM_ONLY!=='1')assert.ok(await evaluate(sourceSession,`(()=>{const output=document.querySelector('#auto-importer-edge-gallery-data'),before=output?.textContent;if(!before||typeof window.fixtureEdgeNotify!=='function')return false;const subscriptions=window.fixtureEdgeSubscriptions;output.textContent='[]';window.fixtureEdgeNotify();window.fixtureEdgeNotify();return output.textContent===before&&subscriptions>=1&&window.fixtureEdgeSubscriptions===subscriptions})()`),'EDGE documented Fotorama load event refreshes dataset once without navigating gallery')
      if(edgeRuntime)assert.ok(await evaluate(sourceSession,`document.querySelector('#auto-importer-edge-gallery-data')?.textContent.includes('file3.autolookout.net/runtime/')`),'EDGE MAIN-world bridge supplies only verified runtime photo records to the isolated adapter')
      if(edgeRuntimeDuplicates)assert.ok(await evaluate(sourceSession,`(()=>{const node=document.querySelector('#auto-importer-edge-gallery-data'),data=JSON.parse(node.textContent);return data.length===${name==='A'?15:1}&&new Set(data.map(row=>row.full||row.img||row.thumb)).size===data.length})()`),'EDGE runtime duplicate frames are removed before the 15-photo bridge limit')
      assert.equal((await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add').length,jobs.filter(job=>!job.closed).length+stressMyautoTabs,'Prefetch never opens a listing tab')
    }
    if(locationTest && name==='B')await evaluate(workerSession,`chrome.storage.local.set({'auto-importer:listing-location:v1':'თბილისი'})`)
    await wait(()=>evaluate(sourceSession,`!${shadow}.querySelector('.launcher').disabled`),'verified vehicle action available '+name)
    if(process.env.AUTO_SOURCE_GATES_TEST==='1')assert.ok(await evaluate(workerSession,`(async()=>{const [tab]=await chrome.tabs.query({url:'https://${sourceHost}/*'});const result=await chrome.tabs.sendMessage(tab.id,{type:'VEHICLE_STATUS'});return result?.ok && result.value?.vehicle===true && result.value.source==='${expectedSource}'})()`),'Popup status handshake verifies the actual source vehicle without reading page images')
    if(edgeSpeed)sourceCounts=await evaluate(sourceSession,`(()=>{const start=performance.now(),root=document.querySelector('#vdp'),node=root.querySelector('#auto-importer-edge-gallery-data');return {discovered:Number(node?.dataset.frameCount)||0,unique:Number(node?.dataset.uniqueCount)||0,domDiscoveryMs:performance.now()-start}})()`)
    let preloadBefore
    if(edgeTest&&process.env.AUTO_EDGE_WAIT_PRELOAD==='1'){
      await wait(async()=>{const status=await preloadStatus();preloadBefore=status?.contexts.find(ctx=>!ctx.consumed&&ctx.known===(name==='A'?17:1));return preloadBefore&&preloadBefore.prepared===preloadBefore.known},'EDGE binary preload ready '+name)
      console.log('EDGE_PRELOAD_BEFORE '+JSON.stringify({vehicle:name,...preloadBefore}))
    }
    const benchmarkStarted=performance.now(),benchmarkEpoch=Date.now()
    await evaluate(sourceSession,`${shadow}.querySelector('.launcher').click();${shadow}.querySelector('.launcher').click()`)
    assert.ok(await evaluate(sourceSession,`!${shadow}.querySelector('.vehicle-review,.review-actions,[aria-modal="true"]')`),'No confirmation UI required')
    let job,inspected=false,photosRestored=false
    await wait(async()=>{
      job=await evaluate(workerSession,`(async()=>{const entries=await chrome.storage.session.get(null);const records=Object.entries(entries).filter(([key])=>key.startsWith('job:')).map(([,value])=>value);const job=records.find(record=>record.vehicle.model===${JSON.stringify(model)}&&!${JSON.stringify(jobs.map(previous=>previous.id))}.includes(record.id));return job?{id:job.id,createdAt:job.createdAt,destinationTabId:job.destinationTabId,stage:job.stage,status:job.status,uploaded:job.photos.uploaded,prepared:job.photos.prepared,submitted:job.photos.submitted??0,failed:job.photos.failed,total:job.photos.total,timings:job.timings,fields:job.fields,listingLocation:job.listingLocation,errors:job.errors,preparation:job.preparation}:null})()`)
      if(edgeHeld&&name==='A'&&!photosRestored&&job?.fields.some(field=>field.key==='mileageKm'&&field.persisted)){await evaluate(sourceSession,'window.fixtureRestoreEdgePhotos()');photosRestored=true}
      if(lazyPhotosTest && !photosRestored && job?.stage==='uploading' && job.total===0){await evaluate(sourceSession,'window.fixtureRestorePhotos()');photosRestored=true}
      if(reactTest && !inspected && job?.status==='running' && job.fields.some(field=>field.key==='mileageKm' && field.persisted) && job.uploaded<job.total){
        const target=(await command('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add'&&!stressIdleTargets.has(target.targetId)&&!jobs.some(previous=>previous.targetId===target.targetId))
        const session=target&&sessions.get(target.targetId)
        if(session){
          const point=await evaluate(session,`(()=>{const button=document.getElementById('fixture-other-field');button.scrollIntoView();const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`)
          await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},session)
          await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},session)
          inspected=true
        }
      }
      const notice=await evaluate(sourceSession,`${shadow}.querySelector('.notice')?.textContent ?? ''`)
      assert.ok(notice==='' || notice==='მონაცემების გადატანა დაიწყო','First-click start has no transfer error')
      return job?.status!=='running' && !!job?.destinationTabId
    },'destination receiver completion '+name).catch(async error=>{if(edgeReal){console.log('EDGE_WAIT_DIAGNOSTIC '+JSON.stringify({vehicle:name,job:job?{id:job.id,status:job.status,stage:job.stage,prepared:job.prepared,submitted:job.submitted,uploaded:job.uploaded}:null}));for(const target of (await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add'&&!stressIdleTargets.has(target.targetId))){const session=sessions.get(target.targetId);if(session)console.log('EDGE_DESTINATION_DIAGNOSTIC '+JSON.stringify(await evaluate(session,`({ready:document.readyState,fixtureState:!!window.fixtureState,mileageInputs:document.querySelectorAll('[name="primaryFeatures.mileage"]').length,fileInputs:document.querySelectorAll('input[type=file]').length,rootChildren:document.querySelector('#root')?.childElementCount??0})`)))}}throw error})
    if(edgeHeld&&name==='A')assert.ok(photosRestored,'EDGE text persisted before held gallery was released')
    if(locationTest)assert.ok(job.listingLocation?.label===locationLabel && job.listingLocation.source===('default'),'Durable default and explicit per-transfer override bind to the intended vehicle')
    if(lazyPhotosTest && name==='A')assert.ok(photosRestored && job.total===15,'Initially empty cached gallery refreshed for the same vehicle after form autofill')
    if(prefetchTest)assert.ok((edgeTest||job.preparation?.cacheHit) && job.preparation.extractedAt<=benchmarkEpoch,'Transfer reuses text prepared before the click')
    if(rhfTest && !searchTest && !snapshot24 && job.fields.filter(field=>field.status==='filled'&&field.persisted).length!==((specificationTest?19:18)))console.error('Field outcomes',job.fields.map(({key,status,code,reason})=>({key,status,code,reason})))
    if(rhfTest && !edgeTest && !searchTest && !snapshot24)assert.equal(job.fields.filter(field=>field.status==='filled'&&field.persisted).length,(specificationTest?19:18),'Supported fields persist; the deliberate fuel failure and manual fields stay isolated')
    const benchmarkTotal=performance.now()-benchmarkStarted
    if(preloadBefore){const status=await preloadStatus();const binding=status.jobs.find(row=>row.id===job.id);assert.ok(binding&&binding.served===job.uploaded,'Prepared EDGE binaries delivered through existing uploader without downloading again');console.log('EDGE_PRELOAD_RESULT '+JSON.stringify({vehicle:name,...binding,textMs:binding.textReadyAt-binding.pageAt,firstPhotoMs:binding.firstPhotoAt-binding.pageAt,uploaded:job.uploaded}))}

    if(job.uploaded!==(edgeTest?Math.min(job.total,15):job.total)){console.error('Transfer verification errors',job.errors);if(edgeReal){for(const target of (await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add')){const session=sessions.get(target.targetId);if(session)console.log('EDGE_DESTINATION_DIAGNOSTIC '+JSON.stringify(await evaluate(session,`({ready:document.readyState,fixtureState:!!window.fixtureState,mileageInputs:document.querySelectorAll('[name="primaryFeatures.mileage"]').length,fileInputs:document.querySelectorAll('input[type=file]').length,rootChildren:document.querySelector('#root')?.childElementCount??0})`)))}}}
    if(edgeTest&&job.total>15&&job.uploaded===15)console.log('EDGE_DESTINATION_LIMIT '+JSON.stringify({sourceAvailable:job.total,limit:15,accepted:job.uploaded,skipped:job.total-job.uploaded}))
    assert.equal(job.uploaded,edgeTest?Math.min(job.total,15):job.total,'Automatic photo transport and upload acknowledgment complete')
    assert.ok(job.total>0)
    if(edgeSpeed){assert.equal(job.total,name==='A'?Math.min(edgePhotoCount??edgeRuntimeUnique??15,15):1);assert.equal(photoRequests-downloadsAtSelection,job.total,'No duplicate download requests in a successful trial')}
    const tabs=(await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add'&&!stressIdleTargets.has(target.targetId))
    assert.equal(tabs.length,jobs.filter(job=>!job.closed).length+1,'Each new vehicle opens an independent destination')
    const destinationTarget=tabs.find(target=>!jobs.some(previous=>previous.targetId===target.targetId))
    const destinationSession=sessions.get(destinationTarget.targetId)
    const network=networkDownloads.slice(networkAtSelection),fetchWallMs=network.length?1000*(Math.max(...network.map(p=>p.end))-Math.min(...network.map(p=>p.start))):undefined
    if(benchmark)console.log('BENCHMARK '+JSON.stringify({version:benchmark,platform:expectedSource,vehicle:name,trial:trial+1,baselineTabs:stressTabs||1,photoCountScenario:edgePhotoCount??'supplied',transferId:job.id,vehicleId:'synthetic-edge-'+name,sourceCounts,prepared:job.prepared,submitted:job.submitted,accepted:job.uploaded,failed:job.failed,fetchWallMs,fetchCompleted:network.length,slowestStage:Object.entries(job.timings??{}).filter(([stage])=>['photoDownload','photoUpload','formFilling','uploaderReadiness','finalValidation'].includes(stage)).sort((a,b)=>b[1]-a[1])[0]?.[0],peakPhotoRequests,photosDownloaded:photoRequests-downloadsAtSelection,photosVerified:job.uploaded,totalMs:benchmarkTotal,clickToFormReadyMs:job.createdAt-benchmarkEpoch+(job.timings?.destinationReadiness ?? 0),clickToPhotosMs:job.timings?.photoComplete===undefined?undefined:job.createdAt-benchmarkEpoch+job.timings.photoComplete,firstDomFieldMs:(await evaluate(destinationSession,'window.fixtureFirstFieldAt'))-benchmarkEpoch,firstMileageMs:(await evaluate(destinationSession,'window.fixtureMileageAt'))-benchmarkEpoch,verifiedFields:job.fields.filter(field=>field.status==='filled'&&field.persisted).length,preparation:job.preparation,stages:job.timings}))
    assert.ok(await evaluate(destinationSession,`(()=>{
      const vin=document.querySelector('[name="primaryFeatures.vinCode"]').value;
      const description=document.querySelector('[data-testid="description-textarea"]').value;
      return vin.length===17 && !description.includes(vin) && description==='' && document.querySelector('[data-testid="single-select-value-primaryFeatures.model"]').textContent===${JSON.stringify(model)} && document.querySelector('[data-testid="single-select-value-primaryFeatures.manufacturer"]').textContent===${JSON.stringify(edgeTest&&name==='B'?'Tesla':searchTest?'Land Rover':'BMW')} && !!document.querySelector('[name="primaryFeatures.mileage"]').value && ${JSON.stringify(edgeTest?(name==='A'?['issueYear','fuelType','cylinders']:['issueYear','fuelType']):['issueYear','fuelType','engineVolume','cylinders'])}.every(key=>${rhfTest?"window.fixtureState.selected[key]?.id==='fixture-'+key":"document.querySelector('[data-testid='+JSON.stringify('single-select-input-primaryFeatures.'+key)+']').value==='fixture-'+key"}) && !document.getElementById('auto-importer-results') && !document.querySelector('[role=dialog]');
    })()`),'Dedicated VIN, exact model and mileage verified without a summary overlay')
    if(reactTest){
      assert.ok(inspected,'User can inspect a safe field while photos and form processing continue')
      await evaluate(destinationSession,`document.getElementById('fixture-other-field').click();window.fixtureForceRender()`)
      await new Promise(resolve=>setTimeout(resolve,100))
      assert.ok(await evaluate(destinationSession,`(()=>{
        const state=window.fixtureState;
        return state && state.values.vin===document.querySelector('[name="primaryFeatures.vinCode"]').value && state.values.vin.length===17 && state.values.mileage===document.querySelector('[name="primaryFeatures.mileage"]').value && !!state.values.mileage && state.values.description===document.querySelector('[data-testid="description-textarea"]').value && !state.values.description.includes(state.values.vin) && ${JSON.stringify(edgeTest?(name==='A'?['manufacturer','model','issueYear','fuelType','cylinders']:['manufacturer','model','issueYear','fuelType']):['manufacturer','model','issueYear','fuelType','engineVolume','cylinders'])}.every(key=>state.selected[key]?.id==='fixture-'+key) && state.selected.model.label===${JSON.stringify(model)} && ${rhfTest?"state.values.locationId==='fixture-location' && state.values.transmission==='"+(edgeTest&&name==='A'?'':'2')+"' && state.values.drivetrain==='3' && state.values.doorCount==='"+(edgeTest&&name==='A'?'1':'2')+"' && state.values.steeringWheel==='"+(specificationTest?'1':'')+"' && state.values.negotiable==='true' && document.querySelector('[name=\"sale.isNegotiablePrice\"]').checked &&":''} ${edgeTest||searchTest||search24Test||siteTest?"state.selected.mileageType?.label==='მილი' &&":''} state.photos===${edgeTest?Math.min(job.total,15):15} && state.uploads===1 && state.published===0;
      })()`),'Actual React form state survives blur, rerender, another field and photo side effects without submission')
      console.log('PASS real React state: native input/change + blur commit, pointer options, dependent models, post-photo recovery, no publication')
    }
    if(edgeSpeed){
      const expectedURLs=await evaluate(workerSession,`chrome.storage.session.get('job:${job.id}').then(values=>values['job:${job.id}'].vehicle.images)`)
      const actual=await evaluate(destinationSession,`(async()=>{const files=window.fixtureDeliveredFiles??[...document.querySelector('input[type=file]').files],result=[];for(const file of files){const bitmap=await createImageBitmap(file),bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');result.push({width:bitmap.width,height:bitmap.height,mime:file.type,size:file.size,hash});bitmap.close()}return result})()`)
      assert.equal(actual.length,expectedURLs.length)
      assert.equal(new Set(actual.map(image=>image.hash)).size,actual.length,'Distinct photo content, not duplicated fixtures')
      assert.ok(actual.every((image,i)=>{const expected=edgeBenchmarkAsset(expectedURLs[i]);return image.hash===expected.sha256&&image.size===expected.bytes.length&&image.mime==='image/png'&&image.width===expected.width&&image.height===expected.height}),'Decoded dimensions, MIME, file size, bytes and photo order preserved')
      console.log('EDGE_QUALITY '+JSON.stringify({trial:trial+1,vehicle:name,baselineTabs:stressTabs||1,files:actual.length,width:actual[0].width,height:actual[0].height,minBytes:Math.min(...actual.map(i=>i.size)),maxBytes:Math.max(...actual.map(i=>i.size)),uniqueContent:actual.length,allBytesMatched:true,orientation:'synthetic PNG: no EXIF transform'}))
    }
    if(edgeReal){
      const quality=await evaluate(destinationSession,`(async()=>{const files=window.fixtureDeliveredFiles??[...document.querySelector('input[type=file]').files],result=[];for(const file of files){const bitmap=await createImageBitmap(file),bytes=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');result.push({width:bitmap.width,height:bitmap.height,mime:file.type,size:file.size,hash});bitmap.close()}return result})()`)
      assert.equal(quality.length,name==='A'?15:1);assert.ok(quality.every(image=>['image/jpeg','image/png','image/webp'].includes(image.mime)&&image.width>0&&image.height>0));assert.equal(new Set(quality.map(image=>image.hash)).size,quality.length)
      console.log('EDGE_REAL_FILES '+JSON.stringify({fixture:name,transferId:job.id,downloaded:job.prepared,prepared:quality.length,delivered:job.submitted,acceptedByMock:job.uploaded,uniqueContent:quality.length,mimeTypes:[...new Set(quality.map(i=>i.mime))],minWidth:Math.min(...quality.map(i=>i.width)),maxWidth:Math.max(...quality.map(i=>i.width)),minBytes:Math.min(...quality.map(i=>i.size)),maxBytes:Math.max(...quality.map(i=>i.size)),liveMyautoAccepted:null,inputChangeOperations:await evaluate(destinationSession,'window.fixtureState?.uploads'),clickToBatchUploadMs:(await evaluate(destinationSession,'window.fixtureBatchAt'))-benchmarkEpoch,clickToFirstPhotoReferenceMs:photoMarkers.some(marker=>marker.id===job.id)?Math.max(0,Math.min(...photoMarkers.filter(marker=>marker.id===job.id).map(marker=>Date.parse(marker.timestamp)))-benchmarkEpoch):null,clickToFirstMockAcceptedMs:(await evaluate(destinationSession,'window.fixtureFirstAcceptedAt'))-benchmarkEpoch,clickToSessionMs:job.createdAt-benchmarkEpoch,clickToDestinationReadyMs:job.createdAt-benchmarkEpoch+(job.timings?.destinationReadiness??0),clickToFirstFieldMs:(await evaluate(destinationSession,'window.fixtureFirstFieldAt'))-benchmarkEpoch,totalMs:benchmarkTotal,timings:job.timings}))
    }
    const downloadsBeforeReload=photoRequests
    await command('Page.reload',{},destinationSession)
    await wait(()=>evaluate(destinationSession,"document.readyState==='complete' && !!window.fixtureState"),'destination reload')
    assert.equal(photoRequests,downloadsBeforeReload,'Reload does not restart completed photo transfer')
    assert.ok(await evaluate(workerSession,`(async()=>{const values=await chrome.storage.session.get('destination:${job.destinationTabId}');return !values['destination:${job.destinationTabId}']})()`),'Completed destination binding is cleaned after upload')
    jobs.push({...job,targetId:destinationTarget.targetId})
    if(edgeSpeed){await command('Target.closeTarget',{targetId:destinationTarget.targetId});sessions.delete(destinationTarget.targetId);jobs.at(-1).closed=true;await wait(()=>evaluate(workerSession,`chrome.storage.session.get('job:${job.id}').then(values=>!values['job:${job.id}'])`),'closed destination cleanup');if(name==='B')await memory('after-trial-'+(trial+1))}
    console.log(`PASS real MV3 vehicle ${name}: first click → parser → real storage → tab → claim → fields → photos → verification`)
  }
  if(!mechanismOnly)assert.notEqual(jobs[0].id,jobs[1].id,'Transfer identities remain isolated')
  assert.equal(failures.length,0,failures.join('; '))
  console.log('Real Chrome extension APIs passed. Websites, dropdown options and upload-server completion were simulated; authenticated live end-to-end success is not claimed.')
} finally {
  socket?.close();chromeProcess?.kill()
  await new Promise(resolve=>setTimeout(resolve,300))
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})
}
