import {parseSiteManheim,inspectSiteManheimPhotos} from '../src/siteManheim'
import {siteManheimAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {watchSiteManheim} from '../../../apps/extension/src/content/siteManheim'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {assertNormalizedVehicle} from '../src/validation'

export async function runSiteManheimTests(check:(v:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  const url='https://site.manheim.com/inventory/selected',rejects=(fn:()=>unknown)=>{try{fn();return false}catch{return true}}
  const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0))
  try{
    for(const path of ['/','/results','/inventory/selected']){
      const vehicle=parseSiteManheim(doc,'https://site.manheim.com'+path);assertNormalizedVehicle(vehicle)
      check(vehicle.source==='ManheimSite'&&vehicle.fullModelName==='Range Rover SV'&&vehicle.images.length===15&&vehicle.availableImageCount===98,'site snapshot: validated component works independently of URL path '+path)
    }
    check(rejects(()=>parseSiteManheim(doc,'https://site.manheim.com.attacker.example/')),'site: exact HTTPS hostname required')
    const vehicle=parseSiteManheim(doc,url),node=doc.querySelector('[data-test-id="stockwave-info"]')!,data=JSON.parse(node.textContent!),images=data.images
    data.images=[images[0]];node.textContent=JSON.stringify(data)
    const complete=inspectSiteManheimPhotos(doc,url)
    check(complete.images.length===15&&complete.availableImageCount>=98&&complete.images.every((value,i)=>new URL(value).pathname.endsWith(`fixture-search-${String(i+1).padStart(3,'0')}.jpg`)),'site: one structured photo cannot mask 98-photo gallery; first 15 ordered distinct originals selected')
    const gallery=doc.querySelector('#fyusion-prism-viewer')!
    gallery.setAttribute('hidden','')
    check(inspectSiteManheimPhotos(doc,url).images.length===15,'site: hidden gallery inside verified selected component remains a valid source')
    doc.body.append(gallery)
    check(inspectSiteManheimPhotos(doc,url).images.length===15,'site: same owned gallery node can move into fullscreen portal')
    gallery.remove()
    data.images=[];delete data.mainImage;node.textContent=JSON.stringify(data)
    const unrelated=doc.createElement('div');unrelated.innerHTML='<div class="svfy_viewer"><div class="svfy_tip" tip="Image 1"><img src="https://images.cdn.manheim.com/unrelated-banner.jpg"></div></div>';doc.body.append(unrelated)
    check(inspectSiteManheimPhotos(doc,url).images.length===0,'site: unrelated galleries outside verified root never substitute for missing vehicle photos')
    const waiting=resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},500,undefined,current=>inspectSiteManheimPhotos(current,url))
    gallery.removeAttribute('hidden');doc.querySelector('[data-test-id="vehicle-details-view-container"]')!.append(gallery)
    check((await waiting).images.length===15,'site: bounded observer retries only missing gallery stage when correct gallery appears')
    const savedGallery=gallery.innerHTML
    for(const count of [1,5]){
      data.images=images.slice(0,count);node.textContent=JSON.stringify(data)
      gallery.querySelectorAll('.svfy_tip').forEach(tip=>{const index=Number(tip.getAttribute('tip')?.match(/Image (\d+)/)?.[1]);if(!index||index>count)tip.remove()})
      gallery.querySelectorAll('.svfy_catbtn[data-name="All"] span.svfy_chp').forEach(counter=>{counter.textContent=String(count)})
      const smaller=inspectSiteManheimPhotos(doc,url)
      check(smaller.galleryReady&&smaller.images.length===count,'site: confirmed smaller gallery transfers all '+count+' actual photos without padding')
      gallery.innerHTML=savedGallery
    }
    data.images=images;node.textContent=JSON.stringify(data)
    doc.body.append(gallery)
    const root=doc.querySelector('[data-test-id="vehicle-details-view-container"]')!
    data.id='OVE.NEXT.002';data.vin='2HGCM82633A004352';data.designatedDescriptionEnrichment.vin=data.vin;data.images=[];node.textContent=JSON.stringify(data)
    root.setAttribute('data-key',data.id);root.setAttribute('data-vin',data.vin);doc.querySelector('[data-testid="vdp-vin"]')!.textContent=data.vin
    check(inspectSiteManheimPhotos(doc,url).images.length===0,'site SPA: cached portal gallery from previous identity cannot be reused')
    root.remove();gallery.remove();unrelated.remove()
    doc.body.innerHTML='<h1>Locations</h1><img src="https://images.cdn.manheim.com/location.jpg">'
    let mounted=0,unmounted=0
    const dispose=watchSiteManheim(doc,siteManheimAdapter,()=>{mounted++;return()=>{unmounted++}},()=>url)
    check(mounted===0&&rejects(()=>parseSiteManheim(doc,url)),'site informational page: no launcher or parsing without verified vehicle content')
    const fresh=new DOMParser().parseFromString(html,'text/html').querySelector('[data-test-id="vehicle-details-view-container"]')!
    doc.body.append(doc.importNode(fresh,true));await tick()
    check(mounted===1,'site SPA: late selected vehicle activates launcher once')
    doc.querySelector('h1')!.textContent='Changed';await tick()
    check(mounted===1,'site SPA: unrelated page changes never mount duplicate launcher')
    doc.querySelector('[data-test-id="vehicle-details-view-container"]')!.remove();await tick()
    check(unmounted===1,'site SPA: returning to informational page removes launcher and parser registration')
    dispose();doc.body.append(doc.importNode(fresh,true));await tick()
    check(mounted===1,'site: disposed observer cannot reactivate stale extension context')
    const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text()
    const legacyDoc=new DOMParser().parseFromString(legacy,'text/html'),old=parseSiteManheim(legacyDoc,url)
    check(old.source==='ManheimSite'&&old.images.length===15&&!old.price&&!old.description?.includes(old.vin),'site: confirmed legacy detail layout reuses existing parser and privacy rules')
  }finally{frame.remove()}
}
