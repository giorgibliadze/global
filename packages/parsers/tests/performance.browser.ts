import {IndexedPhotoStore} from '../../../apps/extension/src/photos/store'
import {downloadPhoto} from '../../../apps/extension/src/photos/download'
import {manheim24Adapter,siteManheimAdapter,searchManheimAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {PreparedVehicles} from '../../../apps/extension/src/background/preparation'
import {myautoFields} from '../src/myauto'
import {vehicleSource} from '../../../apps/extension/src/services/sourceRegistry'

const results:unknown[]=[]
try{
  for(const [adapter,fixture,url] of [
    [manheim24Adapter,'manheim24.html','https://home.manheim24.com/landingPage#/results/fixture'],
    [siteManheimAdapter,'search-manheim.html','https://site.manheim.com/inventory/selected'],
    [searchManheimAdapter,'search-manheim.html','https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE'],
  ] as const){
    const html=await(await fetch('/packages/parsers/tests/fixtures/'+fixture)).text(),frame=document.createElement('iframe');document.body.append(frame)
    const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
    try{
      const measure=(fn:()=>unknown,n=30)=>{const samples:number[]=[];for(let i=0;i<5;i++)fn();for(let i=0;i<n;i++){const start=performance.now();fn();samples.push(performance.now()-start)}return samples.reduce((a,b)=>a+b,0)/n}
      const vehicle=adapter.parse(doc,url),cache=new PreparedVehicles(),id=crypto.randomUUID()
      cache.invalidate(1,id);cache.prepare(1,id,vehicle,Date.now())
      results.push({platform:adapter.id,unit:'ms',iterations:30,selected:vehicle.images.length,discovered:vehicle.availableImageCount,stages:{sourceDetection:measure(()=>vehicleSource(url)),vehicleReadiness:measure(()=>adapter.selection(doc,url)),vehicleExtraction:measure(()=>adapter.parse(doc,url)),galleryDiscovery:measure(()=>adapter.photos(doc,url)),normalization:measure(()=>myautoFields(vehicle)),payloadPreparation:measure(()=>structuredClone(vehicle)),cacheRead:measure(()=>cache.get(1,id))}})
    }finally{frame.remove()}
  }
  const store=new IndexedPhotoStore(),transferId=crypto.randomUUID(),blob=new Blob([new Uint8Array(1024*1024)],{type:'image/jpeg'})
  const metadata={index:0,name:'fixture.jpg',mime:'image/jpeg',size:blob.size,sha256:'0'.repeat(64)}
  await store.put(transferId,blob,metadata)
  const readsStart=performance.now();for(let i=0;i<60;i++)await store.get(transferId,0)
  results.push({platform:'shared-destination',stage:'photoStoreReads',operations:60,durationMs:performance.now()-readsStart});await store.remove(transferId)
  for(const concurrency of [3,4,6]){
    let next=0,active=0,peak=0,completed=0
    const started=performance.now()
    await Promise.all(Array.from({length:concurrency},async()=>{while(next<15){const index=next++;await downloadPhoto('https://images.cdn.manheim.com/perf-'+index+'.jpg',index,async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,120));active--;return new Response(new Uint8Array([255,216,255,index]),{headers:{'content-type':'image/jpeg'}})});completed++}}))
    results.push({platform:'shared-download-scheduler',concurrency,peak,completed,durationMs:performance.now()-started,method:'controlled 120ms successful fixture responses; not live CDN throughput'})
  }
  document.body.dataset.result='PASS';document.querySelector('pre')!.textContent='SOURCE_BENCHMARK '+JSON.stringify(results)
}catch(error){document.body.dataset.result='FAIL';document.querySelector('pre')!.textContent='FAILED: '+(error instanceof Error?error.message:String(error))}
