import {EdgePreloads,EDGE_PRELOAD_BYTES} from '../../../apps/extension/src/background/edgePreloads'
import {parseEdgePipelineText} from '../src/edge/index'
import type {ExtensionApi,Sender} from '../../../apps/extension/src/services/extensionApi'
import type {TransferRecord} from '@auto-importer/shared'
export async function runEdgePreloadTests(check:(value:unknown,label:string)=>void,html:string,url:string){
  const doc=new DOMParser().parseFromString(html,'text/html'),vehicle=parseEdgePipelineText(doc,url)
  vehicle.images=Array.from({length:23},(_,index)=>`https://file3.autolookout.net/preload-test-${index}.jpg`)
  const api={runtime:{id:'test'},alarms:{create:async()=>{}}} as unknown as ExtensionApi
  let cache=new EdgePreloads(api);await cache.clear()
  const sender={id:'test',tab:{id:81,url},documentId:'test-document'} as Sender
  const id=crypto.randomUUID(),generation=crypto.randomUUID(),preparationId=crypto.randomUUID()
  const message={id,generation,preparationId,vehicle,visible:true,complete:true,pageAt:Date.now(),textReadyAt:Date.now()}
  let downloads=0,active=0,peak=0
  cache.setDownloader(async(_url,index)=>{downloads++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;const blob=new Blob(['test-binary'],{type:'image/png'});return {blob,metadata:{index,size:blob.size,name:'prepared.png',mime:'image/png',sha256:'a'.repeat(64)}}})
  const wait=async(predicate:()=>Promise<boolean>)=>{for(let index=0;index<500;index++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}throw Error('EDGE preload test timeout')}
  try{
    await cache.update(message,sender)
    await wait(async()=>{const status=await cache.status();return status.contexts[0]?.prepared===23&&status.active===0})
    check(downloads===23&&peak<=4,'EDGE automatically preloads all 23 discovered photos before click with bounded concurrency')
    await cache.update(message,sender)
    check(downloads===23,'EDGE duplicate discovery does not download prepared photos again')
    cache=new EdgePreloads(api)
    const status=await cache.status()
    check(status.contexts[0]?.prepared===23&&status.bytes<=EDGE_PRELOAD_BYTES,'EDGE native Blob cache survives worker recreation within byte limits')
    const now=Date.now(),record:TransferRecord={id:crypto.randomUUID(),sourceTabId:81,createdAt:now,updatedAt:now,vehicle:structuredClone(vehicle),stage:'preparing',status:'running',claimed:false,photos:{total:23,prepared:0,uploaded:0,failed:0},fields:[],errors:[],preparation:{id:preparationId,extractedAt:now,durationMs:0,normalizationMs:0,cacheHit:true}}
    check(await cache.bind(record),'EDGE binds cache to source tab, vehicle and exact preparation generation')
    const photos=await Promise.all([0,1,2,3].map(index=>cache.get(record,index,new AbortController().signal)))
    check(photos.every((photo,index)=>photo?.metadata.index===index&&photo.blob.size===11&&photo.metadata.name.includes(record.id.slice(0,8)))&&downloads===23,'EDGE prepared binary handoff keeps ordered indices and transfer-specific filenames without new network calls')
    const wrong={...record,id:crypto.randomUUID(),sourceTabId:82}
    check(!await cache.bind(wrong),'EDGE other tabs cannot reuse a vehicle cache')
    await cache.invalidate(sender,id)
    check(await cache.has(record),'EDGE source navigation retains binaries already pinned to an active transfer')
    await cache.finish(record.id)
    check((await cache.status()).bytes===0&&!await cache.get(record,0,new AbortController().signal),'EDGE completed transfer cleans binary cache and rejects stale reuse')
    const next={...message,id:crypto.randomUUID(),generation:crypto.randomUUID(),preparationId:crypto.randomUUID(),vehicle:{...vehicle,images:[]}}
    await cache.update(next,sender)
    check(!await cache.bind({...record,id:crypto.randomUUID()}),'EDGE new navigation generation cannot serve previous preparation')
    await cache.closeTab(81)
    check((await cache.status()).contexts.length===0,'EDGE source tab closure cleans unbound preload sessions')
    let release!:()=>void
    const gate=new Promise<void>(resolve=>{release=resolve});let started=0
    cache.setDownloader(async(_url,index,_fetcher,_trace,signal)=>{started++;await gate;signal?.throwIfAborted();const blob=new Blob(['test-binary'],{type:'image/png'});return {blob,metadata:{index,size:blob.size,name:'prepared.png',mime:'image/png',sha256:'a'.repeat(64)}}})
    const generations=Array.from({length:30},(_,index)=>({...message,id:crypto.randomUUID(),generation:crypto.randomUUID(),preparationId:crypto.randomUUID(),vehicle:{...vehicle,images:[`https://file3.autolookout.net/tab-${index}.jpg`]},visible:index===0}))
    for(let index=0;index<30;index++)await cache.update(generations[index],{...sender,tab:{id:81+index,url},documentId:'tab-'+index})
    const crowded=await cache.status()
    check(crowded.contexts.length===30&&started===4&&crowded.active===4&&crowded.reserved<=EDGE_PRELOAD_BYTES,'EDGE thirty source tabs share four speculative downloads and bounded reservations')
    const partial={...record,id:crypto.randomUUID(),vehicle:structuredClone(generations[0].vehicle),preparation:{...record.preparation!,id:generations[0].preparationId}}
    await cache.bind(partial)
    const joined=cache.get(partial,0,new AbortController().signal)
    await new Promise(resolve=>setTimeout(resolve,5))
    check((await cache.status()).jobs.some(row=>row.id===partial.id&&row.joined===1),'EDGE click joins an in-flight preload instead of starting a duplicate download')
    for(let index=1;index<30;index++)await cache.closeTab(81+index)
    release()
    check(!!await joined&&started===4,'EDGE incomplete preload continues after click with no duplicate network request')
    await cache.finish(partial.id);await cache.closeTab(81)

  }finally{await cache.clear()}
}
