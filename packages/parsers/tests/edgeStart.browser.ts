import {EdgePreparation} from '../../../apps/extension/src/content/edgePreparation'
import {VehiclePreparation} from '../../../apps/extension/src/content/preparation'
import {edgePipelineAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {parseEdgePipelineText} from '../src/edge/index'
import {assertNormalizedVehicle} from '../src/validation'
import type {ExtensionApi} from '../../../apps/extension/src/services/extensionApi'
export async function runEdgeStartTests(check:(value:unknown,label:string)=>void,a:string,b:string,urlA:string,urlB:string){
  const frame=document.createElement('iframe');document.body.append(frame);const doc=frame.contentDocument!
  const load=(html:string)=>{doc.open();doc.write(html);doc.close()}
  const tick=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
  const api={runtime:{sendMessage:async(message:unknown)=>{await tick(1);return {ok:true,value:(message as {type:string}).type==='PREFETCH_PREPARE'}}}} as ExtensionApi
  let dispose=()=>{}
  try{
    load(a);let requests=0
    const bridge=()=>{requests++;let output=doc.querySelector('#auto-importer-edge-gallery-fixture');if(!output){output=doc.createElement('script');output.id='auto-importer-edge-gallery-fixture';output.setAttribute('type','application/json');doc.querySelector('#vdp')!.append(output)}output.textContent=String(requests)}
    doc.addEventListener('auto-importer-edge-gallery-request',bridge)
    const old=new VehiclePreparation(doc,api,()=>urlA,edgePipelineAdapter);dispose=()=>old.dispose()
    const pending=old.resolve().then(()=>true,()=>false)
    await tick(70)
    check(requests>=2&&old.status!=='ready','EDGE hang reproduced: gallery bridge writes invalidate shared preparation during its own parse')
    old.dispose();await pending
    let route=urlA
    const modern=new EdgePreparation(doc,api,()=>route);dispose=()=>modern.dispose()
    const before=requests,started=performance.now(),ready=await modern.resolve()
    for(let index=0;index<20;index++){doc.querySelector('.gallery')!.setAttribute('data-gallery-fixture',String(index));bridge()}
    await tick(5)
    check(requests>=before+20&&modern.verify(ready.preparationId)&&performance.now()-started<500,'EDGE text remains ready through independent preload discovery and gallery churn')
    doc.dispatchEvent(new Event('visibilitychange'));await tick(5)
    check(modern.verify(ready.preparationId),'EDGE tab visibility restoration reuses a valid preparation ID without a new invalidation race')
    route=urlA+'#image-2';frame.contentWindow!.dispatchEvent(new Event('hashchange'))
    check(modern.verify(ready.preparationId),'EDGE gallery-only hash navigation does not restart text preparation')
    route=urlA
    const previous=ready.preparationId
    doc.querySelector('.odometer')!.textContent='Odometer: 20,000'
    check(!modern.verify(previous),'EDGE actual text changes invalidate the cached preparation')
    const updated=await modern.resolve()
    check(updated.vehicle.mileage?.value===20000&&updated.vehicle.mileage.unit==='mi','EDGE refreshed text preserves original mileage units')
    route=urlB;load(b);await tick(2)
    const next=await modern.resolve()
    check(next.vehicle.source==='EdgePipeline'&&next.vehicle.vin!==ready.vehicle.vin&&next.preparationId!==ready.preparationId,'EDGE preparation isolates SPA vehicle changes and rejects old preparation IDs')
    modern.dispose();doc.removeEventListener('auto-importer-edge-gallery-request',bridge)
    load(a);doc.querySelector('.gallery')!.remove();doc.querySelector('.section.details')!.replaceChildren()
    const text=parseEdgePipelineText(doc,urlA);assertNormalizedVehicle(text)
    check(!!text.make&&!!text.model&&!text.images.length&&text.engineCc===undefined,'EDGE missing gallery and optional specifications do not block identified vehicle text')
    const noPhotos=new EdgePreparation(doc,api,()=>urlA);dispose=()=>noPhotos.dispose()
    const fastAt=performance.now();await noPhotos.resolve()
    check(performance.now()-fastAt<500,'EDGE missing gallery starts text preparation without a photo-readiness wait')
    noPhotos.dispose()
    const unresponsive={runtime:{sendMessage:()=>new Promise(()=>{})}} as unknown as ExtensionApi
    const bounded=new EdgePreparation(doc,unresponsive,()=>urlA);dispose=()=>bounded.dispose()
    const timeoutAt=performance.now();const fallback=await bounded.resolve()
    check(!!fallback.vehicle.vin&&bounded.status==='ready'&&performance.now()-timeoutAt<500,'EDGE missing background text cache uses fast local extraction without waiting for publication')
    bounded.dispose()
  }finally{dispose();frame.remove()}
}
