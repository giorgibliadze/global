import type {UploadResult} from './upload'

// Confirmed public MyAuto contract: loading-local-ID placeholders become
// item-local-ID cards only after the server completes; failures remove that ID.
export async function uploadNamedGallery(doc:Document,files:File[],progress:(count:number)=>void,options:{timeoutMs?:number;signal?:AbortSignal;guard?:()=>void;onSubmitted?:(count:number)=>void}):Promise<UploadResult>{
  const selector='[data-testid="photo-video-container"]'
  const root=()=>doc.querySelector(selector)
  const ids=(kind:'item'|'loading')=>[...(root()?.querySelectorAll<HTMLElement>(`[data-testid^="photo-video-${kind}-"]`)??[])].map(node=>node.dataset.testid!.slice(`photo-video-${kind}-`.length))
  if(ids('item').length || ids('loading').length || !/ფოტო\s*0\s*\/\s*15/.test(root()?.querySelector('[data-testid="photo-video-label"]')?.textContent??''))return {verified:0,errors:['ფოტოგალერეა ცარიელი არ არის. არსებული ფოტოები არ შეცვლილა.']}
  const mapped=new Map<string,File>(),confirmed=new Set<string>()
  let verified=0,reported=-1,submitted=0,pending=files
  const timeout=options.timeoutMs??45000,deadline=Date.now()+timeout
  for(let attempt=0;attempt<2 && pending.length;attempt++){
    options.signal?.throwIfAborted();options.guard?.()
    const input=doc.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]')
    if(!input || input.disabled || !doc.defaultView?.DataTransfer)return {verified,errors:['MyAuto-ს ფოტოების ფაილის ამრჩევი მიუწვდომელია.']}
    const seen=new Set([...ids('item'),...ids('loading')]),newIds:string[]=[]
    const capture=(node:Node)=>{
      if(node.nodeType!==1)return
      const element=node as HTMLElement
      for(const item of [element,...element.querySelectorAll<HTMLElement>('[data-testid^="photo-video-loading-"],[data-testid^="photo-video-item-"]')]){
        const match=item.dataset.testid?.match(/^photo-video-(?:loading|item)-(.+)$/)
        if(match && !seen.has(match[1])){seen.add(match[1]);newIds.push(match[1])}
      }
    }
    const observer=new doc.defaultView.MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)capture(node)})
    observer.observe(doc.documentElement,{subtree:true,childList:true})
    try{
      const data=new doc.defaultView.DataTransfer();for(const file of pending)data.items.add(file)
      input.files=data.files;input.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}))
      submitted+=pending.length;options.onSubmitted?.(Math.min(files.length,submitted))
      let settledAt=0,lastSignature='',retry=false
      while(Date.now()<deadline){
        options.signal?.throwIfAborted();options.guard?.()
        const container=root();if(!container)return {verified,errors:['ფოტოგალერეა გვერდიდან გაქრა.']}
        // Flush records before matching indexes, including placeholders that
        // disappear in the same task. No filenames or image URLs are logged.
        for(const record of observer.takeRecords())for(const node of record.addedNodes)capture(node)
        if(newIds.length===pending.length)for(let i=0;i<newIds.length;i++)mapped.set(newIds[i],pending[i])
        const cards=[...container.querySelectorAll<HTMLElement>('[data-testid^="photo-video-item-"]')]
        confirmed.clear()
        for(const card of cards){
          const id=card.dataset.testid!.slice('photo-video-item-'.length),image=card.querySelector<HTMLImageElement>('[data-testid^="photo-video-image-"]')
          if(!mapped.has(id)||!image)continue
          try{if(new URL(image.currentSrc||image.src).protocol==='https:' && image.complete && image.naturalWidth>0)confirmed.add(id)}catch{/* Pending image, never success. */}
        }
        verified=confirmed.size;if(verified!==reported){reported=verified;progress(verified)}
        const loading=ids('loading'),count=Number(container.querySelector('[data-testid="photo-video-label"]')?.textContent?.match(/ფოტო\s*(\d+)\s*\/\s*15/)?.[1])
        const signature=JSON.stringify([ids('item'),loading,count,verified])
        if(signature!==lastSignature){lastSignature=signature;settledAt=Date.now()}
        const settled=!loading.length && count===cards.length && Date.now()-settledAt>=Math.min(750,timeout/4)
        if(settled && verified===files.length)return {verified,errors:[]}
        if(settled && newIds.length===pending.length && mapped.size===confirmed.size+newIds.filter(id=>!confirmed.has(id)).length){
          const present=new Set(ids('item'))
          const failed=[...mapped].filter(([id])=>!confirmed.has(id) && !present.has(id))
          // Retry only IDs the site removed. A visible/pending local image, unknown
          // mapping or another user's card is not safe to resubmit.
          if(failed.length && cards.every(card=>confirmed.has(card.dataset.testid!.slice('photo-video-item-'.length)))){
            retry=true;pending=failed.map(([,file])=>file);for(const [id] of failed)mapped.delete(id)
            break
          }
        }
        await new Promise(resolve=>setTimeout(resolve,75))
      }
      if(!retry)break
    }finally{observer.disconnect()}
  }
  return {verified,errors:[`MyAuto-ს გალერეაში დადასტურდა ${verified}/${files.length} ფოტო. დარჩენილი ფოტოები ვერ დადასტურდა; წარმატებული ფოტოები შენარჩუნებულია.`]}
}
