import {parseEdgePipeline} from '../src/edge/index'
import {TransferManager} from '../../../apps/extension/src/background/transfers'
import {IndexedPhotoStore} from '../../../apps/extension/src/photos/store'
import type {ExtensionApi,Sender} from '../../../apps/extension/src/services/extensionApi'
import {inspectEdgePhotos} from '../src/edge/index'
import {collectEdgeRuntimePhotos} from '../src/edge/runtime'
import {downloadPhoto} from '../../../apps/extension/src/photos/download'
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return {n,medianMs:(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2,maxMs:sorted[n-1],p95Ms:n>=20?sorted[Math.ceil(n*.95)-1]:null}}
export async function runEdgeSpeed(check:(value:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/edge-gasoline.html')).text(),url='https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32)
  for(const count of [1,5,10,15,23,30,60]){
    // Inert detached DOM, no real auction/CDN requests and no UI mutations.
    const doc=new DOMParser().parseFromString(html.replaceAll(' src=',' data-src='),'text/html'),root=doc.querySelector('#vdp')!
    root.querySelector('.fotorama__nav__shaft')!.remove();root.querySelector('.slide-counts > span:last-child')!.textContent=String(count)
    const output=doc.createElement('script');output.id='auto-importer-edge-gallery-data';output.type='application/json';output.dataset.vehicleId='a'.repeat(32);output.dataset.vin='1HGCM82633A004352';root.append(output)
    const raw=Array.from({length:count},(_,i)=>({full:`https://file3.autolookout.net/synthetic/order-${i}.jpg`}))
    const collected=collectEdgeRuntimePhotos(raw);output.textContent=JSON.stringify(collected.photos);output.dataset.galleryCount=String(collected.unique)
    const samples:number[]=[],dedup:number[]=[]
    for(let trial=0;trial<55;trial++){
      const start=performance.now(),value=inspectEdgePhotos(doc,url),elapsed=performance.now()-start
      if(!value.galleryReady||value.images.length!==count||!value.images.every((u,i)=>u.endsWith('/order-'+i+'.jpg')))throw Error('Photo order/count failure')
      const dedupStart=performance.now();collectEdgeRuntimePhotos(raw);const dedupMs=performance.now()-dedupStart
      if(trial>=5){samples.push(elapsed);dedup.push(dedupMs)}
    }
    check(true,'EDGE gallery timing: '+JSON.stringify({scenario:count,inspector:stats(samples),collector:stats(dedup)}))
  }
  const incomplete=new DOMParser().parseFromString(html.replaceAll(' src=',' data-src='),'text/html');incomplete.querySelector('.fotorama__nav__shaft')!.remove()
  const partial=incomplete.createElement('script');partial.id='auto-importer-edge-gallery-data';partial.type='application/json';partial.dataset.vehicleId='a'.repeat(32);partial.dataset.vin='1HGCM82633A004352';partial.dataset.galleryCount='1';partial.textContent=JSON.stringify([{full:'https://file3.autolookout.net/only-one.jpg'}]);incomplete.querySelector('#vdp')!.append(partial)
  check(!inspectEdgePhotos(incomplete,url).galleryReady&&parseEdgePipeline(incomplete,url).images.length===0,'EDGE declared-count regression: supplied 47-photo counter cannot complete with one runtime image before thumbnails mount')
  partial.textContent=JSON.stringify(collectEdgeRuntimePhotos(Array.from({length:47},(_,index)=>({full:`https://file3.autolookout.net/ready-${index}.jpg`}))).photos);partial.dataset.galleryCount='47'
  check(inspectEdgePhotos(incomplete,url).galleryReady&&inspectEdgePhotos(incomplete,url).images.length===47,'EDGE declared-count regression: complete 47-photo dataset is retained')
  const duplicates=collectEdgeRuntimePhotos(Array.from({length:47},(_,index)=>({full:`https://file3.autolookout.net/unique-${index%5}.jpg`})))
  partial.textContent=JSON.stringify(duplicates.photos);partial.dataset.galleryCount=String(duplicates.unique);partial.dataset.uniqueCount=String(duplicates.unique);partial.dataset.frameCount='47'
  check(inspectEdgePhotos(incomplete,url).galleryReady&&inspectEdgePhotos(incomplete,url).images.length===5,'EDGE declared-count regression: a fully enumerated 47-frame API with five distinct originals completes immediately without duplicating or waiting')
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
  const vehicle=parseEdgePipeline(new DOMParser().parseFromString(html,'text/html'),url);vehicle.images=inspectEdgePhotos(new DOMParser().parseFromString(html,'text/html'),url).images.slice(0,1)
  const sourceCloseTimes:number[]=[]
  for(let trial=0;trial<5;trial++){
    const memory:Record<string,unknown>={},store=new IndexedPhotoStore();let release:()=>void=()=>{},started:()=>void=()=>{}
    const gate=new Promise<void>(resolve=>{release=resolve}),fetchStarted=new Promise<void>(resolve=>{started=resolve})
    const api:ExtensionApi={runtime:{id:'edge-speed-fixture',onMessage:{addListener(){}},sendMessage:async()=>({ok:true})},tabs:{query:async()=>[],create:async()=>({id:1000+trial}),sendMessage:async(_tab,message)=>(message as {type:string}).type==='MANHEIM_RESOLVE'?{ok:true,vehicle,preparationId:crypto.randomUUID()}:{ok:true,verified:true}},storage:{session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async values=>{Object.assign(memory,structuredClone(values))},remove:async key=>{delete memory[key]}}}}
    const manager=new TransferManager(api,store,(photo,index,_fetch,trace,signal)=>downloadPhoto(photo,index,async()=>{started();await gate;return new Response(png)},trace,signal))
    const source:Sender={id:api.runtime.id,tab:{id:30+trial,url}},job=await manager.begin(source),destination:Sender={id:api.runtime.id,tab:{id:job.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:'edge-close-'+trial}
    await manager.handle({type:'TRANSFER_CLAIM',protocol:1},destination)
    const start=performance.now(),pending=manager.handle({type:'PHOTO_PREPARE',id:job.id,index:0},destination)
    await fetchStarted;await manager.tabClosed(source.tab!.id!);release();await pending
    const chunk=await manager.handle({type:'PHOTO_CHUNK',id:job.id,index:0,offset:0},destination) as string
    if(atob(chunk).length!==png.length)throw Error('Approved transfer lost photo bytes when source closed')
    sourceCloseTimes.push(performance.now()-start)
    await manager.tabClosed(job.destinationTabId!);if(await store.get(job.id,0))throw Error('Photo cache retained after destination cleanup')
  }
  check(true,'EDGE recovery timing: '+JSON.stringify({scenario:'source-close-during-download',...stats(sourceCloseTimes)}))
  for(const scenario of ['slow-cdn','network-retry','abort','invalid-url'] as const){
    const samples:number[]=[]
    for(let trial=0;trial<5;trial++){
      const started=performance.now(),controller=new AbortController();let calls=0,failed=false
      try{
        const task=downloadPhoto(scenario==='invalid-url'?'https://file3.autolookout.net/logo.jpg':'https://file3.autolookout.net/synthetic.jpg',0,async(_url,init)=>{
          calls++
          if(scenario==='network-retry'&&calls===1)throw new TypeError('Synthetic network interruption')
          if(scenario==='slow-cdn')await new Promise(resolve=>setTimeout(resolve,40))
          if(scenario==='abort')await new Promise<void>((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new DOMException('Fixture cancelled','AbortError')),{once:true})})
          return new Response(png)
        },undefined,controller.signal)
        if(scenario==='abort')controller.abort()
        await task
      }catch{failed=true}
      if(scenario==='invalid-url'){if(!failed||calls!==0)throw Error('Invalid URL attempted a fetch')}
      else if(scenario==='abort'){if(!failed||calls!==1)throw Error('Abort retried or did not fail')}
      else if(failed||calls!==(scenario==='network-retry'?2:1))throw Error('Download recovery count failed')
      samples.push(performance.now()-started)
    }
    check(true,'EDGE recovery timing: '+JSON.stringify({scenario,...stats(samples)}))
  }
  // Read-only audit of an existing shared limitation: signatures are not full decoding.
  const header=await downloadPhoto('https://file3.autolookout.net/corrupt.jpg',0,async()=>new Response(new Uint8Array([137,80,78,71,13,10,26,10])))
  let decoded=true;try{const bitmap=await createImageBitmap(header.blob);bitmap.close()}catch{decoded=false}
  check(!decoded,'EDGE quality audit: shared downloader accepts a PNG-signature-only body which fails full decoding; documented, not changed')
}
