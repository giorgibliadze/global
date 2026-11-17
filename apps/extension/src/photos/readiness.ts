import {photoLog} from './diagnostics'
export function uploaderAuthenticationRequired(doc:Document){
  return [...doc.querySelectorAll<HTMLElement>('[data-testid="photo-video-container"] [role="alert"],form input[type="password"]')].some(node=>node.getClientRects().length>0 && (node.matches('input[type="password"]')||/401|403|ავტორიზ|სესია|unauthorized|log.?in|sign.?in/i.test(node.textContent??'')))
}
export async function waitForUploader(doc:Document,signal?:AbortSignal,timeoutMs=15000,id?:string){
  const ready=()=>{
    const input=doc.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]'),container=doc.querySelector('[data-testid="photo-video-container"]')
    if(!input||!container||input.disabled||input.matches(':disabled')||!input.multiple)return false
    let node:Element|null=input.parentElement
    // MyAuto deliberately hides its native input and may collapse the card.
    // CSS visibility is independent of the initialized dropzone's change handler.
    while(node){if(node.hasAttribute('inert')||node.getAttribute('aria-busy')==='true')return false;node=node.parentElement}
    return !container.querySelector('[data-testid^="photo-video-loading-"],[aria-busy="true"],[role="progressbar"]')
  }
  signal?.throwIfAborted()
  if(ready())return
  photoLog(id,'uploader_not_ready')
  await new Promise<void>((resolve,reject)=>{
    const observer=new doc.defaultView!.MutationObserver(check)
    const clean=()=>{observer.disconnect();clearTimeout(timer);signal?.removeEventListener('abort',abort)}
    const abort=()=>{clean();reject(signal?.reason??new Error('ფოტოების ატვირთვა შეჩერდა.'))}
    function check(){if(signal?.aborted)abort();else if(ready()){clean();resolve()}}
    observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','multiple','style','class','hidden','aria-busy','data-testid']})
    signal?.addEventListener('abort',abort,{once:true})
    const timer=setTimeout(()=>{clean();reject(new Error('ფოტოების ამტვირთავი დროულად ვერ მომზადდა.'))},timeoutMs)
    check()
  })
}
