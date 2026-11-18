import type {PhotoStore} from '../../../apps/extension/src/photos/store'
type StoredPhoto=NonNullable<Awaited<ReturnType<PhotoStore['get']>>>
import {PreparedVehicles} from '../../../apps/extension/src/background/preparation'
import {TransferManager,MAX_ACTIVE_TRANSFERS,MAX_GLOBAL_PHOTO_DOWNLOADS} from '../../../apps/extension/src/background/transfers'
import {manheim24Adapter,searchManheimAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {DropdownAdapter} from '../src/DropdownAdapter'
import {fillStagedMyauto} from '../src/stagedMyauto'
import {myautoFields} from '../src/myauto'
import {assertNormalizedVehicle} from '../src/validation'
import type {ExtensionApi,Sender} from '../../../apps/extension/src/services/extensionApi'
import type {TransferRecord} from '@auto-importer/shared'
export async function runSessionStress(check:(v:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),modern=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  const base=manheim24Adapter.parse(new DOMParser().parseFromString(html,'text/html'))
  const search=searchManheimAdapter.parse(new DOMParser().parseFromString(modern,'text/html'),'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE')
  const started=performance.now()
  for(const count of [1,5,10,20,30]){
    const cache=new PreparedVehicles(),ids=Array.from({length:count},()=>crypto.randomUUID())
    ids.forEach((id,i)=>{cache.invalidate(i,id);cache.prepare(i,id,{...structuredClone(i%2?search:base),listingId:'stress-'+i},Date.now())})
    check(ids.every((id,i)=>cache.get(i,id)?.vehicle.listingId==='stress-'+i),`sessions: ${count} mixed tab caches remain independent`)
    cache.remove(0);check(count===1||!!cache.get(count-1,ids[count-1]),'sessions: closing one source cache preserves other tabs')
  }
  const ev={...structuredClone(base),fuel:'Electric'};delete ev.engineCc;delete ev.cylinders
  assertNormalizedVehicle(ev)
  check(myautoFields(ev).filter(f=>['engineCc','cylinders'].includes(f.field)).every(f=>f.value===undefined),'EV: missing combustion specifications remain missing, without invented battery or motor values')
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!,select=DropdownAdapter.prototype.select
  const seen:string[]=[]
  try{
    DropdownAdapter.prototype.select=async function(field){seen.push(field.field);if(field.field==='fuel')throw new Error('Synthetic unsupported EV option');return {key:field.field,field:field.label,status:'filled',reason:'fixture'}}
    const results=await fillStagedMyauto(doc,ev,myautoFields(ev).filter(f=>['fuel','year','engineCc','cylinders'].includes(f.field)),{})
    check(results.some(r=>r.key==='fuel'&&r.code==='unavailable')&&results.some(r=>r.key==='year'&&r.status==='filled')&&seen.includes('year'),'EV: one throwing dropdown is a field result and subsequent independent fields continue')
    const abort=new AbortController();abort.abort();let rejected=false
    try{await fillStagedMyauto(doc,ev,myautoFields(ev),{signal:abort.signal})}catch{rejected=true}
    check(rejected,'EV: cancellation remains fatal rather than being swallowed as an optional field')
  }finally{DropdownAdapter.prototype.select=select;frame.remove()}
  const memory:Record<string,unknown>={},vehicles=new Map<number,typeof base>(),ids=new Map<number,string>()
  for(let i=0;i<30;i++){vehicles.set(i,{...structuredClone(i%2?search:base),listingId:'stress-'+i});ids.set(i,crypto.randomUUID())}
  let destination=1000,active=0,peak=0,downloads=0
  const blobs=new Map<string,StoredPhoto>()
  const api:ExtensionApi={runtime:{id:'stress',onMessage:{addListener(){}},sendMessage:async()=>({ok:true})},tabs:{query:async()=>[],create:async()=>({id:++destination}),sendMessage:async(tab,message)=>(message as {type:string}).type==='MANHEIM_RESOLVE'?{ok:true,vehicle:vehicles.get(tab),preparationId:ids.get(tab)}:{ok:true,verified:true}},storage:{session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async values=>{Object.assign(memory,structuredClone(values))},remove:async key=>{delete memory[key]}}}}
  const manager=new TransferManager(api,{get:async(id,index)=>blobs.get(id+':'+index),put:async(id,blob,metadata)=>{blobs.set(id+':'+metadata.index,{key:id+':'+metadata.index,transferId:id,createdAt:Date.now(),blob,metadata})},bytes:async()=>0,remove:async id=>{for(const key of blobs.keys())if(key.startsWith(id+':'))blobs.delete(key)},prune:async()=>{}},async(url,index)=>{
    active++;peak=Math.max(peak,active);downloads++
    try{await new Promise(resolve=>setTimeout(resolve,2));return {blob:new Blob([url]),metadata:{index,name:'fixture.jpg',size:url.length,mime:'image/jpeg',sha256:'0'.repeat(64)}}}finally{active--}
  })
  const source=(i:number):Sender=>({id:'stress',tab:{id:i,url:i%2?'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE':'https://home.manheim24.com/landingPage#/results/stress'}})
  const admissions=await Promise.allSettled(Array.from({length:30},(_,i)=>manager.begin(source(i))))
  const jobs=admissions.flatMap(result=>result.status==='fulfilled'?[result.value]:[])
  check(jobs.length===MAX_ACTIVE_TRANSFERS&&new Set(jobs.map(j=>j.destinationTabId)).size===jobs.length,'sessions: 30 simultaneous starts respect atomic admission and unique destination ownership')
  const senders=new Map<string,Sender>()
  for(const job of jobs){const sender={id:'stress',tab:{id:job.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:'destination-'+job.id};senders.set(job.id,sender);await manager.handle({type:'TRANSFER_CLAIM',protocol:1},sender)}
  await Promise.all(jobs.flatMap(job=>Array.from({length:15},(_,index)=>manager.handle({type:'PHOTO_PREPARE',id:job.id,index},senders.get(job.id)!))))
  check(downloads===jobs.length*15&&peak===MAX_GLOBAL_PHOTO_DOWNLOADS&&active===0,'sessions: 60 queued photo operations respect global concurrency and finish without starvation')
  const matches=await Promise.all(jobs.flatMap(job=>Array.from({length:15},async(_,index)=>(await blobs.get(job.id+':'+index)?.blob.text())===job.vehicle.images[index])))
  check(matches.every(Boolean),'sessions: cached photo bytes stay bound to transfer and source image index')
  const before=downloads;await manager.handle({type:'PHOTO_PREPARE',id:jobs[0].id,index:0},senders.get(jobs[0].id)!)
  check(downloads===before,'sessions: repeated photo request uses persistent prepared bytes without duplicate download')
  await manager.tabClosed(jobs[0].sourceTabId)
  check(!!memory['job:'+jobs[0].id],'sessions: closing source preserves approved destination transfer')
  await manager.tabClosed(jobs[0].destinationTabId!)
  check(!memory['job:'+jobs[0].id]&&jobs.slice(1).every(job=>!!memory['job:'+job.id]),'sessions: closing destination removes only its owned job and photos')
  const restarted=new TransferManager(api,{get:async(id,index)=>blobs.get(id+':'+index),put:async()=>{},bytes:async()=>0,remove:async()=>{},prune:async()=>{}})
  await restarted.validateState()
  check(jobs.slice(1).every(job=>(memory['job:'+job.id] as TransferRecord|undefined)?.destinationTabId===job.destinationTabId),'sessions: worker recreation retains persisted job/destination associations')
  for(const job of jobs.slice(1))await manager.tabClosed(job.destinationTabId!)
  check(blobs.size===0,'sessions: closing all destinations releases all prepared blobs')
  check(true,`sessions: synthetic 30-tab metadata/admission and 60-photo queue benchmark ${Math.round(performance.now()-started)}ms; not a live 30-tab browser benchmark`)
}
