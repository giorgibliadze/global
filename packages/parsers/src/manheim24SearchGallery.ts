import {deduplicatePhotos,photoIdentity,safePhotoUrl} from './photoUrls'

// Verified in the supplied Search24 DOCX: carousel slots can be descriptive
// .svfy_tip elements OR plain divs. Main-render images are not gallery slots.
export function extractSearch24Carousel(scope:Element,fyuseUid:unknown){
  const nodes=[...(scope.matches('#fyusion-prism-viewer')?[scope]:[]),...scope.querySelectorAll('#fyusion-prism-viewer')].filter(node=>!node.closest('#fyusion-prism-viewer-skeleton'))
  const empty={present:false,images:[] as string[],count:undefined as number|undefined,ready:false}
  if(nodes.length!==1)return empty
  const gallery=nodes[0],scrollers=gallery.querySelectorAll('.svfy_carousel .svfy_scroller')
  if(scrollers.length!==1)return empty
  const counter=gallery.querySelector('.svfy_catbtn[data-name="All"] span.svfy_chp')?.textContent?.trim()
  const count=counter&&/^\d+$/.test(counter)?Number(counter):undefined
  if(!count||count>10000)return empty
  const belongs=(url:string)=>new URL(url).hostname!=='i.fyuse.com'||typeof fyuseUid!=='string'||new URL(url).pathname.split('/').includes(fyuseUid)
  const slots=[...scrollers[0].children].map(slot=>{
    if(slot.tagName!=='DIV')return undefined
    const url=safePhotoUrl(slot.querySelector('img[src]')?.getAttribute('src'))
    return url&&belongs(url)?url:undefined
  })
  const ordered=deduplicatePhotos(slots,Infinity),identities=new Set(ordered.map(photoIdentity))
  // Upgrade a thumbnail only when the helper has exactly the same photo identity.
  // Never prepend whichever photograph happens to be open in the viewer.
  const upgrades=[...gallery.querySelectorAll('.svfy_main img[src]')].flatMap(image=>{
    const url=safePhotoUrl(image.getAttribute('src'))
    return url&&belongs(url)&&identities.has(photoIdentity(url))?[url]:[]
  })
  const images=deduplicatePhotos([...ordered,...upgrades],Infinity)
  const desired=Math.min(count,15)
  return {present:true,images,count,ready:images.length>=desired&&slots.slice(0,desired).length===desired&&slots.slice(0,desired).every(Boolean)}
}
