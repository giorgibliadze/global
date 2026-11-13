import { VehiclePreparation } from '../../../apps/extension/src/content/preparation'
import { PreparedVehicles } from '../../../apps/extension/src/background/preparation'
import { TransferManager } from '../../../apps/extension/src/background/transfers'
import { IndexedPhotoStore } from '../../../apps/extension/src/photos/store'
import { parseManheim24 } from '../src/manheim24'
import type { ExtensionApi,Sender } from '../../../apps/extension/src/services/extensionApi'
import type { TransferRecord,PreparationStatus } from '@auto-importer/shared'

export async function runPrefetchTests(html:string,check:(value:unknown,label:string)=>void){
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  let url='https://home.manheim24.com/landingPage#/results/a',tabs=0,downloads=0,preparations=0
  let hold=false,release:()=>void=()=>{},started:()=>void=()=>{}
  let gate=Promise.resolve()
  const memory:Record<string,unknown>={},store=new IndexedPhotoStore()
  const sender:Sender={id:'fixture',tab:{id:51,url},documentId:'prefetch-document'}
  let source:VehiclePreparation
  const api:ExtensionApi={
    runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:async message=>{
      const input=message as Record<string,unknown>
      try{
        const value=await manager.handle(input,sender)
        if(input.type==='PREFETCH_PREPARE'){preparations++;if(hold){started();await gate}}
        return {ok:true,value}
      }catch{return {ok:false,error:'სატესტო მომზადება ვერ შესრულდა.'}}
    }},
    tabs:{query:async()=>[sender.tab!],sendMessage:async(_id,message)=>{
      const input=message as Record<string,unknown>
      if(input.type==='MANHEIM_VERIFY')return {ok:true,verified:source.verify(input.preparationId)}
      if(input.type==='MANHEIM_RESOLVE'){try{return{ok:true,...await source.resolve()}}catch{return{ok:false}}}
      throw new Error('Fresh full parsing must not run on a verified prepared hit')
    },create:async()=>({id:++tabs+500})},
    storage:{session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async entries=>{Object.assign(memory,structuredClone(entries))},remove:async key=>{delete memory[key]}}},
  }
  const manager=new TransferManager(api,store,async()=>{downloads++;throw new Error('Prefetch must not download photos')})
  const states:PreparationStatus[]=[]
  const ready=()=>{source.verify('');return new Promise<void>((resolve,reject)=>{
    let unsubscribe:()=>void=()=>{}
    const timer=setTimeout(()=>{unsubscribe();reject(new Error('Prefetch readiness deadline'))},3000)
    unsubscribe=source.subscribe(status=>{if(status==='ready'){clearTimeout(timer);queueMicrotask(()=>unsubscribe());resolve()}})
  })}
  try{
    source=new VehiclePreparation(doc,api,()=>url);source.subscribe(status=>states.push(status))
    await ready()
    check(tabs===0 && downloads===0,'prefetch: initial detail preparation opens no tab and downloads no photos')
    const a=await source.resolve(),count=preparations
    check((await source.resolve()).preparationId===a.preparationId && preparations===count,'prefetch: warm source cache reuses unique preparation without normalization')
    const transfer=await manager.begin(sender)
    check(transfer.preparation?.cacheHit && !!transfer.preparedFields?.length && tabs===1,'prefetch: click reuses background prepared fields and opens one destination')
    check(!transfer.preparedFields!.some(field=>field.field==='description') && !transfer.vehicle.description && !transfer.vehicle.raw.description,'prefetch: no generated or source auction description is transferred')
    check((await manager.begin(sender)).id===transfer.id && tabs===1,'prefetch: repeated prepared clicks still deduplicate transfers')
    const recoveredMemory:Record<string,unknown>={}
    const restartedApi:ExtensionApi={...api,tabs:{...api.tabs,create:async()=>({id:999})},storage:{session:{get:async key=>structuredClone(key===null?recoveredMemory:{[key]:recoveredMemory[key]}),set:async entries=>{Object.assign(recoveredMemory,structuredClone(entries))},remove:async key=>{delete recoveredMemory[key]}}}}
    const restarted=new TransferManager(restartedApi,new IndexedPhotoStore())
    const recovered=await restarted.begin(sender)
    check(recovered.preparation?.cacheHit===false && !!recovered.preparedFields?.length && recovered.vehicle.fullModelName==='M5 Touring Wagon','prefetch: worker restart cache miss rebuilds verified source payload automatically')

    hold=true;gate=new Promise(resolve=>{release=resolve})
    const blocked=new Promise<void>(resolve=>{started=resolve})
    const b=html.replaceAll('1HGCM82633 A004352','2HGCM82633 A004352').replaceAll('1HGCM82633A004352','2HGCM82633A004352').replaceAll('M5 Touring Wagon','M3 Touring')
    url='https://home.manheim24.com/landingPage#/results/b'
    doc.body.innerHTML=new DOMParser().parseFromString(b,'text/html').body.innerHTML
    doc.defaultView!.dispatchEvent(new doc.defaultView!.HashChangeEvent('hashchange'))
    check(!source.verify(a.preparationId),'prefetch: hash navigation invalidates previous identity immediately')
    await Promise.race([blocked,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Superseded prefetch did not start')),3000))])
    const c=html.replaceAll('1HGCM82633 A004352','3HGCM82633 A004352').replaceAll('1HGCM82633A004352','3HGCM82633A004352').replaceAll('BMW','Ford').replaceAll('M5 Touring Wagon','Super Duty F-350')
    url='https://home.manheim24.com/landingPage#/results/c'
    doc.body.innerHTML=new DOMParser().parseFromString(c,'text/html').body.innerHTML
    const clickedDuringPreparation=source.resolve()
    hold=false;release()
    await ready()
    const current=await clickedDuringPreparation
    check(current.vehicle.fullModelName==='Super Duty F-350','prefetch: click during preparation waits for the current generation without cancelling its own task')
    check(current.vehicle.make==='Ford' && current.vehicle.fullModelName==='Super Duty F-350' && current.preparationId!==a.preparationId,'prefetch: stale asynchronous B result discarded; compound model C remains exact')
    check(states.filter(status=>status==='ready').length===2,'prefetch: superseded preparation never publishes a ready state')
    const second=await manager.begin(sender)
    check(second.id!==transfer.id && second.vehicle.vin!==transfer.vehicle.vin && second.preparation?.cacheHit,'prefetch: SPA switching produces isolated current-vehicle transfer')

    // A hash can change before the old panel is replaced. Never accept that panel.
    url='https://home.manheim24.com/landingPage#/results/d'
    doc.defaultView!.dispatchEvent(new doc.defaultView!.HashChangeEvent('hashchange'))
    check(!source.verify(current.preparationId),'prefetch: old visible detail panel is rejected while a new hash is loading')
    doc.body.innerHTML=new DOMParser().parseFromString(c,'text/html').body.innerHTML
    check(!source.verify(current.preparationId),'prefetch: replacing an old panel does not validate its stale identity on a new route')
    doc.body.innerHTML=new DOMParser().parseFromString(b,'text/html').body.innerHTML
    await ready()
    check((await source.resolve()).vehicle.fullModelName==='M3 Touring','prefetch: asynchronously replaced detail panel becomes ready without reload')
    doc.body.innerHTML=new DOMParser().parseFromString(c,'text/html').body.innerHTML
    await ready()
    check((await source.resolve()).vehicle.fullModelName==='Super Duty F-350','prefetch: detail modal switching without route navigation invalidates the old payload')
    const structured=doc.querySelector('.StockWaveInfo')!,parent=structured.parentElement!
    structured.remove()
    const delayed=source.resolve()
    queueMicrotask(()=>parent.append(structured))
    check((await delayed).vehicle.make==='Ford','prefetch: click waits for required asynchronously rendered source data without confirmation')
    doc.body.innerHTML='<div id="delayed-visible" style="display:none">'+new DOMParser().parseFromString(b,'text/html').body.innerHTML+'</div>'
    source.verify('')
    doc.getElementById('delayed-visible')!.style.display='block'
    await ready()
    check((await source.resolve()).vehicle.fullModelName==='M3 Touring','prefetch: revealing an asynchronously hidden ancestor triggers preparation')
    check(downloads===0 && !Object.keys(memory).some(key=>key.includes('token')),'prefetch: preparation uses no binary cache, credentials or automatic upload')

    const cache=new PreparedVehicles(),id=crypto.randomUUID(),vehicle=parseManheim24(doc)
    check(!cache.get(51,id),'prefetch: missing background cache is a safe miss')
    cache.invalidate(51,id);cache.prepare(51,id,vehicle,Date.now())
    const clock=Date.now
    try{Date.now=()=>clock()+120001;check(!cache.get(51,id),'prefetch: short-lived payload expires after two minutes')}finally{Date.now=clock}
    const next=crypto.randomUUID();cache.invalidate(51,next)
    check(!cache.prepare(51,id,vehicle,Date.now()),'prefetch: superseded normalization cannot repopulate the cache')
    const stored=memory[`job:${second.id}`] as TransferRecord
    check(stored.vehicle.fullModelName==='Super Duty F-350','prefetch: subsequent source selection cannot mutate an existing transfer snapshot')
  }finally{source!.dispose();frame.remove()}
}
