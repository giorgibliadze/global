import type {PhotoCheckpoint,PhotoTrace,PhotoErrorCode} from './checkpoints'
const aliases:Partial<Record<PhotoCheckpoint,string[]>>={
  MYAUTO_PAGE_READY:['FILLING_TEXT','EDGE_TEXT_FILL_STARTED'],
  PHOTO_SOURCE_READY:['DISCOVERING_PHOTOS'],
  PHOTO_DOWNLOAD_STARTED:['DOWNLOADING_PHOTOS'],
  PHOTO_FILES_PREPARED:['EDGE_PHOTO_PAYLOAD_READY'],
  PHOTO_PAYLOAD_RECEIVED:['EDGE_PHOTO_MESSAGE_SENT','EDGE_PHOTO_MESSAGE_RECEIVED'],
  PHOTO_UPLOAD_STARTED:['UPLOADING_PHOTOS','EDGE_MYAuto_UPLOAD_STARTED'],
  PHOTO_GALLERY_VERIFIED:['VERIFYING','EDGE_MYAuto_UPLOAD_ACCEPTED'],
}
// EDGE-only aliases of existing checkpoints. No uploader behavior is changed.
// Do not forward raw exception messages, VINs, filenames or image URLs.
export function edgeCheckpoint(trace:Pick<PhotoTrace,'transferId'|'vehicleId'|'platform'>,stage:PhotoCheckpoint,count:number,durationMs:number,details:{errorCode?:PhotoErrorCode;index?:number}={}){
  if(trace.platform!=='EdgePipeline'||(import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV!==true)return
  const stages=details.errorCode?[...(['MYAUTO_UPLOADER_READY','PHOTO_UPLOAD_STARTED','PHOTO_UPLOAD_COMPLETED','PHOTO_GALLERY_VERIFIED'].includes(stage)?['EDGE_MYAuto_UPLOAD_FAILED']:[]),...(aliases[stage]??[]).filter(alias=>!alias.endsWith('ACCEPTED'))]:aliases[stage]??[]
  for(const alias of stages.filter(alias=>!alias.endsWith('ACCEPTED')||count>0))console.debug('[Auto Importer EDGE]',{transferId:trace.transferId,vehicleId:trace.vehicleId,stage:alias,lane:alias==='FILLING_TEXT'?'text':'photos',timestamp:new Date().toISOString(),photoCount:count,durationMs,errorCode:details.errorCode,index:details.index,...(alias==='EDGE_PHOTO_MESSAGE_SENT'?{confirmedByReceiver:true}:{})})
}
export function edgeTransferComplete(trace:PhotoTrace,verified:number,expected:number,failed:boolean){
  if(trace.platform==='EdgePipeline'&&(import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE lifecycle]',{transferId:trace.transferId,vehicleId:trace.vehicleId,lane:'photos',stage:!failed&&expected>0&&verified>=expected?'COMPLETED':verified>0?'PARTIAL_SUCCESS':'FAILED',timestamp:new Date().toISOString(),photoCount:verified})
  if(trace.platform==='EdgePipeline'&&!failed&&expected>0&&verified>=expected&&(import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE]',{transferId:trace.transferId,vehicleId:trace.vehicleId,stage:'EDGE_TRANSFER_COMPLETED',timestamp:new Date().toISOString(),photoCount:verified})
}
