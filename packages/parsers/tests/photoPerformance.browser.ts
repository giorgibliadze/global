import {waitForUploader} from '../../../apps/extension/src/photos/readiness'
import {waitForDomReady} from '../../../apps/extension/src/services/domReady'
import {uploadNamedGallery as before} from './fixtures/performance/galleryUpload.before'
import {uploadNamedGallery as after} from '../../../apps/extension/src/photos/galleryUpload'
const results:unknown[]=[]
try{
  for(const count of [1,5,15])for(const previewDelay of [0,1200])for(const version of ['before','after'] as const){
    const frame=document.createElement('iframe');document.body.append(frame)
    const doc=frame.contentDocument!,view=doc.defaultView!
    doc.body.innerHTML='<div data-testid="photo-video-container"><span data-testid="photo-video-label">ფოტო 0/15</span><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>'
    let submissions=0,serverAcceptedAt=0,submittedAt=0
    const input=doc.querySelector<HTMLInputElement>('input')!,cards=doc.querySelector('[data-testid="photo-video-gallery"]')!,label=doc.querySelector('[data-testid="photo-video-label"]')!
    const timers:number[]=[]
    input.onchange=()=>{
      submissions++;submittedAt=performance.now()
      const files=[...input.files!];label.textContent=`ფოტო ${files.length}/15`
      for(let i=0;i<files.length;i++){const node=doc.createElement('div');node.dataset.testid='photo-video-loading-perf-'+i;cards.append(node)}
      timers.push(view.setTimeout(()=>{
        serverAcceptedAt=performance.now()
        for(let i=0;i<files.length;i++){
          const item=doc.createElement('div');item.dataset.testid='photo-video-item-perf-'+i
          const image=doc.createElement('img');image.dataset.testid='photo-video-image-perf-'+i
          let loaded=previewDelay===0
          Object.defineProperties(image,{currentSrc:{value:'https://static.tnet.ge/myauto/tmp/perf-'+i+'.jpg'},complete:{get:()=>loaded},naturalWidth:{get:()=>loaded?640:0}})
          item.append(image);cards.querySelector('[data-testid="photo-video-loading-perf-'+i+'"]')!.replaceWith(item)
          if(!loaded)timers.push(view.setTimeout(()=>{loaded=true;image.dispatchEvent(new view.Event('load'))},previewDelay))
        }
      },100))
    }
    const preparationStarted=performance.now(),files=Array.from({length:count},(_,i)=>new File([new Uint8Array(1024*1024)],'perf-'+i+'.jpg',{type:'image/jpeg'})),filePreparationMs=performance.now()-preparationStarted
    const readinessStarted=performance.now();if(version==='before')await waitForDomReady(doc,()=>!!doc.querySelector('input[type="file"]:not(:disabled)'),new AbortController().signal,500);else await waitForUploader(doc,undefined,500);const uploaderReadinessMs=performance.now()-readinessStarted
    const started=performance.now()
    try{
      const result=await(version==='before'?before:after)(doc,files,()=>{},{timeoutMs:5000})
      if(result.verified!==count||submissions!==1)throw new Error('Batch verification failed for '+version+' '+count)
      results.push({version,count,previewDelayMs:previewDelay,uploaderReadinessMs,filePreparationMs,submissionMs:submittedAt-started,observedMockServerUploadMs:serverAcceptedAt-submittedAt,completionVerificationMs:performance.now()-serverAcceptedAt,totalMs:performance.now()-started,accepted:result.verified,submissions,method:'100ms simulated server completion, 1MiB synthetic Files, optional delayed preview; not live upload'})
    }finally{for(const timer of timers)view.clearTimeout(timer);frame.remove()}
  }
  document.body.dataset.result='PASS';document.querySelector('pre')!.textContent='UPLOAD_BENCHMARK '+JSON.stringify(results)
}catch(error){document.body.dataset.result='FAIL';document.querySelector('pre')!.textContent='FAILED: '+(error instanceof Error?error.message:String(error))}
