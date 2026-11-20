import type {TransferRecord} from '@auto-importer/shared'
import type {ExtensionApi} from '../services/extensionApi'
import {edgePhotoIdentity} from '@auto-importer/parsers/edge-urls'
import {deduplicatePhotos} from '@auto-importer/parsers/photos'
// Network/gallery waits run outside the shared job lock. Only the final source-
// identity-checked commit uses the lock; text progress remains independent.
export async function refreshEdgeGallery(api:ExtensionApi,record:TransferRecord,commit:(apply:(latest:TransferRecord)=>void)=>Promise<TransferRecord['photos'] & {availableImageCount?:number}>,grow=false){
  let response:{ok?:boolean;value?:{vin:string;listingId?:string;images:string[];availableImageCount:number}}
  let timer:ReturnType<typeof setTimeout>|undefined,timedOut=false
  const started=performance.now()
  const diagnostic=(code:string)=>{if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE lifecycle]',{transferId:record.id,lane:'photos',stage:'DISCOVERING_PHOTOS',errorCode:code,capturedPhotos:record.vehicle.images.length,timestamp:new Date().toISOString(),durationMs:Math.round(performance.now()-started)})}
  try{
    response=await Promise.race([api.tabs.sendMessage(record.sourceTabId,{type:'MANHEIM_PHOTOS',transferId:record.id,expected:{vin:record.vehicle.vin,listingId:record.vehicle.listingId},edgePartial:true,edgeComplete:grow,edgeKnownCount:grow?record.vehicle.images.length:0}) as Promise<typeof response>,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('EDGE გალერეის პასუხს ვადა ამოეწურა.'))},3500)})])
  }catch{diagnostic(timedOut?'SOURCE_RESPONSE_TIMEOUT':'SOURCE_CHANNEL_UNAVAILABLE');if(record.vehicle.images.length)return {...record.photos,availableImageCount:record.vehicle.availableImageCount};throw new Error('EDGE-ის ფოტოები მიუწვდომელია. ტექსტური მონაცემების გადატანა გაგრძელდა.')}
  finally{clearTimeout(timer)}
  const value=response?.ok?response.value:undefined
  if(!value||!Array.isArray(value.images)||value.vin!==record.vehicle.vin||value.listingId!==record.vehicle.listingId){diagnostic(!value?'SOURCE_NOT_READY':'IDENTITY_OR_PAYLOAD_MISMATCH');if(record.vehicle.images.length)return {...record.photos,availableImageCount:record.vehicle.availableImageCount};throw new Error('EDGE-ის მიმდინარე ავტომობილის ფოტოები ვერ დადასტურდა.')}
  const images=deduplicatePhotos(value.images,1000)
  return commit(latest=>{
    if(latest.vehicle.vin!==record.vehicle.vin||latest.vehicle.listingId!==record.vehicle.listingId||latest.status!=='running')throw new Error('EDGE-ის გადატანის ავტომობილი შეიცვალა.')
    // Never reorder or replace indexes already captured/prepared/submitted.
    const incoming=new Set(images.map(edgePhotoIdentity))
    if(!latest.photos.prepared&&!latest.photos.uploaded&&images.length>=latest.vehicle.images.length&&latest.vehicle.images.every(image=>incoming.has(edgePhotoIdentity(image))))latest.vehicle.images=images
    const identities=new Set(latest.vehicle.images.map(edgePhotoIdentity))
    for(const image of images){const identity=edgePhotoIdentity(image);if(!identities.has(identity)&&latest.vehicle.images.length<1000){latest.vehicle.images.push(image);identities.add(identity)}}
    latest.photos.total=latest.vehicle.images.length
    latest.vehicle.availableImageCount=Number.isSafeInteger(value.availableImageCount)&&value.availableImageCount>=latest.photos.total?value.availableImageCount:latest.photos.total
  })
}
