import {collectEdgeRuntimePhotos} from '@auto-importer/parsers/edge-runtime'
// EDGE only, MAIN world: read the documented Fotorama data API, never account state.
const observed=new WeakSet<Element>()
let initObserved=false
const requestEvent='auto-importer-edge-gallery-request',dataId='auto-importer-edge-gallery-data'
function update(){
  if(window.top!==window||location.hostname!=='www.edgepipeline.com')return
  const id=location.pathname.match(/^\/components\/vehicle\/detail\/([a-f0-9]{32})\/?$/)?.[1]
  const canonical=document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
  if(!id||!canonical)return
  try{if(new URL(canonical).pathname.replace(/\/$/,'')!==location.pathname.replace(/\/$/,''))return}catch{return}
  const roots=document.querySelectorAll('#vdp');if(roots.length!==1)return
  const root=roots[0],gallery=root.querySelector('.gallery .fotorama'),vin=root.querySelector('.overview .vin span')?.textContent?.trim()
  if(!gallery||!vin||!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))return
  const jq=(window as unknown as {jQuery?:(element:Element|Document)=>{data:(key:string)=>unknown;on?:(events:string,handler:()=>void)=>unknown}}).jQuery
  if(typeof jq!=='function')return
  if(!initObserved){const events=jq(document);if(typeof events.on==='function'){events.on('vdp:gallery:init',()=>queueMicrotask(update));initObserved=true}}
  let fotorama:{data?:unknown}|undefined
  try{
    const widget=jq(gallery)
    if(!observed.has(gallery)&&typeof widget.on==='function'){
      // Dataset/load events can occur without a new img/src mutation. Reading
      // the documented API never navigates slides or changes the host gallery.
      widget.on('fotorama:ready fotorama:load fotorama:showend',update);observed.add(gallery)
    }
    fotorama=widget.data('fotorama') as typeof fotorama
  }catch{return}
  if(!Array.isArray(fotorama?.data)||!fotorama.data.length||fotorama.data.length>1000)return
  const collected=collectEdgeRuntimePhotos(fotorama.data),photos=collected.photos
  const text=JSON.stringify(photos)
  let output=root.querySelector('#'+dataId)
  if(!output){output=document.createElement('script');output.id=dataId;output.setAttribute('type','application/json');root.append(output)}
  if(output.getAttribute('data-vehicle-id')!==id)output.setAttribute('data-vehicle-id',id)
  if(output.getAttribute('data-vin')!==vin)output.setAttribute('data-vin',vin)
  if(output.getAttribute('data-gallery-count')!==String(collected.unique+collected.invalid))output.setAttribute('data-gallery-count',String(collected.unique+collected.invalid))
  if(output.getAttribute('data-unique-count')!==String(collected.unique))output.setAttribute('data-unique-count',String(collected.unique))
  if(output.getAttribute('data-frame-count')!==String(collected.frames))output.setAttribute('data-frame-count',String(collected.frames))
  if(output.textContent!==text)output.textContent=text
}
// One synchronous request per inspection; no polling or permanent gallery observer.
document.addEventListener(requestEvent,update)

document.addEventListener('vdp:gallery:init',()=>queueMicrotask(update))
