import type {TransferRecord} from '@auto-importer/shared'
import {optionalExtensionApi,operation} from '../services/extensionApi'
import type {ExtensionApi} from '../services/extensionApi'
import {isMyautoAddUrl,liveClaim,transferId,TRANSFER_PROTOCOL} from '../services/transferActivation'
import {pipelineLog} from '../services/diagnostics'

type Runner={runMyautoTransfer:(doc:Document,record:TransferRecord,onUpdate:(record:TransferRecord)=>void,options:{signal:AbortSignal})=>Promise<TransferRecord>}
interface Options {api?:ExtensionApi;url?:()=>string;load?:()=>Promise<Runner>;notice?:(photo:boolean)=>void}
const receivers=new WeakMap<Document,{dispose:()=>void}>()
// Tiny isolated-world bootstrap. Ordinary pages never load the form/photo modules.
export function installMyautoReceiver(doc:Document=document,options:Options={}){
  if(receivers.has(doc))return receivers.get(doc)!
  const url=options.url??(()=>doc.location.href),api=options.api??optionalExtensionApi()
  if(!isMyautoAddUrl(url())||!api?.runtime?.id)return
  const navigation=doc.defaultView?.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined
  if(navigation?.type==='reload'||navigation?.type==='back_forward')return
  let disposed=false,busy=false,queued:string|undefined
  let activeId:string|undefined,settled=false
  const attempted=new Set<string>(),controller=new AbortController()
  const load=options.load??(()=>import('./transfer'))
  const listener:Parameters<ExtensionApi['runtime']['onMessage']['addListener']>[0]=(message,sender,reply)=>{
    if(sender.id!==api.runtime.id||operation(message)!=='TRANSFER_READY')return
    const input=message as {id?:unknown;protocol?:unknown}
    if(input.protocol!==TRANSFER_PROTOCOL||!transferId(input.id)||disposed||!isMyautoAddUrl(url()))return
    try{reply({ok:true})}catch{pipelineLog(input.id,'messaging','failed')}
    if(!attempted.has(input.id)){queued=input.id;safeProbe()}
  }
  const dispose=()=>{
    if(disposed)return
    disposed=true;controller.abort()
    if(activeId&&!settled)try{void api.runtime.sendMessage({type:'TRANSFER_ABORT',id:activeId,protocol:TRANSFER_PROTOCOL}).catch(()=>{pipelineLog(activeId,'messaging','failed')})}catch{pipelineLog(activeId,'messaging','failed')}
    try{api.runtime.onMessage.removeListener?.(listener)}catch{/* Old extension contexts may already be invalid. */}
    doc.defaultView?.removeEventListener('pagehide',dispose)
    receivers.delete(doc)
  }
  async function probe(){
    if(disposed||busy||!isMyautoAddUrl(url()))return
    busy=true
    const expected=queued;queued=undefined
    let admitted=false,admittedId:string|undefined
    try{
      // One read, not twenty speculative polls. The READY event closes the tab-
      // creation/storage-binding race if the first probe arrives too early.
      const result=await api!.runtime.sendMessage({type:'TRANSFER_CLAIM',protocol:TRANSFER_PROTOCOL,...(expected?{id:expected}:{})}) as {ok?:boolean;value?:unknown}
      if(disposed||!isMyautoAddUrl(url())||!result?.ok||!liveClaim(result.value))return
      const record=result.value
      if(expected&&record.id!==expected||attempted.has(record.id))return
      attempted.add(record.id);admitted=true;admittedId=record.id;activeId=record.id
      if(queued===record.id)queued=undefined
      const runner=await load()
      if(disposed||!isMyautoAddUrl(url()))return
      const completed=await runner.runMyautoTransfer(doc,record,()=>{},{signal:controller.signal})
      settled=true
      if(!disposed&&isMyautoAddUrl(url())&&(completed.photos.uploaded<completed.photos.total||!completed.photos.uploaded))notice(true)
    }catch{
      pipelineLog(admittedId??expected,'claiming','failed')
      // No toast/DOM changes for ordinary visits or invalidated contexts.
      if(admitted&&!disposed&&isMyautoAddUrl(url()))notice(false)
    }finally{
      busy=false
      if(admitted)dispose()
      else if(queued&&!disposed)safeProbe()
    }
  }
  function notice(photo:boolean){try{options.notice?.(photo)}catch{pipelineLog(undefined,'messaging','failed')}}
  function safeProbe(){void probe().catch(()=>{pipelineLog(undefined,'claiming','failed')})}
  const receiver={dispose};receivers.set(doc,receiver)
  try{
    api.runtime.onMessage.addListener(listener)
    doc.defaultView?.addEventListener('pagehide',dispose,{once:true})
    safeProbe()
  }catch{dispose();pipelineLog(undefined,'claiming','failed')}
  return receiver
}
