import {installMyautoReceiver} from '../../../apps/extension/src/myauto/activation'
import {runMyautoTransfer} from '../../../apps/extension/src/myauto/transfer'
import {TransferManager} from '../../../apps/extension/src/background/transfers'
import {parseManheim24} from '../src/manheim24'
import type {TransferRecord} from '@auto-importer/shared'
import type {ExtensionApi,Sender} from '../../../apps/extension/src/services/extensionApi'

const turn=()=>new Promise(resolve=>setTimeout(resolve,0))
export async function runPassiveMyautoTests(html:string,check:(value:unknown,label:string)=>void){
  const vehicle=parseManheim24(new DOMParser().parseFromString(html,'text/html'))
  const record=():TransferRecord=>({id:crypto.randomUUID(),vehicle,sourceTabId:1,destinationTabId:2,documentId:'doc-A',createdAt:Date.now(),updatedAt:Date.now(),claimed:true,activation:{schema:1,state:'TRANSFERRING'},status:'running',stage:'preparing',fields:[],errors:[],photos:{total:15,prepared:0,uploaded:0,failed:0}})
  const frame=()=>{const el=document.createElement('iframe');document.body.append(el);el.contentDocument!.body.innerHTML='<main>Ordinary MyAuto page</main><input name="primaryFeatures.vinCode"><input name="primaryFeatures.mileage">';return el}
  const listeners=new Set<Parameters<ExtensionApi['runtime']['onMessage']['addListener']>[0]>()
  let calls=0,loads=0,runs=0,notices=0
  let send:(input:unknown)=>Promise<unknown>=async()=>({ok:true,value:null})
  const api={runtime:{id:'passive-fixture',sendMessage:async input=>{calls++;return send(input)},onMessage:{addListener:listener=>{listeners.add(listener)},removeListener:listener=>{listeners.delete(listener)}}}} as ExtensionApi
  const completed=(r:TransferRecord):TransferRecord=>({...r,status:'review',activation:{schema:1,state:'COMPLETED'},photos:{...r.photos,uploaded:15}})
  const load=async()=>{loads++;return {runMyautoTransfer:async(_doc:Document,r:TransferRecord)=>{runs++;return completed(r)}}}
  const notify=(id:string,protocol=1,sender='passive-fixture')=>{for(const listener of [...listeners])listener({type:'TRANSFER_READY',id,protocol},{id:sender},()=>{})}

  for(const path of ['/','/ka/s/','/ka/pr/fixture','/ka/login','/ka/add']){
    const el=frame(),doc=el.contentDocument!,before=doc.documentElement.outerHTML
    const Native=doc.defaultView!.MutationObserver;let observers=0
    doc.defaultView!.MutationObserver=new Proxy(Native,{construct(target,args){observers++;return Reflect.construct(target,args)}})
    const startCalls=calls,startLoads=loads,startRuns=runs
    const receiver=installMyautoReceiver(doc,{api,url:()=>`https://myauto.ge${path}`,load,notice:()=>{notices++}})
    await turn();await turn()
    check(calls-startCalls===(path==='/ka/add'?1:0)&&loads===startLoads&&runs===startRuns&&observers===0&&doc.documentElement.outerHTML===before,`passive MyAuto ${path}: no DOM changes, heavy imports, observers or transfer; at most one add-page probe`)
    doc.body.append(doc.createElement('section'));await turn()
    check(calls-startCalls===(path==='/ka/add'?1:0),'passive MyAuto: page mutations do not cause claim polling')
    receiver?.dispose();el.remove()
  }
  check(!listeners.size&&!notices,'passive MyAuto: idle receivers clean up with no user error notice')
  for(const type of ['reload','back_forward']){
    const el=frame(),doc=el.contentDocument!,before=calls
    doc.defaultView!.performance.getEntriesByType=()=>[{type} as unknown as PerformanceNavigationTiming]
    check(!installMyautoReceiver(doc,{api,url:()=> 'https://myauto.ge/ka/add',load})&&calls===before,'passive MyAuto: refresh/history restoration cannot claim an old transfer')
    el.remove()
  }
  {
    const el=frame(),doc=el.contentDocument!,before=doc.body.innerHTML
    send=async()=>{throw new Error('synthetic invalidated extension context')}
    const receiver=installMyautoReceiver(doc,{api,url:()=> 'https://myauto.ge/ka/add',load,notice:()=>{notices++}})
    await turn();await turn()
    check(!loads&&!runs&&!notices&&doc.body.innerHTML===before,'passive MyAuto: update-invalidated runtime produces no website error UI or mutation')
    receiver?.dispose();el.remove()
  }
  for(const bad of [{...record(),activation:undefined},{...record(),status:'review'},{...record(),activation:{schema:1,state:'COMPLETED'}},{...record(),createdAt:Date.now()-31*60000},{...record(),id:'invalid-id'}]){
    const el=frame();send=async()=>({ok:true,value:bad})
    const receiver=installMyautoReceiver(el.contentDocument!,{api,url:()=> 'https://myauto.ge/ka/add',load,notice:()=>{notices++}})
    await turn();await turn();check(!loads&&!runs&&!notices,'passive MyAuto: incompatible/completed/expired/invalid payload stays inactive')
    receiver?.dispose();el.remove()
  }
  {
    const el=frame(),doc=el.contentDocument!,job=record(),start=calls
    let resolveFirst:(v:unknown)=>void=()=>{}
    const first=new Promise(resolve=>{resolveFirst=resolve})
    send=async()=>calls===start+1?first:{ok:true,value:job}
    const receiver=installMyautoReceiver(doc,{api,url:()=> 'https://myauto.ge/ka/add',load})
    check(installMyautoReceiver(doc,{api,url:()=> 'https://myauto.ge/ka/add',load})===receiver,'activation: duplicate installation reuses one receiver')
    notify(job.id,0);notify(job.id,1,'other-extension');notify('not-a-transfer')
    check(calls===start+1,'activation: stale protocol/untrusted sender/invalid ID cannot trigger a claim')
    notify(job.id);notify(job.id);resolveFirst({ok:true,value:null})
    for(let i=0;i<8;i++)await turn()
    check(calls===start+2&&loads===1&&runs===1&&!listeners.size,'activation: READY closes early-probe race once; repeated READY does not repeat execution or listeners')
    receiver?.dispose();el.remove()
  }
  {
    const el=frame(),job=record();let release:()=>void=()=>{},called=0,aborted=false
    const gate=new Promise<void>(resolve=>{release=resolve})
    send=async()=>({ok:true,value:job})
    installMyautoReceiver(el.contentDocument!,{api,url:()=> 'https://myauto.ge/ka/add',load:async()=>{await gate;return {runMyautoTransfer:async(_doc,_record,_update,options)=>{called++;aborted=options.signal.aborted;return completed(job)}}}})
    await turn();el.contentWindow!.dispatchEvent(new el.contentDocument!.defaultView!.Event('pagehide'));release();await turn();await turn()
    check(!called&&!aborted&&!listeners.size,'activation: pagehide cancels a pending lazy import without touching the replacement page')
    el.remove()
  }
  {
    const el=frame(),job=record(),doc=el.contentDocument!,before=doc.body.innerHTML
    send=async()=>({ok:true,value:job})
    installMyautoReceiver(doc,{api,url:()=> 'https://myauto.ge/ka/add',load:async()=>{throw new Error('synthetic module failure')},notice:()=>{notices++}})
    await turn();await turn()
    check(notices===1&&doc.body.innerHTML===before&&!listeners.size,'activation: admitted extension module failure is contained; website DOM and listeners remain intact')
    // A setup exception used to leave the form locked before cleanup was installed.
    let releasedTwice=0
    for(let i=0;i<2;i++)try{await runMyautoTransfer(doc,job,()=>{throw new Error('synthetic update callback')},{pageUrl:()=> 'https://myauto.ge/ka/add'})}catch(error){if(error instanceof Error&&error.message==='synthetic update callback')releasedTwice++}
    check(releasedTwice===2,'active cleanup: setup exceptions release the form ownership lock and installed listeners')
    el.remove()
  }

  const memory:Record<string,unknown>={'unrelated-setting':'keep'},local:Record<string,unknown>={'auto-importer:listing-location:v1':'თბილისი','unrelated-local':'keep'}
  let tabs=900
  const managerApi:ExtensionApi={runtime:{id:'state-fixture',onMessage:{addListener(){}},sendMessage:async()=>null,getManifest:()=>({version:'test-update'})},tabs:{query:async()=>[],sendMessage:async()=>({ok:true,vehicle}),create:async()=>({id:++tabs})},storage:{local:{get:async key=>key===null?local:{[key]:local[key]},set:async entries=>{Object.assign(local,entries)},remove:async key=>{delete local[key]}},session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async entries=>{Object.assign(memory,structuredClone(entries))},remove:async key=>{delete memory[key]}}}}
  const photoStore={get:async()=>undefined,put:async()=>{},bytes:async()=>0,remove:async()=>{},prune:async()=>{}}
  const manager=new TransferManager(managerApi,photoStore)
  const source:Sender={id:'state-fixture',tab:{id:9,url:'https://home.manheim24.com/landingPage#/results/fixture'}}
  const start=async()=>{const review=await manager.review(source);return manager.start(source,review.reviewId)}
  const a=await start(),target:Sender={id:'state-fixture',tab:{id:a.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:'first-document'}
  check(await manager.handle({type:'TRANSFER_CLAIM'},target)===null,'activation: pre-update claim messages without current protocol cannot activate')
  check(await manager.handle({type:'TRANSFER_CLAIM',protocol:1,id:crypto.randomUUID()},target)===null,'activation: intended transfer ID must match destination mapping')
  const admitted=await manager.handle({type:'TRANSFER_CLAIM',protocol:1,id:a.id},target) as TransferRecord
  check(admitted.activation?.state==='TRANSFERRING','activation lifecycle: PREPARING to READY to explicitly claimed TRANSFERRING')
  // A stale completed index must not resurrect a job even if claimed was corrupted false.
  const completedRecord={...admitted,status:'review',claimed:false,activation:{schema:1,state:'COMPLETED'}}
  memory[`job:${a.id}`]=completedRecord
  check(await manager.handle({type:'TRANSFER_CLAIM',protocol:1},target)===null,'activation: completed job cannot reactivate through a stale destination index')
  memory[`job:${a.id}`]=admitted
  await manager.validateState()
  check((memory[`job:${a.id}`] as TransferRecord).activation?.state==='TRANSFERRING'&&tabs===901,'update schema: compatible active bound transfer is preserved without navigation')
  // Register the first document before the new tab mapping exists, then simulate refresh.
  const futureTarget={...target,tab:{id:902,url:'https://myauto.ge/ka/add'}}
  check(await manager.handle({type:'TRANSFER_CLAIM',protocol:1},futureTarget)===null,'activation race: first document can register before payload binding')
  const data=structuredClone(vehicle);data.listingId='fixture-new-key'
  managerApi.tabs.sendMessage=async()=>({ok:true,vehicle:data})
  const b=await start()
  check(b.destinationTabId===902&&await manager.handle({type:'TRANSFER_CLAIM',protocol:1},{...futureTarget,documentId:'refreshed-document'})===null,'activation: refresh cannot claim an unclaimed transfer intended for the original document')
  const aged=structuredClone(b);aged.createdAt=Date.now()-121000;memory[`job:${b.id}`]=aged
  check(await manager.handle({type:'TRANSFER_CLAIM',protocol:1},futureTarget)===null&&(memory[`job:${b.id}`] as TransferRecord).activation?.state==='FAILED','activation: abandoned unclaimed intent cannot resume long after the initiating click')
  const legacy=structuredClone(b);delete legacy.activation;memory[`job:${b.id}`]=legacy
  const expired={...record(),id:crypto.randomUUID(),createdAt:Date.now()-31*60000,updatedAt:Date.now()-31*60000};memory[`job:${expired.id}`]=expired;memory['destination:999']=expired.id
  memory['job:malformed']={invalid:true};memory['review:malformed']=null
  await manager.validateState()
  check((memory[`job:${b.id}`] as TransferRecord).activation?.state==='FAILED'&&!memory['destination:999']&&!memory['job:malformed']&&!memory['review:malformed']&&!memory[`job:${expired.id}`]&&tabs===902,'update schema: legacy pending/corrupt/expired records cannot activate or navigate')
  const aborted=await manager.handle({type:'TRANSFER_ABORT',id:a.id,protocol:1},{...target,tab:{id:a.destinationTabId,url:'https://myauto.ge/ka/s/'}})
  check(aborted&&(memory[`job:${a.id}`] as TransferRecord).activation?.state==='FAILED','active cleanup: owning document cancellation terminates only its extension job after navigation')
  memory[`job:${a.id}`]=admitted
  await manager.validateState({invalidateBefore:Date.now()+1})
  check((memory[`job:${a.id}`] as TransferRecord).activation?.state==='FAILED'&&(memory[`job:${a.id}`] as TransferRecord).vehicle.vin===admitted.vehicle.vin&&tabs===902,'extension update: invalidated old document stops safely, preserves payload/progress and never navigates')
  check(local['auto-importer:listing-location:v1']==='თბილისი'&&local['unrelated-local']==='keep'&&memory['unrelated-setting']==='keep','update schema: location preferences and unrelated local/session settings preserved')
}
