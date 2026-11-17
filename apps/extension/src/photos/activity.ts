// Observe only the current uploader and its replacement boundary. Image load
// events matter even when React does not mutate attributes after the response.
export function waitForGalleryActivity(container:Element,signal:AbortSignal|undefined,timeoutMs:number):Promise<void>{
  signal?.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const view=container.ownerDocument.defaultView!
    const observer=new view.MutationObserver(()=>finish())
    const finish=(error?:unknown)=>{observer.disconnect();clearTimeout(timer);container.removeEventListener('load',changed,true);container.removeEventListener('error',changed,true);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve()}
    const changed=()=>finish(),abort=()=>finish(signal?.reason??new DOMException('Aborted','AbortError'))
    observer.observe(container,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','srcset','data-testid','aria-busy']})
    if(container.parentElement)observer.observe(container.parentElement,{childList:true})
    container.addEventListener('load',changed,true);container.addEventListener('error',changed,true);signal?.addEventListener('abort',abort,{once:true})
    const timer=setTimeout(()=>finish(),Math.max(0,timeoutMs))
  })
}
