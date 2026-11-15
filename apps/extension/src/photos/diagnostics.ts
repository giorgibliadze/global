export type PhotoStage='gallery_not_loaded'|'no_image_urls'|'invalid_url'|'authentication_expired'|'download_failed'|'messaging_failed'|'file_conversion_failed'|'uploader_not_ready'|'file_input_rejected'|'upload_request_failed'|'gallery_unconfirmed'|'navigation_unconfirmed'|'storage_failed'|'urls_resolved'|'prepared'|'confirmed'
export function photoLog(id:unknown,stage:PhotoStage,details:{index?:number;attempt?:number;count?:number;status?:number}={}){
  const transferId=typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)?id:'pending'
  // Never accepts URLs, exception text, VINs, cookies, tokens or DOM content.
  console.info('[Auto Importer photos]',{transferId,stage,...Object.fromEntries(Object.entries(details).filter(([,v])=>Number.isInteger(v)&&v!>=0))})
}
