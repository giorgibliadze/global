import {photoTrace} from '../photos/checkpoints'
import {resolveSelectedPhotos} from './photos'
import { VehiclePreparation } from './preparation'
import type { PreparationStatus } from '@auto-importer/shared'
import { pipelineLog } from '../services/diagnostics'
import {manheim24Adapter} from './sourceAdapters'
import type {VehicleAdapter} from './sourceAdapters'
import { operation, optionalExtensionApi } from '../services/extensionApi'

const registrations=new WeakMap<Document,{api:ReturnType<typeof optionalExtensionApi>;dispose:()=>void}>()
let preparation:VehiclePreparation|undefined
export function subscribePreparation(listener:(status:PreparationStatus)=>void){return preparation?.subscribe(listener) ?? (()=>{})}

export function registerManheimParser(doc: Document = document,adapter:VehicleAdapter=manheim24Adapter) {
  const api = optionalExtensionApi()
  if (!api?.runtime?.onMessage) return
  const previous=registrations.get(doc)
  if(previous?.api===api)return previous.dispose
  previous?.dispose()
  // Automatic preparation is restricted to the authenticated HTTPS source,
  // matching the manifest/background permissions.
  const instance=doc.defaultView && doc.location.protocol==='https:'?new VehiclePreparation(doc,api,()=>doc.location.href,adapter):undefined
  if(instance)preparation=instance
  const listener:Parameters<typeof api.runtime.onMessage.addListener>[0]=(message, sender, reply) => {
    if(sender.id!==api.runtime.id)return
    if(operation(message)==='VEHICLE_STATUS'){
      let vehicle=false
      try{vehicle=instance?instance.hasSelection():!!adapter.selection(doc,doc.URL)}catch{/* Not a selected vehicle. */}
      reply({ok:true,value:{source:adapter.id,vehicle}});return
    }
    if(operation(message)==='MANHEIM_PHOTOS'){
      const expected=(message as {expected?:{vin:string;listingId?:string}}).expected
      if(!expected || !/^[A-HJ-NPR-Z0-9]{17}$/.test(expected.vin)){reply({ok:false,error:'ავტომობილის ფოტოების იდენტიფიკატორი არასწორია.'});return}
      void photoTrace(String((message as {transferId?:unknown}).transferId??''),expected.vin,adapter.id).then(trace=>resolveSelectedPhotos(doc,expected,6000,trace,current=>adapter.photos(current,current.URL))).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error instanceof Error?error.message:'ფოტოები ვერ წაიკითხა.'}));return true
    }
    if(operation(message)==='MANHEIM_VERIFY'){reply({ok:true,verified:instance?.verify((message as {preparationId?:unknown}).preparationId) ?? false});return}
    if(operation(message)==='MANHEIM_RESOLVE' && instance){
      void instance.resolve().then(value=>reply({ok:true,...value}),()=>reply({ok:false,error:'მონაცემები ვერ მომზადდა. დაელოდეთ ავტომობილის დეტალების ჩატვირთვას.'}));return true
    }
    if(!['MANHEIM_PARSE','MANHEIM_RESOLVE'].includes(operation(message) ?? ''))return
    const id=(message as {transferId?:unknown}).transferId
    pipelineLog(id,'extracting','started')
    try { const vehicle=adapter.parse(doc,doc.URL); pipelineLog(id,'extracting','completed'); reply({ ok: true, vehicle }) }
    catch (error) { pipelineLog(id,'extracting','failed'); reply({ ok: false, error: error instanceof Error ? error.message : 'ავტომობილის ამოცნობა ვერ მოხერხდა.' }) }
  }
  api.runtime.onMessage.addListener(listener)
  let disposed=false
  const dispose=()=>{
    if(disposed)return
    disposed=true
    if(registrations.get(doc)?.dispose===dispose)registrations.delete(doc)
    doc.defaultView?.removeEventListener('pagehide',pagehide)
    try{api.runtime.onMessage.removeListener?.(listener)}catch{pipelineLog(undefined,'cleanup','failed')}
    instance?.dispose()
    if(preparation===instance)preparation=undefined
    if(adapter.id==='ManheimSite')try{void api.runtime.sendMessage({type:'PREFETCH_INVALIDATE',preparationId:crypto.randomUUID()}).catch(()=>{pipelineLog(undefined,'cleanup','failed')})}catch{pipelineLog(undefined,'cleanup','failed')}
  }
  const pagehide=(event:PageTransitionEvent)=>{if(!event.persisted)dispose()}
  registrations.set(doc,{api,dispose});doc.defaultView?.addEventListener('pagehide',pagehide)
  return dispose
}
