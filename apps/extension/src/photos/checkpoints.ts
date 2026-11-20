import {edgeCheckpoint,edgeTransferComplete} from './edgeDiagnostics'
import type {NormalizedVehicle} from '@auto-importer/shared'
export type PhotoCheckpoint = 'MYAUTO_PAGE_READY' | 'PHOTO_FILES_PREPARED' | 'MYAUTO_UPLOAD_STATE_STARTED' | 'MYAUTO_UPLOAD_STATE_PROGRESS' | 'PHOTO_SOURCE_READY' | 'PHOTO_URLS_EXTRACTED' | 'PHOTO_DOWNLOAD_STARTED' | 'PHOTO_DOWNLOAD_COMPLETED' | 'PHOTO_PAYLOAD_RECEIVED' | 'MYAUTO_UPLOADER_READY' | 'PHOTO_UPLOAD_STARTED' | 'PHOTO_UPLOAD_COMPLETED' | 'PHOTO_GALLERY_VERIFIED'
export type PhotoErrorCode = 'SOURCE_NOT_READY' | 'IDENTITY_MISMATCH' | 'NO_URLS' | 'URL_REJECTED' | 'HTTP_AUTH' | 'HTTP_EXPIRED' | 'HTTP_TRANSIENT' | 'HTTP_FAILED' | 'NETWORK_OR_TIMEOUT' | 'INVALID_IMAGE_BYTES' | 'STORAGE_FAILED' | 'MESSAGE_TIMEOUT' | 'MESSAGE_FAILED' | 'BACKGROUND_PREPARATION_FAILED' | 'CHUNK_UNAVAILABLE' | 'INVALID_METADATA' | 'INVALID_CHUNK' | 'HASH_MISMATCH' | 'FILE_CONVERSION_FAILED' | 'UPLOADER_TIMEOUT' | 'INPUT_REPLACED' | 'INPUT_REJECTED' | 'UPLOAD_UNCONFIRMED' | 'EMPTY_GALLERY' | 'INTERRUPTED'
export interface PhotoTrace {
  transferId:string; vehicleId:string; platform?:NormalizedVehicle['source']
  mark(stage:PhotoCheckpoint,count:number,details?:{errorCode?:PhotoErrorCode;index?:number;attempt?:number;accepted?:number;failed?:number}):void
}
// Salt the pseudonym with the transfer ID: no VIN/listing ID, URL, exception or DOM
// can enter diagnostic output. The same transfer joins across isolated contexts.
export async function photoTrace(id:string,identity:string,platform?:NormalizedVehicle['source']):Promise<PhotoTrace>{
  const transferId=/^[a-f0-9-]{36}$/.test(id)?id:'pending'
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${transferId}:${identity}`))
  const vehicleId=[...new Uint8Array(hash)].slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join('')
  const limit=platform==='EdgePipeline'?1000:15
  const started=performance.now()
  return {transferId,vehicleId,platform,mark(stage,count,details={}){
    if(platform==='EdgePipeline')edgeCheckpoint({transferId,vehicleId,platform},stage,count,Math.round(performance.now()-started),details)
    console.info('[Auto Importer photo checkpoint]',{transferId,vehicleId,platform:platform??'unknown',timestamp:new Date().toISOString(),stage,photoCount:Math.max(0,Math.min(limit,Number.isInteger(count)?count:0)),durationMs:Math.round(performance.now()-started),...(details.errorCode?{errorCode:details.errorCode}:{}),...(Number.isInteger(details.index)?{index:details.index}:{}),...(Number.isInteger(details.attempt)?{attempt:details.attempt}:{}),...(Number.isInteger(details.accepted)&&details.accepted!>=0&&details.accepted!<=limit?{accepted:details.accepted}:{}),...(Number.isInteger(details.failed)&&details.failed!>=0&&details.failed!<=limit?{failed:details.failed}:{})})
  }}
}
export function photoReport(trace:PhotoTrace,counts:{source:number;downloaded:number;received:number;attempts:number;verified:number;discovered?:number;delivered?:number},failureStage?:PhotoCheckpoint,errorCode?:PhotoErrorCode){
  if(trace.platform==='EdgePipeline')edgeTransferComplete(trace,counts.verified,counts.source,!!failureStage||!!errorCode)
  console.info('[Auto Importer photo report]',{transferId:trace.transferId,vehicleId:trace.vehicleId,platform:trace.platform??'unknown',timestamp:new Date().toISOString(),sourcePhotosFound:counts.source,photosDiscovered:counts.discovered??counts.source,photosSelected:counts.source,filesDelivered:counts.delivered??0,photosDownloaded:counts.downloaded,photosReceivedByMyauto:counts.received,uploadAttempts:counts.attempts,photosVerifiedInGallery:counts.verified,failureStage:failureStage??null,errorCode:errorCode??null,rootCause:failureStage?'See the checkpoint error code. Server/authentication cause requires live Network evidence.':null,recommendedFix:failureStage?'Inspect the first failing checkpoint for this transfer ID; do not replay successful uploads.':null})
}

export function isPhotoErrorCode(value:unknown):value is PhotoErrorCode {
  return typeof value==='string' && ['SOURCE_NOT_READY','IDENTITY_MISMATCH','NO_URLS','URL_REJECTED','HTTP_AUTH','HTTP_EXPIRED','HTTP_TRANSIENT','HTTP_FAILED','NETWORK_OR_TIMEOUT','INVALID_IMAGE_BYTES','STORAGE_FAILED','MESSAGE_TIMEOUT','MESSAGE_FAILED','BACKGROUND_PREPARATION_FAILED','CHUNK_UNAVAILABLE','INVALID_METADATA','INVALID_CHUNK','HASH_MISMATCH','FILE_CONVERSION_FAILED','UPLOADER_TIMEOUT','INPUT_REPLACED','INPUT_REJECTED','UPLOAD_UNCONFIRMED','EMPTY_GALLERY','INTERRUPTED'].includes(value)
}
export function preparationFailureStage(code?:PhotoErrorCode):PhotoCheckpoint {
  return code && ['URL_REJECTED','HTTP_AUTH','HTTP_EXPIRED','HTTP_TRANSIENT','HTTP_FAILED','NETWORK_OR_TIMEOUT','INVALID_IMAGE_BYTES','STORAGE_FAILED'].includes(code)?'PHOTO_DOWNLOAD_COMPLETED':'PHOTO_PAYLOAD_RECEIVED'
}
