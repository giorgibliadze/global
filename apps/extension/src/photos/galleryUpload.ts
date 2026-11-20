import {waitForGalleryActivity} from './activity'
import type {UploadResult,UploadOptions} from './upload'

// Confirmed public MyAuto contract: loading-local-ID placeholders become
// item-local-ID cards only after the server completes; failures remove that ID.
export async function uploadNamedGallery(doc:Document,files:File[],progress:(count:number)=>void,options:UploadOptions):Promise<UploadResult>{
  const selector='[data-testid="photo-video-container"]'
  const root=()=>doc.querySelector(selector)
  const ids=(kind:'item'|'loading')=>[...(root()?.querySelectorAll<HTMLElement>(`[data-testid^="photo-video-${kind}-"]`)??[])].map(node=>node.dataset.testid!.slice(`photo-video-${kind}-`.length))
  const edge=options.trace?.platform==='EdgePipeline'?options.edge:undefined,limit=edge?.limit??15,baseline=new Set(edge?.ownedIds??[])
  const initial=ids('item'),counter=(edge?root()?.textContent:root()?.querySelector('[data-testid="photo-video-label"]')?.textContent)?.match(/ფოტო\s*(\d+)\s*\/\s*(\d+)/)
  if(!Number.isInteger(limit)||limit<1||limit>1000||files.length+baseline.size>limit||initial.length!==baseline.size||initial.some(id=>!baseline.has(id))||ids('loading').length||Number(counter?.[1])!==baseline.size||Number(counter?.[2])!==limit)return {verified:0,errors:['ფოტოგალერეა ცარიელი არ არის. არსებული ფოტოები არ შეცვლილა.']}
  const mapped=new Map<string,File>(),confirmed=new Set<string>()
  let verified=0,reported=-1,submitted=0,pending=files
  let submissionAt=0,acceptedAt=0,queueAt=0,completeSignature=''
  const timeout=options.timeoutMs??45000,deadline=Date.now()+timeout
  for(let attempt=0;attempt<2 && pending.length;attempt++){
    options.signal?.throwIfAborted();options.guard?.()
    const input=doc.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]')
    if(!input || input.disabled || !doc.defaultView?.DataTransfer)return {verified,errors:['MyAuto-ს ფოტოების ფაილის ამრჩევი მიუწვდომელია.']}
    let observedRoot=root()!
    const seen=new Set([...ids('item'),...ids('loading')]),newIds:string[]=[]
    const capture=(node:Node)=>{
      if(node.nodeType!==1)return
      const element=node as HTMLElement
      for(const item of [element,...element.querySelectorAll<HTMLElement>('[data-testid^="photo-video-loading-"],[data-testid^="photo-video-item-"]')]){
        const match=item.dataset.testid?.match(/^photo-video-(?:loading|item)-(.+)$/)
        if(match && !seen.has(match[1])){seen.add(match[1]);newIds.push(match[1]);if(!queueAt && item.dataset.testid?.startsWith('photo-video-loading-')){queueAt=performance.now();options.trace?.mark('MYAUTO_UPLOAD_STATE_STARTED',newIds.length);if(submissionAt)options.onTiming?.('uploadQueueWait',queueAt-submissionAt)}}
      }
    }
    const observer=new doc.defaultView.MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)capture(node)})
    observer.observe(root()!,{subtree:true,childList:true})
    try{
      const data=new doc.defaultView.DataTransfer();for(const file of pending)data.items.add(file)
      if(!input.isConnected){options.trace?.mark('PHOTO_UPLOAD_STARTED',0,{errorCode:'INPUT_REPLACED'});return {verified,errorCode:'INPUT_REPLACED',errors:['ფოტოების გადატანა ვერ დასრულდა']}}
      const submissionStarted=performance.now();submissionAt ||= submissionStarted
      input.files=data.files;if(input.files?.length!==pending.length)return {verified,errorCode:'INPUT_REJECTED',errors:['ფოტოების გადატანა ვერ დასრულდა']}
      options.trace?.mark('PHOTO_UPLOAD_STARTED',pending.length,{attempt:attempt+1});input.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}))
      options.onTiming?.('fileSubmission',performance.now()-submissionStarted)
      submitted+=pending.length;options.onSubmitted?.(Math.min(files.length,submitted))
      let settledAt=0,lastSignature='',retry=false
      while(Date.now()<deadline){
        options.signal?.throwIfAborted();options.guard?.()
        const container=root();if(!container)return {verified,errors:['ფოტოგალერეა გვერდიდან გაქრა.']}
        if(container!==observedRoot){observer.disconnect();capture(container);observer.observe(container,{subtree:true,childList:true});observedRoot=container}
        // Flush records before matching indexes, including placeholders that
        // disappear in the same task. No filenames or image URLs are logged.
        for(const record of observer.takeRecords())for(const node of record.addedNodes)capture(node)
        if(newIds.length===pending.length)for(let i=0;i<newIds.length;i++)mapped.set(newIds[i],pending[i])
        const cards=[...container.querySelectorAll<HTMLElement>('[data-testid^="photo-video-item-"]')]
        confirmed.clear()
        for(const card of cards){
          const id=card.dataset.testid!.slice('photo-video-item-'.length),image=card.querySelector<HTMLImageElement>('[data-testid^="photo-video-image-"]')
          if(!mapped.has(id)||!image)continue
          try{if(new URL(image.currentSrc||image.src).protocol==='https:')confirmed.add(id)}catch{/* Pending image, never success. */}
        }
        verified=confirmed.size;if(verified!==reported){reported=verified;progress(verified)}
        const loading=ids('loading'),count=Number((edge?container.textContent:container.querySelector('[data-testid="photo-video-label"]')?.textContent)?.match(new RegExp('ფოტო\\s*(\\d+)\\s*\\/\\s*'+limit+'(?!\\d)'))?.[1])
        const signature=JSON.stringify([ids('item'),loading,count,verified])
        if(signature!==lastSignature){lastSignature=signature;settledAt=Date.now();options.trace?.mark('MYAUTO_UPLOAD_STATE_PROGRESS',loading.length,{accepted:verified})}
        const settled=!loading.length && count===cards.length && Date.now()-settledAt>=Math.min(750,timeout/4)
        // Public MyAuto handler creates item cards with remote URLs only after
        // the upload response clears isLoading. Preview decoding is independent.
        // Require the same complete queue/count/identity state on a second turn;
        // retain the quiet window below exclusively for safe partial retries.
        const complete=verified===files.length && !loading.length && count===cards.length && cards.length===files.length+baseline.size&&[...baseline].every(id=>cards.some(card=>card.dataset.testid==='photo-video-item-'+id)) && !container.querySelector('[aria-busy="true"],[role="progressbar"],progress')
        if(complete){
          if(!acceptedAt){acceptedAt=performance.now();options.onTiming?.('uploadAcceptanceWait',acceptedAt-submissionAt);options.trace?.mark('PHOTO_UPLOAD_COMPLETED',verified)}
          if(completeSignature===signature){options.onTiming?.('galleryVerification',performance.now()-acceptedAt);options.trace?.mark('PHOTO_GALLERY_VERIFIED',verified);return {verified,errors:[]}}
          completeSignature=signature
          await waitForGalleryActivity(container,options.signal,0)
          continue
        }
        completeSignature='';acceptedAt=0
        if(settled && newIds.length===pending.length && mapped.size===confirmed.size+newIds.filter(id=>!confirmed.has(id)).length){
          const present=new Set(ids('item'))
          const failed=[...mapped].filter(([id])=>!confirmed.has(id) && !present.has(id))
          // Retry only IDs the site removed. A visible/pending local image, unknown
          // mapping or another user's card is not safe to resubmit.
          if(failed.length && cards.every(card=>baseline.has(card.dataset.testid!.slice('photo-video-item-'.length))||confirmed.has(card.dataset.testid!.slice('photo-video-item-'.length)))){
            options.trace?.mark('MYAUTO_UPLOAD_STATE_PROGRESS',0,{accepted:verified,failed:failed.length})
            retry=true;pending=failed.map(([,file])=>file);for(const [id] of failed)mapped.delete(id)
            break
          }
        }
        const quietRemaining=Math.min(750,timeout/4)-(Date.now()-settledAt)
        await waitForGalleryActivity(container,options.signal,Math.min(Math.max(1,deadline-Date.now()),quietRemaining>0?quietRemaining:750))
      }
      if(!retry)break
    }finally{observer.disconnect()}
  }
  return {verified,errors:[`MyAuto-ს გალერეაში დადასტურდა ${verified}/${files.length} ფოტო. დარჩენილი ფოტოები ვერ დადასტურდა; წარმატებული ფოტოები შენარჩუნებულია.`]}
}
