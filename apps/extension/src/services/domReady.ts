// One deadline and DOM notifications, rather than repeatedly scanning the page.
// Callers use specific confirmed selectors and enforce their transfer identity.
export function waitForDomReady(doc:Document,ready:()=>boolean,signal:AbortSignal,timeoutMs:number):Promise<void> {
  return new Promise((resolve,reject)=>{
    const clean=()=>{observer?.disconnect();clearTimeout(timer);signal.removeEventListener('abort',aborted)}
    const aborted=()=>{clean();reject(signal.reason ?? new Error('გადატანა შეჩერებულია.'))}
    const check=()=>{try{signal.throwIfAborted();if(ready()){clean();resolve()}}catch(error){clean();reject(error)}}
    if(signal.aborted){reject(signal.reason);return}
    const observer=new doc.defaultView!.MutationObserver(check)
    observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-disabled','aria-busy','hidden','data-testid','name']})
    signal.addEventListener('abort',aborted,{once:true})
    const timer=setTimeout(()=>{clean();reject(new Error('MyAuto-ს საჭირო ველი დროულად ვერ ჩაიტვირთა.'))},timeoutMs)
    check()
  })
}
