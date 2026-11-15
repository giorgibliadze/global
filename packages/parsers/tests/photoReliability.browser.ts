import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {waitForUploader} from '../../../apps/extension/src/photos/readiness'
import {downloadPhoto} from '../../../apps/extension/src/photos/download'
import {parseManheim24,inspectManheim24Photos} from '../src/manheim24'
import {photoReceipt,canRetryPhotos} from '../../../apps/extension/src/photos/receipt'
import type {TransferRecord} from '@auto-importer/shared'
export async function runPhotoReliabilityTests(html:string,check:(value:unknown,label:string)=>void){
  const frame=document.createElement('iframe');document.body.append(frame);const doc=frame.contentDocument!
  doc.open();doc.write(html);doc.close()
  try{
    const vehicle=parseManheim24(doc),data=doc.querySelector('.StockWaveInfo')!,raw=JSON.parse(data.textContent!)
    raw.images=[];delete raw.mainImage;data.textContent=JSON.stringify(raw)
    const gallery=doc.querySelector('#fyusion-prism-viewer')!;gallery.replaceChildren()
    const first=doc.createElement('img');first.src='https://images.cdn.manheim.com/reliable-first.jpg';gallery.append(first)
    const lazy=doc.createElement('img');lazy.className='svfy_ti';gallery.append(lazy)
    const root=doc.querySelector<HTMLElement>('.VehicleDetails__container')!;root.style.visibility='hidden'
    setTimeout(()=>{root.style.visibility='visible'},20)
    const pending=resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},1200)
    setTimeout(()=>{lazy.src='https://images.cdn.manheim.com/reliable-second.jpg'},400)
    const selected=await pending
    check(selected.images.length===2,'reliable photos: temporarily hidden/lazy gallery waits for current URLs rather than freezing its first image')
    raw.fyuseUid='current-album';data.textContent=JSON.stringify(raw);gallery.replaceChildren(first);first.src='https://i.fyuse.com/group/stale-album/1080p/frame.jpg'
    check(inspectManheim24Photos(doc).images.length===0,'reliable photos: stale SPA album is rejected against the selected structured media UID')
    first.src='https://i.fyuse.com/group/current-album/1080p/frame.jpg'
    check(inspectManheim24Photos(doc).images.length===1,'reliable photos: current album remains available without hardcoded vehicle identifiers')
    doc.body.innerHTML='<div data-testid="photo-video-container" style="visibility:hidden;pointer-events:none"><div data-testid="photo-video-dropzone"><input type="file" multiple disabled></div></div>'
    const ready=waitForUploader(doc,undefined,500)
    setTimeout(()=>{doc.querySelector<HTMLElement>('[data-testid="photo-video-container"]')!.style.cssText='';doc.querySelector<HTMLInputElement>('input')!.disabled=false},20)
    await ready;check(true,'reliable photos: uploader initialization is observed, not inferred from input existence')
    let calls=0
    try{await downloadPhoto('https://images.cdn.manheim.com/expired.jpg',0,async()=>{calls++;return new Response('',{status:410})})}catch{/* expected permanent */}
    check(calls===1,'reliable photos: expired HTTP 410 is permanent, not endlessly retried')
    const id=crypto.randomUUID(),files=Array.from({length:3},(_,index)=>new File(['x'],`vehicle-${id.slice(0,8)}-${index+1}.png`,{type:'image/png'}))
    const record={id,photos:{total:3,prepared:3,uploaded:0,failed:0,issue:true}} as TransferRecord
    const receipt=photoReceipt(record,files,{verified:2,errors:['partial'],confirmedNames:files.slice(0,2).map(file=>file.name),slots:{[files[0].name]:'local-first',[files[1].name]:'local-second'},retryNames:[files[2].name]})
    check(receipt.confirmed.length===2&&receipt.retryable[0]===2&&!receipt.uncertain.length&&canRetryPhotos({...record,photoReceipt:receipt}),'reliable photos: receipt retries only the known missing index and retains two confirmed slots')
    const uncertain=photoReceipt(record,files,{verified:0,errors:['interrupted']})
    check(!canRetryPhotos({...record,photoReceipt:uncertain}),'reliable photos: interrupted/unknown uploads are not blindly resubmitted')
  }finally{frame.remove()}
}
