import {uploadPhotos} from '../../../apps/extension/src/photos/upload'
import {prepareFiles} from '../../../apps/extension/src/photos/client'
import {photoTrace,photoReport} from '../../../apps/extension/src/photos/checkpoints'
import {downloadPhoto} from '../../../apps/extension/src/photos/download'
export async function runPhotoCheckpointTests(check:(v:unknown,label:string)=>void){
  const logs:unknown[][]=[],original=console.info
  console.info=(...args:unknown[])=>{logs.push(args)}
  try{
    const id='abcd1234-1234-1234-1234-123456789abc',identity='PRIVATE-VEHICLE-ID'
    const trace=await photoTrace(id,identity),receiver=await photoTrace(id,identity),other=await photoTrace(id,'OTHER')
    check(trace.vehicleId===receiver.vehicleId && trace.vehicleId!==other.vehicleId,'photo diagnostics: stable transfer-scoped vehicle pseudonym across contexts')
    trace.mark('PHOTO_SOURCE_READY',15)
    let calls=0
    try{await downloadPhoto('https://i.fyuse.com/group/fixture/a/b/frames_1.jpg',0,async()=>{calls++;return new Response(null,{status:410})},trace)}catch{/* permanent response is expected */}
    photoReport(trace,{source:15,downloaded:0,received:0,attempts:0,verified:0},'PHOTO_DOWNLOAD_COMPLETED','HTTP_EXPIRED')
    const entries=logs.map(row=>row[1]) as Record<string,unknown>[]
    check(calls===1 && entries.some(row=>row.stage==='PHOTO_DOWNLOAD_COMPLETED'&&row.errorCode==='HTTP_EXPIRED'),'photo diagnostics: expired URL identifies download checkpoint without permanent retry')
    check(entries.filter(row=>row.stage).every(row=>typeof row.timestamp==='string'&&typeof row.durationMs==='number'&&typeof row.photoCount==='number'&&row.transferId===id&&row.vehicleId===trace.vehicleId),'photo diagnostics: checkpoint ID, timestamp, duration and count present')
    check(!JSON.stringify(logs).includes(identity)&&!JSON.stringify(logs).includes('https://'),'photo diagnostics: no raw vehicle identity or image URLs')
    const report=entries.at(-1)!
    check(report.uploadAttempts===0&&report.photosVerifiedInGallery===0&&report.failureStage==='PHOTO_DOWNLOAD_COMPLETED','photo diagnostics: zero upload is a failed stage, never gallery success')
    const frame=document.createElement('iframe');document.body.append(frame)
    try{
      const doc=frame.contentDocument!
      doc.body.innerHTML='<div data-testid="photo-video-container"><span>ფოტო 0 / 15</span><div data-testid="photo-video-dropzone"><input type="file" multiple></div></div>'
      const input=doc.querySelector('input')!
      input.addEventListener('input',()=>input.replaceWith(input.cloneNode(true)),{once:true})
      const result=await uploadPhotos(doc,[new File(['fixture'],'vehicle.jpg',{type:'image/jpeg'})],()=>{},{trace,timeoutMs:50})
      check(result.verified===0&&result.errorCode==='INPUT_REPLACED','photo diagnostics: input replaced between input/change is detected without a duplicate submission')
    }finally{frame.remove()}
    const chrome=(globalThis as typeof globalThis & {chrome?:unknown}).chrome
    const setChrome=(sendMessage:(message:unknown)=>Promise<unknown>)=>{(globalThis as typeof globalThis & {chrome?:unknown}).chrome={runtime:{sendMessage}}}
    try{
      setChrome(async()=>{throw new Error('private-runtime-error')})
      const lost=await prepareFiles(id,1,()=>{},undefined,undefined,trace)
      check(lost.failureCode==='MESSAGE_FAILED'&&!lost.files.length,'photo diagnostics: runtime rejection is distinct from HTTP/download failure')
      setChrome(async()=>({ok:false,photoErrorCode:'HTTP_EXPIRED'}))
      const expired=await prepareFiles(id,1,()=>{},undefined,undefined,trace)
      check(expired.failureCode==='HTTP_EXPIRED'&&!expired.downloaded,'photo diagnostics: background HTTP failure survives JSON response without sensitive text')
      const bytes=new Uint8Array([255,216,255,0]),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')
      let corrupt=false
      setChrome(async(message)=>({ok:true,value:(message as {type:string}).type==='PHOTO_PREPARE'?{index:0,name:'vehicle.jpg',size:4,mime:'image/jpeg',sha256:corrupt?'0'.repeat(64):hash}:btoa(String.fromCharCode(...bytes))}))
      const received=await prepareFiles(id,1,()=>{},undefined,undefined,trace)
      check(received.files.length===1&&received.downloaded===1&&received.files[0] instanceof File,'photo diagnostics: valid binary chunks produce a real File')
      corrupt=true
      const broken=await prepareFiles(id,1,()=>{},undefined,undefined,trace)
      check(broken.downloaded===1&&!broken.files.length&&broken.failureCode==='HASH_MISMATCH','photo diagnostics: downloaded bytes with bad integrity are not counted as received Files')
    }finally{(globalThis as typeof globalThis & {chrome?:unknown}).chrome=chrome}
  }finally{console.info=original}
}
