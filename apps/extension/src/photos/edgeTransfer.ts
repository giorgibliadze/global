import type {PhotoTrace,PhotoErrorCode} from './checkpoints'
import {prepareFiles} from './client'
import {uploadPhotos} from './upload'
import {waitForUploader} from './readiness'
import {waitForDomReady} from '../services/domReady'
import {request} from '../services/extensionApi'
export function edgeDestinationLimit(doc:Document){
  const text=doc.querySelector('[data-testid="photo-video-container"]')?.textContent
  const match=text?.match(/ფოტო\s*(\d+)\s*\/\s*(\d+)/),count=Number(match?.[1]),limit=Number(match?.[2])
  return match&&Number.isInteger(count)&&Number.isInteger(limit)&&count>=0&&count<=limit&&limit>0&&limit<=1000?{count,limit}:undefined
}
const collectionBytes=128*1024*1024
function diagnostic(trace:PhotoTrace,stage:string,start:number,counts:Record<string,string|number>={}){
  if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE batch]',{transferId:trace.transferId,vehicleId:trace.vehicleId,stage,timestamp:new Date().toISOString(),durationMs:Math.round(performance.now()-start),...counts})
}
// Internal transport remains chunked and bounded. The existing uploader receives
// ONE ordered File collection, only after text and photo preparation have settled.
export async function transferEdgePhotos(doc:Document,id:string,total:number,available:number,trace:PhotoTrace,options:{signal:AbortSignal;guard:()=>void;timeoutMs?:number;beforeUpload?:Promise<void>;grow?:()=>Promise<{total:number;availableImageCount?:number}>;update:(counts:{total:number;prepared:number;failed:number;uploaded:number;submitted:number})=>void}){
  if(trace.platform!=='EdgePipeline')throw new Error('ფოტოების წყარო არასწორია.')
  const started=performance.now(),files:File[]=[],errors:string[]=[],counts={prepared:0,failed:0,uploaded:0,submitted:0}
  let failureCode:PhotoErrorCode|undefined,downloaded=0,attempts=0,downloadMs=0,uploadMs=0,bytes=0,processed=0,growthAttempts=0
  const signal=AbortSignal.any([options.signal,AbortSignal.timeout(60000)])
  const update=()=>options.update({total,...counts})
  await waitForUploader(doc,signal,options.timeoutMs??25000,id)
  await waitForDomReady(doc,()=>!!edgeDestinationLimit(doc),signal,options.timeoutMs??10000)
  const capacity=edgeDestinationLimit(doc)!
  if(capacity.count!==0)throw new Error('ფოტოგალერეა ცარიელი არ არის. არსებული ფოტოები არ შეცვლილა.')
  const input=doc.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]')
  if(!input?.multiple)throw new Error('MyAuto-ს ფორმაში ფოტოების ერთიანი მრავალფაილიანი გადაცემა ვერ დადასტურდა.')
  // Source waits are outside text/job locks; partial discovery has a deadline.
  if(options.grow&&available>total&&total<capacity.limit){
    for(;growthAttempts<2;){
      growthAttempts++
      signal.throwIfAborted();const before=total
      try{const next=await options.grow();total=Math.max(total,next.total);available=Math.max(available,next.availableImageCount??next.total)}catch{errors.push('EDGE-ის სრული ფოტოგალერეა ვერ დადასტურდა; ხელმისაწვდომი ფოტოები შენარჩუნებულია.');break}
      if(total<=before||total>=available)break
    }
    update()
  }
  const prepareMore=async()=>{try{
    while(processed<total&&files.length<capacity.limit){
      options.guard();signal.throwIfAborted()
      const batch=Array.from({length:Math.min(4,total-processed,capacity.limit-files.length)},(_,index)=>processed+index)
      processed+=batch.length
      const beforeReady=counts.prepared,beforeFailed=counts.failed,at=performance.now()
      const prepared=await prepareFiles(id,total,(ready,failed)=>{counts.prepared=beforeReady+ready;counts.failed=beforeFailed+failed;update()},signal,batch,trace)
      downloadMs+=performance.now()-at;downloaded+=prepared.downloaded;failureCode??=prepared.failureCode;errors.push(...prepared.errors)
      for(const file of prepared.files){
        if(bytes+file.size>collectionBytes){counts.prepared--;counts.failed++;errors.push('EDGE-ის ერთიანი ფოტო-კოლექცია დროებითი მეხსიერების დამცავ ზღვარს სცდება.');continue}
        files.push(file);bytes+=file.size
      }
      // Native Files now own their bytes; release only the extension's job copy.
      // This is not an upload and does not dispatch any input event.
      await request({type:'EDGE_PHOTO_RELEASE',id,indices:batch})
      update()
    }
  }catch(error){options.signal.throwIfAborted();failureCode??='MESSAGE_TIMEOUT';errors.push(signal.aborted?'EDGE-ის ფოტოების მომზადების ვადა ამოიწურა. მომზადებული ფაილები შენარჩუნებულია.':error instanceof Error?error.message:'EDGE-ის ფოტოების მომზადება ვერ დასრულდა.')}finally{counts.prepared=files.length;counts.failed=Math.max(counts.failed,processed-files.length);update()}}
  await prepareMore()
  // Never advance upload/final job stages ahead of outstanding text progress.
  if(options.beforeUpload){
    const textSignal=AbortSignal.any([options.signal,AbortSignal.timeout(60000)])
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{cleanup();reject(textSignal.reason)}
      const cleanup=()=>textSignal.removeEventListener('abort',abort)
      textSignal.addEventListener('abort',abort,{once:true});if(textSignal.aborted){abort();return}
      options.beforeUpload!.then(()=>{cleanup();resolve()},error=>{cleanup();reject(error)})
    })
  }
  diagnostic(trace,'EDGE_TEXT_FILL_COMPLETED',started)
  if(options.grow&&available>total&&files.length<capacity.limit&&growthAttempts<2&&!signal.aborted){
    try{const next=await options.grow();total=Math.max(total,next.total);available=Math.max(available,next.availableImageCount??next.total);await prepareMore()}catch{errors.push('EDGE-ის დარჩენილი ფოტოები ვერ მოიძებნა; მომზადებული ფაილები შენარჩუნებულია.')}
  }

  diagnostic(trace,total>=available&&processed>=Math.min(total,capacity.limit)?'EDGE_BATCH_PREPARATION_COMPLETED':'EDGE_BATCH_PREPARATION_PARTIAL',started,{expected:available,discovered:total,prepared:files.length,failed:counts.failed})
  if(files.length){
    // React may have replaced the input during text filling. Resolve it afresh.
    await waitForUploader(doc,options.signal,options.timeoutMs??25000,id)
    const current=edgeDestinationLimit(doc),fresh=doc.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]')
    if(!current||current.count!==0||current.limit<files.length||!fresh?.multiple)throw new Error('MyAuto-ს ფოტოგალერეის მდგომარეობა შეიცვალა. არსებული ფოტოები არ შეცვლილა.')
    options.guard();options.signal.throwIfAborted()
    diagnostic(trace,'EDGE_BATCH_UPLOAD_STARTED',started,{prepared:files.length,bytes})
    const at=performance.now()
    const upload=await uploadPhotos(doc,files,count=>{counts.uploaded=count;update()},{signal:options.signal,guard:options.guard,timeoutMs:options.timeoutMs,trace,edge:{limit:current.limit,ownedIds:[],ownedUrls:[]},onSubmitted:count=>{attempts++;counts.submitted=count;update()}})
    uploadMs=performance.now()-at;counts.uploaded=upload.verified;errors.push(...upload.errors);failureCode??=upload.errorCode
    diagnostic(trace,upload.verified===files.length?'EDGE_BATCH_UPLOAD_ACCEPTED':'EDGE_BATCH_UPLOAD_FAILED',started,{prepared:files.length,accepted:upload.verified,attempts})
  }else{errors.push('ფოტოების გადატანა ვერ დასრულდა');diagnostic(trace,'EDGE_BATCH_UPLOAD_FAILED',started,{prepared:0,accepted:0,errorCode:failureCode??'NO_URLS'})}
  if(available>total)errors.push(`წყაროს გალერეაში მითითებულია ${available} ფოტო; ხელმისაწვდომი გახდა ${total}. დარჩენილი ${available-total} ფოტო ვერ მოიძებნა.`)
  if(total>processed&&files.length===capacity.limit)errors.push(`MyAuto-ს ფორმის ლიმიტია ${capacity.limit} ფოტო; დარჩენილი ${total-processed} ფოტო ამ ლიმიტის გამო არ გადაიტანება.`)
  update();const peakBatchFiles=files.length
  files.length=0
  return {...counts,total,available,downloaded,attempts,failureCode,errors:[...new Set(errors)].slice(0,10),selected:Math.min(total,capacity.limit),limit:capacity.limit,peakBatchFiles,downloadMs,uploadMs}
}
