import {safePhotoUrl,deduplicatePhotos,photoIdentity} from './photoUrls'
interface GalleryOwner {identity:string;photos:Set<string>;forbidden:Set<string>}
const ownership=new WeakMap<Document,GalleryOwner>()
function visible(node:Element){
  for(let el:Element|null=node;el;el=el.parentElement){
    if(el.hasAttribute('hidden')||el.getAttribute('aria-hidden')==='true'||el.id.endsWith('-skeleton')||el.classList.contains('svfy_viewer--skeleton'))return false
    const style=el.ownerDocument.defaultView?.getComputedStyle(el)
    if(style?.display==='none'||style?.visibility==='hidden'||/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(el.getAttribute('style')??''))return false
  }
  return true
}
// Only inside the already validated, selected vehicle detail root. The numbered
// tip/counter contract distinguishes this gallery from legacy Fyuse media.
export function extractFyusionGallery(root:Element,identity:string){
  const containers=[...root.querySelectorAll('#fyusion-prism-viewer,.svfy_viewer')].filter(visible)
  const qualifies=(el:Element)=>{
    const tips=[...el.querySelectorAll('.svfy_tip')]
    const numbered=tips.some(tip=>/^Image\s+\d+$/i.test(tip.getAttribute('tip')??''))
    return numbered||(!tips.some(tip=>!!tip.getAttribute('tip'))&&!!el.querySelector('.svfy_catbtn[data-name="All"] span.svfy_chp'))
  }
  const galleries=containers.filter(qualifies).filter(el=>!containers.some(other=>other!==el&&other.contains(el)&&qualifies(other)))
  const empty={present:galleries.length>0,images:[] as string[],validCount:0,galleryCount:undefined as number|undefined,ready:false,stale:false}
  if(galleries.length!==1)return empty
  const gallery=galleries[0]
  const countText=gallery.querySelector('.svfy_catbtn[data-name="All"] span.svfy_chp')?.textContent?.trim()
  const galleryCount=countText&&/^\d+$/.test(countText)?Number(countText):undefined
  const entries=[...gallery.querySelectorAll('.svfy_tip')].flatMap((tip,position)=>{
    const number=tip.getAttribute('tip')?.match(/^Image\s+(\d+)$/i)
    if(!number||Number(number[1])<1)return []
    return [...tip.querySelectorAll('img[src]')].flatMap(img=>{
      if(img.closest('#fyusion-prism-viewer-skeleton,.svfy_viewer--skeleton')||img.classList.contains('svfy_placeholder'))return []
      const url=safePhotoUrl(img.getAttribute('src'))
      if(!url||/(?:^|[\/_.-])(?:placeholders?|icons?|logos?|loading|spinner|no[-_]?image|no[-_]?photo)(?:[\/_.-]|$)/i.test(new URL(url).pathname))return []
      return [{index:Number(number[1]),position,url}]
    })
  }).sort((a,b)=>a.index-b.index||a.position-b.position)
  const all=deduplicatePhotos(entries.map(entry=>entry.url),Infinity)
  const old=ownership.get(root.ownerDocument)
  const forbidden=old?.identity===identity?old.forbidden:old?.photos??new Set<string>()
  const stale=all.some(url=>forbidden.has(photoIdentity(url)))
  if(all.length&&!stale)ownership.set(root.ownerDocument,{identity,photos:new Set(all.map(photoIdentity)),forbidden})
  const indices=new Set(entries.map(entry=>entry.index))
  const desired=Math.min(galleryCount??15,15)
  const ready=!stale&&desired>0&&all.length>=desired&&Array.from({length:desired},(_,i)=>i+1).every(i=>indices.has(i))
  return {present:true,images:stale?[]:all.slice(0,15),validCount:stale?0:all.length,galleryCount,ready,stale}
}
