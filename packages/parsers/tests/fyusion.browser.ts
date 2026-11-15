import {extractFyusionGallery} from '../src/fyusion'
import {inspectManheim24Photos,parseManheim24,safePhotoUrl} from '../src/manheim24'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {downloadPhoto,base64Bytes} from '../../../apps/extension/src/photos/download'
import {prepareFiles} from '../../../apps/extension/src/photos/client'
import {uploadPhotos} from '../../../apps/extension/src/photos/upload'

export async function runFyusionTests(sourceHtml:string,check:(value:unknown,label:string)=>void){
  const fixture=await (await fetch('/packages/parsers/tests/fixtures/fyusion-contract-23.html')).text()
  const fixtureDoc=new DOMParser().parseFromString(fixture,'text/html')
  const result=extractFyusionGallery(fixtureDoc.body,'fixture-A')
  check(result.galleryCount===23&&result.validCount===23&&result.images.length===15,'Fyusion contract: counter 23, 23 valid originals, first 15 selected')
  check(result.images.every((url,i)=>new URL(url).pathname.endsWith(`photo-${String(i+1).padStart(2,'0')}.jpg`)),'Fyusion contract: numeric Image ordering despite reverse DOM order')
  check(result.images.every(url=>!new URL(url).searchParams.has('size')&&new URL(url).searchParams.get('quality')==='90'&&new URL(url).searchParams.get('format')==='webp'),'Fyusion contract: thumbnail size removed with other allowed parameters preserved')
  check(result.images.every(url=>!url.includes('unrelated')&&!url.includes('logo')&&!url.includes('placeholder')),'Fyusion contract: duplicates, unrelated page images, logos and placeholders excluded')
  check(!safePhotoUrl('https://images--cdn.manheim24.com.attacker.example/vehicle.jpg')&&!safePhotoUrl('https://images--cdn.manheim24.com/vehicle.jpg?token=PRIVATE'),'Fyusion contract: lookalike host and authentication query rejected')
  for(const host of ['i.fyuse.com','images.cdn.manheim.com']){
    const legacy=new DOMParser().parseFromString(fixture.replaceAll('images--cdn.manheim24.com',host),'text/html')
    const selected=extractFyusionGallery(legacy.body,'legacy-'+host)
    check(selected.images.length===15&&selected.images.every(url=>new URL(url).hostname===host),'Fyusion contract: numbered gallery supports '+host+' without a host substitution')
  }
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(sourceHtml);doc.close()
  try{
    const original=parseManheim24(doc),root=doc.querySelector('.VehicleDetails__container')!,old=doc.querySelector('#fyusion-prism-viewer')!
    old.remove();root.append(doc.importNode(fixtureDoc.querySelector('#fyusion-prism-viewer')!,true))
    const read=inspectManheim24Photos(doc)
    check(read.galleryCount===23&&read.availableImageCount===23&&read.images.length===15,'Fyusion parser: selected vehicle root uses dedicated gallery, not unrelated structured images')
    const gallery=doc.querySelector('.svfy_scroller')!,saved=[...gallery.childNodes];gallery.replaceChildren()
    check(parseManheim24(doc).images.length===0,'Fyusion lazy gallery: no stale structured fallback before current gallery is ready')
    let done=false
    const waiting=resolveSelectedPhotos(doc,{vin:original.vin,listingId:original.listingId},500).then(value=>{done=true;return value})
    gallery.append(saved[0]);await new Promise(resolve=>setTimeout(resolve,15))
    check(!done,'Fyusion lazy gallery: first thumbnail does not freeze a one-photo result')
    gallery.append(...saved.slice(1));const loaded=await waiting
    check(loaded.images.length===15&&loaded.galleryCount===23,'Fyusion lazy gallery: MutationObserver resolves once ordered selected photos populate')
    const data=doc.querySelector('.StockWaveInfo')!,json=JSON.parse(data.textContent!),vinNode=doc.querySelector('[data-testid="vdp-vin"]')!
    const nextVin='2HGCM82633A004352';json.vin=nextVin;json.designatedDescriptionEnrichment.vin=nextVin;json.id='fixture-B';data.textContent=JSON.stringify(json);vinNode.textContent=nextVin
    check(inspectManheim24Photos(doc).galleryStale&&parseManheim24(doc).images.length===0,'Fyusion SPA: unchanged previous-vehicle gallery cannot be reused')
    for(const img of gallery.querySelectorAll('img'))img.setAttribute('src',img.getAttribute('src')!.replace('quality=90','quality=80'))
    check(inspectManheim24Photos(doc).galleryStale,'Fyusion SPA: thumbnail/quality transform changes cannot disguise a stale photo identity')
    const switching=resolveSelectedPhotos(doc,{vin:nextVin,listingId:'fixture-B'},500)
    for(const img of gallery.querySelectorAll('img'))img.setAttribute('src',img.getAttribute('src')!.replace('/vehicle-fixture/','/vehicle-fixture-B/'))
    check((await switching).images.length===15,'Fyusion SPA: same container accepts new vehicle photo identities after content replacement')
    let mismatch=false;try{await resolveSelectedPhotos(doc,{vin:original.vin},20)}catch{mismatch=true}
    check(mismatch,'Fyusion SPA: previous vehicle transfer cannot read the newly selected vehicle')

    const bytes=new Uint8Array([255,216,255,0])
    const downloaded=await Promise.all(result.images.map((url,index)=>downloadPhoto(url,index,async requested=>{
      check(!new URL(String(requested)).searchParams.has('size'),'Fyusion download: original URL used')
      return new Response(bytes,{status:200})
    })))
    check(downloaded.length===15,'Fyusion mocked network: images downloaded 15/15 (separate from URL extraction)')
    const previous=(globalThis as typeof globalThis & {chrome?:unknown}).chrome
    try{
      ;(globalThis as typeof globalThis & {chrome?:unknown}).chrome={runtime:{sendMessage:async(message:{type:string;index:number;offset:number})=>({ok:true,value:message.type==='PHOTO_PREPARE'?downloaded[message.index].metadata:base64Bytes(bytes.slice(message.offset))})}}
      const received=await prepareFiles('abcd1234-1234-1234-1234-123456789abc',15,()=>{})
      check(received.files.length===15&&received.files.every(file=>file instanceof File),'Fyusion JSON chunks: Files delivered to MyAuto receiver 15/15')
      doc.body.innerHTML='<div data-testid="photo-video-container"><span data-testid="photo-video-label">ფოტო 0/15</span><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>'
      const input=doc.querySelector<HTMLInputElement>('input[type="file"]')!,cards=doc.querySelector('[data-testid="photo-video-gallery"]')!,label=doc.querySelector('[data-testid="photo-video-label"]')!
      input.addEventListener('change',()=>{
        for(const [i] of [...input.files!].entries()){
          const card=doc.createElement('div');card.dataset.testid=`photo-video-item-fixture-${i}`
          const img=doc.createElement('img');img.dataset.testid=`photo-video-image-fixture-${i}`
          Object.defineProperties(img,{currentSrc:{value:`https://static.tnet.ge/fixture/${i}.jpg`},complete:{value:true},naturalWidth:{value:640}})
          card.append(img);cards.append(card)
        }
        label.textContent='ფოტო 15/15'
      })
      const uploaded=await uploadPhotos(doc,received.files,()=>{},{timeoutMs:1000})
      check(uploaded.verified===15,'Fyusion simulated MyAuto gallery: images confirmed 15/15; no live upload claim')
    }finally{(globalThis as typeof globalThis & {chrome?:unknown}).chrome=previous}
  }finally{frame.remove()}
}
