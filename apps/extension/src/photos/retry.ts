import {request} from '../services/extensionApi'
import {prepareFiles} from './client'
import {uploadPhotos} from './upload'
import {photoLog} from './diagnostics'
import {photoReceipt} from './receipt'
import type {TransferRecord} from '@auto-importer/shared'
const active=new WeakSet<Document>()
export async function retryPhotos(doc:Document,previous:TransferRecord,options:{pageUrl?:()=>string;uploadTimeoutMs?:number}={}):Promise<TransferRecord>{
  if(active.has(doc))throw new Error('ფოტოები უკვე მუშავდება.')
  active.add(doc)
  let current:TransferRecord|undefined
  const guard=()=>{const vin=doc.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')?.value.trim();if(!/^\/ka\/add\/?$/.test(new URL(options.pageUrl?.()??doc.location.href).pathname)||vin&&vin!==previous.vehicle.vin)throw new Error('ავტომობილი შეიცვალა.')}
  try{
    guard()
    const vin=doc.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')?.value.trim()
    if(!/^\/ka\/add\/?$/.test(new URL(options.pageUrl?.()??doc.location.href).pathname)||vin&&vin!==previous.vehicle.vin)throw new Error('ავტომობილი შეიცვალა.')
    current=await request<TransferRecord>({type:'PHOTO_RETRY_BEGIN',id:previous.id})
    const indices=current.photoReceipt?.retryable??[]
    const prepared=await prepareFiles(current.id,current.photos.total,()=>{},undefined,indices)
    const transferId=current.id
    const resumeSlots=Object.fromEntries((current.photoReceipt?.confirmed??[]).map(item=>[`vehicle-${transferId.slice(0,8)}-${item.index+1}`,item.slot!]))
    guard()
    const uncertain={confirmed:current.photoReceipt?.confirmed??[],retryable:[],uncertain:indices}
    await request({type:'PHOTO_REPORT',id:current.id,receipt:uncertain})
    const upload=await uploadPhotos(doc,prepared.files,()=>{},{transferId:current.id,resumeSlots,guard,timeoutMs:options.uploadTimeoutMs})
    current=await request<TransferRecord>({type:'PHOTO_REPORT',id:current.id,receipt:photoReceipt(current,prepared.files,upload)})
    photoLog(current.id,current.photos.issue?'gallery_unconfirmed':'confirmed',{count:current.photos.uploaded})
    return await request<TransferRecord>({type:'TRANSFER_FINISH',id:current.id,fields:previous.fields,uploaded:current.photos.uploaded,errors:previous.errors})
  }catch{photoLog(previous.id,'gallery_unconfirmed');if(current){const latest=await request<TransferRecord>({type:'TRANSFER_STATUS',id:current.id});return await request<TransferRecord>({type:'TRANSFER_FINISH',id:current.id,fields:previous.fields,uploaded:latest.photos.uploaded,errors:previous.errors})}throw new Error('ფოტოების გადატანა ვერ დასრულდა')}finally{active.delete(doc)}
}
