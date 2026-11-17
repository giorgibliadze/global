import {createFyusionGalleryExtractor} from './fyusion'
import {deduplicatePhotos,safePhotoUrl,photoIdentity} from './photoUrls'
const extractFyusionGallery=createFyusionGalleryExtractor()
// Only retain a gallery node first observed INSIDE a verified vehicle root.
// If fullscreen/portal code moves that same node, no global image scan is needed.
const owners=new WeakMap<Document,Map<string,{key:string;photos:Set<string>;forbidden:Set<string>}>>()
const bindings=new WeakMap<Document,{key:string;node:Element}>()
export function extractSiteManheimGallery(root:Element,key:string){
  const nodes=[...root.querySelectorAll('#fyusion-prism-viewer,.svfy_viewer')].filter(node=>!node.closest('#fyusion-prism-viewer-skeleton,.svfy_viewer--skeleton'))
  const outer=nodes.filter(node=>!nodes.some(other=>other!==node&&other.contains(node)))
  if(outer.length===1)bindings.set(root.ownerDocument,{key,node:outer[0]})
  const binding=bindings.get(root.ownerDocument)
  const scope=outer.length===0&&binding?.key===key&&binding.node.isConnected?binding.node:root
  // Regular Manheim carousel slots are authoritative; preview images are not slots.
  const viewers=[...(scope.matches('#fyusion-prism-viewer,.svfy_viewer')?[scope]:[]),...scope.querySelectorAll('#fyusion-prism-viewer,.svfy_viewer')]
  const scrollers=[...new Set(viewers.flatMap(viewer=>[...viewer.querySelectorAll('.svfy_carousel .svfy_scroller')]))].filter(node=>!node.closest('#fyusion-prism-viewer-skeleton,.svfy_viewer--skeleton'))
  if(scrollers.length===1){
    const scroller=scrollers[0],viewer=scroller.closest('#fyusion-prism-viewer,.svfy_viewer')!
    const text=viewer.querySelector('.svfy_catbtn[data-name="All"] span.svfy_chp')?.textContent?.trim()
    const galleryCount=text&&/^\d+$/.test(text)?Number(text):undefined
    const slots=[...scroller.children].map(slot=>{
      const image=slot.querySelector('img')
      const url=safePhotoUrl(image?.getAttribute('src')||image?.getAttribute('data-src'))
      return url&&!/(?:^|[\/_.-])(?:placeholders?|icons?|logos?|loading|spinner|no[-_]?image)(?:[\/_.-]|$)/i.test(new URL(url).pathname)?url:undefined
    })
    const all=deduplicatePhotos(slots,Infinity)
    let namespace='site-legacy'
    try{const parts=JSON.parse(key);if(parts[0]==='ManheimSearch'||parts[0]==='ManheimSite')namespace=parts[0]}catch{/* Legacy identity. */}
    let sourceOwners=owners.get(root.ownerDocument)
    if(!sourceOwners){sourceOwners=new Map();owners.set(root.ownerDocument,sourceOwners)}
    const old=sourceOwners.get(namespace),forbidden=old?.key===key?old.forbidden:old?.photos??new Set<string>()
    const stale=all.some(url=>forbidden.has(photoIdentity(url)))
    if(all.length&&!stale)sourceOwners.set(namespace,{key,photos:new Set(all.map(photoIdentity)),forbidden})
    const desired=Math.min(galleryCount??15,15)
    return {present:true,images:stale?[]:all.slice(0,15),validCount:stale?0:all.length,galleryCount,ready:!stale&&desired>0&&all.length>=desired&&slots.slice(0,desired).length===desired&&slots.slice(0,desired).every(Boolean),stale}
  }
  return extractFyusionGallery(scope,key,{includeHidden:true})
}
