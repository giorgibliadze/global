import {resolveSelectedPhotos} from './photos'
import { VehiclePreparation } from './preparation'
import type { PreparationStatus } from '@auto-importer/shared'
import { pipelineLog } from '../services/diagnostics'
import { parseManheim24 } from '@auto-importer/parsers'
import { operation, optionalExtensionApi } from '../services/extensionApi'

let preparation:VehiclePreparation|undefined
export function subscribePreparation(listener:(status:PreparationStatus)=>void){return preparation?.subscribe(listener) ?? (()=>{})}

export function registerManheimParser(doc: Document = document) {
  const api = optionalExtensionApi()
  if (!api?.runtime?.onMessage) return
  // Automatic preparation is restricted to the authenticated HTTPS source,
  // matching the manifest/background permissions.
  if(doc.defaultView && doc.location.protocol==='https:'){preparation?.dispose();preparation=new VehiclePreparation(doc,api)}
  api.runtime.onMessage.addListener((message, sender, reply) => {
    if(sender.id!==api.runtime.id)return
    if(operation(message)==='MANHEIM_PHOTOS'){
      const expected=(message as {expected?:{vin:string;listingId?:string}}).expected
      if(!expected || !/^[A-HJ-NPR-Z0-9]{17}$/.test(expected.vin)){reply({ok:false,error:'ავტომობილის ფოტოების იდენტიფიკატორი არასწორია.'});return}
      void resolveSelectedPhotos(doc,expected).then(value=>reply({ok:true,value}),error=>reply({ok:false,error:error instanceof Error?error.message:'ფოტოები ვერ წაიკითხა.'}));return true
    }
    if(operation(message)==='MANHEIM_VERIFY'){reply({ok:true,verified:preparation?.verify((message as {preparationId?:unknown}).preparationId) ?? false});return}
    if(operation(message)==='MANHEIM_RESOLVE' && preparation){
      void preparation.resolve().then(value=>reply({ok:true,...value}),()=>reply({ok:false,error:'მონაცემები ვერ მომზადდა. დაელოდეთ ავტომობილის დეტალების ჩატვირთვას.'}));return true
    }
    if(!['MANHEIM_PARSE','MANHEIM_RESOLVE'].includes(operation(message) ?? ''))return
    const id=(message as {transferId?:unknown}).transferId
    pipelineLog(id,'extracting','started')
    try { const vehicle=parseManheim24(doc); pipelineLog(id,'extracting','completed'); reply({ ok: true, vehicle }) }
    catch (error) { pipelineLog(id,'extracting','failed'); reply({ ok: false, error: error instanceof Error ? error.message : 'ავტომობილის ამოცნობა ვერ მოხერხდა.' }) }
  })
}
