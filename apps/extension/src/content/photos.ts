import {inspectManheim24Photos} from '@auto-importer/parsers'

// Refresh only gallery data. Never normalize or refill vehicle text here.
export async function resolveSelectedPhotos(doc:Document,expected:{vin:string;listingId?:string},timeoutMs=6000){
  return new Promise<ReturnType<typeof inspectManheim24Photos>>((resolve,reject)=>{
    const observer=new doc.defaultView!.MutationObserver(()=>check(false))
    const finish=(error?:Error,value?:ReturnType<typeof inspectManheim24Photos>)=>{observer.disconnect();clearTimeout(timer);if(error)reject(error);else resolve(value!)}
    const check=(expired:boolean)=>{
      try{
        const value=inspectManheim24Photos(doc)
        if(value.vin!==expected.vin || expected.listingId && value.listingId!==expected.listingId){finish(new Error('არჩეული ავტომობილი შეიცვალა. სხვა ავტომობილის ფოტოები არ გადაიტანება.'));return}
        if(value.images.length)finish(undefined,value)
        else if(expired)finish(new Error('არჩეული ავტომობილის გალერეაში ფოტოები ვერ მოიძებნა. გახსენით წყაროს ფოტოგალერეა და თავიდან დაიწყეთ გადატანა.'))
      }catch{finish(new Error('არჩეული ავტომობილის ფოტოები ვერ წაიკითხა. გადაამოწმეთ წყაროს დეტალური გვერდი.'))}
    }
    observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','srcset','hidden','aria-hidden']})
    const timer=setTimeout(()=>check(true),timeoutMs)
    check(false)
  })
}
