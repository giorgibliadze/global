import type {PhotoTrace} from '../photos/checkpoints'
import {inspectManheim24Photos} from '@auto-importer/parsers'

// Refresh only gallery data. Never normalize or refill vehicle text here.
export async function resolveSelectedPhotos(doc:Document,expected:{vin:string;listingId?:string},timeoutMs=6000,trace?:PhotoTrace,inspect:typeof inspectManheim24Photos=inspectManheim24Photos){
  return new Promise<ReturnType<typeof inspectManheim24Photos>>((resolve,reject)=>{
    const view=doc.defaultView,startUrl=view?.location.href
    let lastSignature=''
    const navigation=()=>{if(view?.location.href!==startUrl)finish(new Error('არჩეული ავტომობილის გვერდი შეიცვალა. ფოტოების გადატანა შეჩერებულია.'))}
    const observer=new (doc.defaultView??window).MutationObserver(()=>check(false))
    const finish=(error?:Error,value?:ReturnType<typeof inspectManheim24Photos>)=>{observer.disconnect();clearTimeout(timer);view?.removeEventListener('hashchange',navigation);view?.removeEventListener('popstate',navigation);if(error)reject(error);else resolve(value!)}
    const check=(expired:boolean)=>{
      try{
        const value=inspect(doc)
        const signature=JSON.stringify([value.vin,value.listingId,value.images,value.galleryReady,value.galleryStale])
        if(signature!==lastSignature){lastSignature=signature;trace?.mark('PHOTO_SOURCE_READY',value.images.length)}
        if(value.vin!==expected.vin || expected.listingId && value.listingId!==expected.listingId){trace?.mark('PHOTO_SOURCE_READY',0,{errorCode:'IDENTITY_MISMATCH'});finish(new Error('არჩეული ავტომობილი შეიცვალა. სხვა ავტომობილის ფოტოები არ გადაიტანება.'));return}
        if(value.images.length && (value.galleryReady || expired) && !value.galleryStale){trace?.mark('PHOTO_URLS_EXTRACTED',value.images.length);finish(undefined,value)}
        else if(expired){trace?.mark('PHOTO_URLS_EXTRACTED',0,{errorCode:'NO_URLS'});finish(new Error('არჩეული ავტომობილის გალერეაში ფოტოები ვერ მოიძებნა. გახსენით წყაროს ფოტოგალერეა და თავიდან დაიწყეთ გადატანა.'))}
      }catch{if(expired){trace?.mark('PHOTO_SOURCE_READY',0,{errorCode:'SOURCE_NOT_READY'});finish(new Error('არჩეული ავტომობილის ფოტოები ვერ წაიკითხა. გადაამოწმეთ წყაროს დეტალური გვერდი.'))}}
    }
    observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','srcset','tip','hidden','aria-hidden','class','style']})
    view?.addEventListener('hashchange',navigation);view?.addEventListener('popstate',navigation)
    const timer=setTimeout(()=>check(true),timeoutMs)
    check(false)
  })
}
