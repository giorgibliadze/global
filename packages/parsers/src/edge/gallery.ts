import {edgeGalleryDiagnostic} from './diagnostics'
import {edgePhotoUrl,edgePhotoIdentity,edgePhotoRank} from './urls'
const ownership=new WeakMap<Document,{key:string;photos:Set<string>;forbidden:Set<string>}>()
export const EDGE_GALLERY_EVENT='auto-importer-edge-gallery-request'
export const EDGE_GALLERY_ID='auto-importer-edge-gallery-data'
export function edgeGallery(root:Element,id:string,vin:string,notify=true){
  const started=performance.now()
  if(notify)root.dispatchEvent(new Event(EDGE_GALLERY_EVENT,{bubbles:true}))
  const galleries=root.querySelectorAll('.gallery'),empty={images:[] as string[],availableImageCount:0,galleryCount:undefined as number|undefined,galleryReady:false,galleryStale:false,galleryLimited:false}
  if(galleries.length!==1)return empty
  // The supplied 1-of-47 / 1-of-1 widget can precede lazy nav/API data.
  // Honor the complete declared count; partial data is returned only at bounded timeout.
  const countText=galleries[0].querySelector('.slide-counts')?.textContent?.trim(),countMatch=countText?.match(/^\s*\d+\s*of\s*(\d+)\s*$/i)
  const declaredCount=countMatch&&Number(countMatch[1])>0&&Number(countMatch[1])<=1000?Number(countMatch[1]):undefined
  const gallery=galleries[0],nav=[...gallery.querySelectorAll('.fotorama__nav__frame--thumb')]
  const observedTotal=countMatch?Number(countMatch[1]):nav.length
  if(observedTotal>1000||nav.length>1000)return {...empty,availableImageCount:observedTotal,galleryCount:observedTotal,galleryLimited:true}
  const originals=new Map<string,string>(),priorities=new Map<string,number>()
  const accept=(value:unknown,priority=0)=>{const url=edgePhotoUrl(value);if(!url)return;const identity=edgePhotoIdentity(url),old=originals.get(identity),previous=priorities.get(identity)??0;if(!old||priority>previous||priority===previous&&edgePhotoRank(url)>edgePhotoRank(old)){originals.set(identity,url);priorities.set(identity,priority)}return identity}
  // Documented Fotorama sources, confined to this vehicle's gallery. Prefer
  // explicit originals even when a thumbnail happens to have a measurable size.
  const image=(node:Element|null):string|undefined=>{
    if(!node||node.hasAttribute('data-video'))return
    const values:[string|null|undefined,number][]=[
      [node.getAttribute('data-full'),3],[node.getAttribute('data-img'),2],
      [node.tagName==='A'?node.getAttribute('href'):undefined,2],
      [node.getAttribute('data-src'),2],[node.getAttribute('src'),2],
      [node.getAttribute('data-thumb'),1],
    ]
    let selected:string|undefined
    for(const [value,priority] of values){const identity=accept(value,priority);selected??=identity}
    // A Fotorama anchor/frame can own an uninitialized or lazy child image.
    const child=node.tagName!=='IMG'?image(node.querySelector('img')):undefined
    return child&&(!selected||(priorities.get(child)??0)>(priorities.get(selected)??0))?child:selected??child
  }
  const embedded=[...gallery.querySelectorAll('.fotorama > a,.fotorama > img,.fotorama > [data-img],.fotorama > [data-full],.fotorama > [data-thumb]')].map(image).filter((value):value is string=>!!value)
  const slots=nav.map(slot=>image(slot))
  const known=[...gallery.querySelectorAll('.fotorama__stage__frame,img.main-image')].map(image).filter((x):x is string=>!!x)
  for(const link of gallery.querySelectorAll('a.download-pic[href]')){const identity=accept(link.getAttribute('href'),3);if(identity&&!known.includes(identity))known.push(identity)}
  // OG is eligible only when its identity is independently present in this gallery.
  const og=edgePhotoUrl(root.ownerDocument.querySelector('meta[property="og:image"]')?.getAttribute('content'))
  if(og&&originals.has(edgePhotoIdentity(og)))accept(og)
  let runtime:string[]|undefined,runtimeCount:number|undefined
  const bridge=root.querySelector('#'+EDGE_GALLERY_ID)
  if(bridge?.getAttribute('data-vehicle-id')===id&&bridge.getAttribute('data-vin')===vin)try{
    const data:unknown=JSON.parse(bridge.textContent??'')
    if(Array.isArray(data)&&data.length<=1000){const list=data.map(row=>{if(!row||typeof row!=='object')return;const item=row as Record<string,unknown>;return accept(item.full,3)||accept(item.img,2)||accept(item.thumb,1)});if(list.length&&list.every((x):x is string=>!!x)){runtime=list;const count=Number(bridge.getAttribute('data-gallery-count'));if(Number.isInteger(count)&&count>=list.length&&count<=1000)runtimeCount=count}}
  }catch{/* Unready metadata must not replace verified DOM entries. */}
  const runtimeUnique=Number(bridge?.getAttribute('data-unique-count')),runtimeFrames=Number(bridge?.getAttribute('data-frame-count'))
  // A fully enumerated API may contain duplicate frames or explicit videos.
  // Its verified unique count avoids waiting for nonexistent extra originals.
  const enumerated=!!runtime&&Number.isInteger(runtimeUnique)&&runtimeUnique>0&&runtimeUnique<=runtimeFrames&&Number.isInteger(runtimeFrames)&&runtimeFrames<=1000&&runtimeFrames>=Math.max(declaredCount??0,nav.length)&&runtimeCount===runtimeUnique&&new Set(runtime).size>=runtimeUnique
  const runtimeComplete=!!runtime&&(enumerated||new Set(runtime).size>=Math.max(declaredCount??0,runtimeCount??runtime.length,nav.length))
  const ordered=runtimeComplete?runtime!:(runtime?.length?[...runtime,...slots,...embedded,...known]:embedded.length>=Math.max(declaredCount??0,nav.length)&&embedded.length?embedded:[...slots,...embedded,...known]),unique=[...new Set(ordered.filter((x):x is string=>!!x))]
  const count=Math.max(declaredCount??0,runtimeCount??0,nav.length)||(runtimeComplete?runtime?.length:undefined)
  const key=JSON.stringify([id,vin]),old=ownership.get(root.ownerDocument),forbidden=old?.key===key?old.forbidden:old?.photos??new Set<string>()
  const stale=unique.some(identity=>forbidden.has(identity))
  if(unique.length&&!stale)ownership.set(root.ownerDocument,{key,photos:new Set(originals.keys()),forbidden})
  const initialized=runtime!==undefined||nav.length>0||known.length>0||embedded.length>0
  const desired=(enumerated?runtimeUnique:count??unique.length)
  const result={images:stale||!initialized?[]:unique.map(identity=>originals.get(identity)!),availableImageCount:enumerated?runtimeUnique:Math.max(count??0,unique.length),galleryCount:count,galleryReady:initialized&&!stale&&desired>0&&unique.length>=desired&&ordered.slice(0,desired).length===desired&&ordered.slice(0,desired).every(Boolean),galleryStale:stale}
  edgeGalleryDiagnostic(root.ownerDocument,id,{discovered:Math.max(declaredCount??0,nav.length,Number(bridge?.getAttribute('data-frame-count'))||0),validUnique:runtimeComplete?(Number(bridge?.getAttribute('data-unique-count'))||new Set(runtime).size):originals.size,selected:result.images.length,ready:result.galleryReady,stale,source:runtimeComplete?'runtime':'dom'},started)
  return result
}
