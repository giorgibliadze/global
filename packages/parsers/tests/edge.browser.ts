import {EdgePreparation} from '../../../apps/extension/src/content/edgePreparation'
import {runEdgeSpecTests} from './edgeSpecs.browser'
import {registerManheimParser} from '../../../apps/extension/src/content/manheim'
import {runEdgePreloadTests} from './edgePreload.browser'
import {runEdgeStartTests} from './edgeStart.browser'
import {edgeDestinationLimit} from '../../../apps/extension/src/photos/edgeTransfer'
import {collectEdgeRuntimePhotos} from '../src/edge/runtime'
import {myautoFields,vehicleDescription} from '../src/myauto'
import {parseEdgePipeline,inspectEdgePhotos,inspectEdgeSelection} from '../src/edge/index'
import {edgePhotoUrl,edgePhotoIdentity,edgePhotoRank,edgeDetailId} from '../src/edge/urls'
import {safePhotoUrl} from '../src/photoUrls'
import {assertNormalizedVehicle} from '../src/validation'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {edgePipelineAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {vehicleSource,vehicleDetailUrl} from '../../../apps/extension/src/services/sourceRegistry'
import {watchEdge} from '../../../apps/extension/src/content/edge'
import {TransferManager} from '../../../apps/extension/src/background/transfers'
import {IndexedPhotoStore} from '../../../apps/extension/src/photos/store'
import {downloadPhoto} from '../../../apps/extension/src/photos/download'
import {downloadEdgePhoto,downloadSourcePhoto,edgeDownloadUrl,edgeDownloadCandidates} from '../../../apps/extension/src/background/edgeDownloads'
import {runMyautoTransfer} from '../../../apps/extension/src/myauto/transfer'
import type {ExtensionApi,Sender} from '../../../apps/extension/src/services/extensionApi'
import type {TransferRecord} from '@auto-importer/shared'
const urlA='https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32),urlB=urlA.replace(/a{32}$/,'b'.repeat(32))
export async function runEdgeTests(check:(value:unknown,label:string)=>void,onMeasurement?:(record:Record<string,unknown>)=>void){
  const a=await(await fetch('/packages/parsers/tests/fixtures/edge-gasoline.html')).text(),b=await(await fetch('/packages/parsers/tests/fixtures/edge-electric.html')).text()
  const classic=await(await fetch('/packages/parsers/tests/fixtures/edge-classic.html')).text(),urlClassic=urlA.replace(/a{32}$/,'c'.repeat(32))
  await runEdgeSpecTests(check,a,b,urlA,urlB)
  await runEdgeStartTests(check,a,b,urlA,urlB)
  await runEdgePreloadTests(check,a,urlA)
  const frame=document.createElement('iframe');document.body.append(frame);const doc=frame.contentDocument!
  const load=(html:string)=>{doc.open();doc.write(html);doc.close()}
  const rejected=(action:()=>unknown)=>{try{action();return false}catch{return true}}
  try{
    const actualForm=new DOMParser().parseFromString(await(await fetch('/packages/parsers/tests/fixtures/myauto.html')).text(),'text/html')
    check(edgeDestinationLimit(actualForm)?.limit===15,'EDGE destination limit comes from the actual saved form counter, not the photo-video-label heading')
    check(vehicleSource(urlA)?.id==='EdgePipeline'&&vehicleDetailUrl(urlA)&&!vehicleDetailUrl('https://www.edgepipeline.com/')&&!vehicleDetailUrl(urlA+'/other')&&!edgeDetailId(urlA.replace('www.edgepipeline.com','www.edgepipeline.com.attacker.test')),'EDGE: exact HTTPS host/detail route registration, informational/lookalike pages rejected')
    load(classic);const classicVehicle=parseEdgePipeline(doc,urlClassic,true);assertNormalizedVehicle(classicVehicle)
    check(classicVehicle.make==='Ford'&&classicVehicle.model==='Mustang'&&classicVehicle.year===1968&&classicVehicle.trim==='ELEANOR OFFICIALLY LICENSED TRIBUTE EDITION GEN 3 COYOTE','EDGE supplied classic snapshot: labeled trim separated without arbitrary title splitting')
    check(classicVehicle.vin.length===11&&classicVehicle.mileage?.value===1111&&classicVehicle.mileage.unit==='mi'&&classicVehicle.transmission==='Manual'&&classicVehicle.exteriorColor==='GRAY'&&classicVehicle.interiorColor==='BLACK','EDGE legacy identity, Exempt mileage, transmission and colors survive normalization')
    check([classicVehicle.engineCc,classicVehicle.cylinders,classicVehicle.fuel,classicVehicle.body,classicVehicle.drivetrain,classicVehicle.interiorMaterial].every(value=>value===undefined),'EDGE collapsed details and unavailable placeholders never fabricate specifications')
    const classicPreparation=new EdgePreparation(doc,{runtime:{sendMessage:async()=>({ok:true,value:true})}} as unknown as ExtensionApi,()=>urlClassic)
    try{const preload=await classicPreparation.resolve(),click=await classicPreparation.resolve();check(preload.preparationId===click.preparationId&&click.vehicle.model==='Mustang'&&classicPreparation.verify(click.preparationId),'EDGE legacy fallback reuses the existing fast preparation session on click')}finally{classicPreparation.dispose()}
    const classicPhotos=inspectEdgePhotos(doc,urlClassic)
    check(classicPhotos.availableImageCount===48&&classicPhotos.images.length>1&&!classicPhotos.galleryReady,'EDGE actual classic gallery: '+classicPhotos.images.length+'/48 filename-based photos discovered; unloaded slots not invented')
    const classicRuntime=doc.createElement('script');classicRuntime.id='auto-importer-edge-gallery-data';classicRuntime.type='application/json';classicRuntime.dataset.vehicleId=classicVehicle.listingId!;classicRuntime.dataset.vin=classicVehicle.vin
    classicRuntime.textContent=JSON.stringify(Array.from({length:48},(_,index)=>({full:'https://file3.autolookout.net/classic-full-'+index+'.jpg'})));doc.querySelector('#vdp')!.append(classicRuntime)
    const fullClassic=inspectEdgePhotos(doc,urlClassic)
    check(fullClassic.galleryReady&&fullClassic.images.length===48&&fullClassic.images.every((url,index)=>url.endsWith('/classic-full-'+index+'.jpg')),'EDGE legacy identity accepts a complete 48-photo Fotorama dataset in original order, without changing discovery')
    classicRuntime.remove()
    check(!vehicleDescription(classicVehicle).includes(classicVehicle.vin),'EDGE legacy VIN never appears in generated description')
    for(const source of ['Manheim24','ManheimSearch','ManheimSite','Manheim24Search'])check(rejected(()=>assertNormalizedVehicle({...classicVehicle,source})),'Legacy exception remains EDGE-only: '+source)
    check(rejected(()=>assertNormalizedVehicle({...classicVehicle,year:2020}))&&rejected(()=>assertNormalizedVehicle({...classicVehicle,listingId:undefined})),'EDGE legacy identity requires pre-1981 year and verified listing ID')
    for(const vin of ['UNKNOWN','--','?','N/A',''])check(rejected(()=>assertNormalizedVehicle({...classicVehicle,vin})),'EDGE unavailable legacy chassis value remains rejected')
    const legacyVinField=[...doc.querySelectorAll('.section.details .field')].find(row=>row.querySelector('label')?.textContent==='VIN')!.querySelector('span')!,savedLegacyVin=legacyVinField.textContent!
    legacyVinField.textContent='8F02X000002';check(rejected(()=>parseEdgePipeline(doc,urlClassic,true)),'EDGE conflicting legacy identifiers cannot mix vehicle data');legacyVinField.textContent=savedLegacyVin
    const classicTitle=doc.querySelector('h1.description')!,originalClassicTitle=classicTitle.textContent!
    for(const year of [1908,1955,1980]){classicTitle.textContent=originalClassicTitle.replace('1968',String(year));const old=parseEdgePipeline(doc,urlClassic,true);assertNormalizedVehicle(old);check(old.year===year&&old.model==='Mustang','EDGE legacy fallback supports source year '+year+' without a model-year allowlist')}
    classicTitle.textContent=originalClassicTitle.replace('1968','2008');check(rejected(()=>parseEdgePipeline(doc,urlClassic,true)),'EDGE modern vehicle cannot bypass standard VIN validation')
    classicTitle.textContent=originalClassicTitle
    const trimRow=[...doc.querySelectorAll('.section.details .field')].find(row=>row.querySelector('label')?.textContent==='Trim')!,trimText=trimRow.querySelector('span')!,savedTrim=trimText.textContent!
    trimText.textContent='N/A';const withoutTrim=parseEdgePipeline(doc,urlClassic,true)
    check(withoutTrim.trim===null&&withoutTrim.model==='Mustang '+savedTrim,'EDGE unavailable trim retains the complete unseparated designation')
    trimText.textContent=savedTrim
    const detailRoot=doc.querySelector('.section.details')!,modelField=doc.createElement('div');modelField.className='field';modelField.innerHTML='<label>Model</label><span>Mustang Special</span>';detailRoot.append(modelField)
    check(parseEdgePipeline(doc,urlClassic,true).model==='Mustang Special','EDGE legacy fallback preserves independently labeled model exactly')
    load(a);const gas=parseEdgePipeline(doc,urlA);assertNormalizedVehicle(gas)
    const newest=await(await fetch('/packages/parsers/tests/fixtures/edge-28.html')).text()
    load(newest);const missingExtensions=inspectEdgePhotos(doc,urlA)
    check(missingExtensions.availableImageCount===28&&missingExtensions.images.length===17&&!missingExtensions.galleryReady&&missingExtensions.images.every(url=>!new URL(url).pathname.split('/').pop()!.includes('.')),'EDGE actual 28-slot snapshot: 17 extensionless image identities retained, unloaded frames never invented')
    load(a)
    const completeGallery=doc.querySelector('.gallery')!,savedCompleteGallery=completeGallery.innerHTML
    completeGallery.innerHTML='<div class="fotorama"><img src="https://file3.autolookout.net/complete-one"></div><div class="slide-counts">1 of 3</div>'
    const previousChrome=Object.getOwnPropertyDescriptor(window,'chrome');let readComplete=false,resolvedComplete=false,sourceListener!:Parameters<ExtensionApi['runtime']['onMessage']['addListener']>[0]
    const sourceApi:ExtensionApi={runtime:{id:'edge-complete-test',sendMessage:async()=>({ok:true}),onMessage:{addListener:listener=>{sourceListener=listener},removeListener:()=>{}}},tabs:{query:async()=>[],sendMessage:async()=>({ok:false}),create:async()=>({})},storage:{session:{get:async()=>({}),set:async()=>{},remove:async()=>{}}}}
    Object.defineProperty(window,'chrome',{configurable:true,value:sourceApi})
    const disposeComplete=registerManheimParser(doc,{...edgePipelineAdapter,photos:current=>{readComplete=true;return inspectEdgePhotos(current,urlA)}})
    try{
      const completeResponse=new Promise<{ok?:boolean;value?:{images:string[]}}>(resolve=>sourceListener({type:'MANHEIM_PHOTOS',transferId:crypto.randomUUID(),edgePartial:true,edgeComplete:true,expected:{vin:gas.vin,listingId:gas.listingId}},{id:sourceApi.runtime.id},value=>{resolvedComplete=true;resolve(value as {ok?:boolean;value?:{images:string[]}})}))
      for(let attempt=0;attempt<100&&!readComplete;attempt++)await new Promise(resolve=>setTimeout(resolve,1))
      await new Promise(resolve=>setTimeout(resolve,1))
      check(readComplete&&!resolvedComplete,'EDGE batch discovery does not label a first partial image as a complete gallery')
      completeGallery.querySelector('.fotorama')!.insertAdjacentHTML('beforeend','<img src="https://file3.autolookout.net/complete-two"><img src="https://file3.autolookout.net/complete-three">')
      const completeResult=await completeResponse
      check(completeResult.ok&&completeResult.value?.images.length===3,'EDGE complete-gallery observer resolves on the final discovered frames before batch preparation')
      // The same source receiver must accept a pre-standard ID; no new photo transport.
      disposeComplete?.();load(classic)
      const stopLegacy=registerManheimParser(doc,{...edgePipelineAdapter,photos:current=>inspectEdgePhotos(current,urlClassic)})
      try{
        const legacyResponse=await new Promise<{ok?:boolean;value?:{images:string[]}}>(resolve=>sourceListener({type:'MANHEIM_PHOTOS',transferId:crypto.randomUUID(),edgePartial:true,expected:{vin:classicVehicle.vin,listingId:classicVehicle.listingId}},{id:sourceApi.runtime.id},value=>resolve(value as {ok?:boolean;value?:{images:string[]}})))
        check(legacyResponse.ok&&!!legacyResponse.value?.images.length,'EDGE legacy photo refresh passes the existing source-message identity gate')
      }finally{stopLegacy?.();load(a)}
    }finally{disposeComplete?.();if(previousChrome)Object.defineProperty(window,'chrome',previousChrome);else Reflect.deleteProperty(window,'chrome');completeGallery.innerHTML=savedCompleteGallery}
    const large={...gas,images:Array.from({length:30},(_,i)=>`https://file3.autolookout.net/validation-${i}.jpg`)};assertNormalizedVehicle(large)
    check(rejected(()=>assertNormalizedVehicle({...large,source:'Manheim24'})),'EDGE larger payload is supported while existing non-EDGE 15-photo validation remains unchanged')
    check(gas.source==='EdgePipeline'&&gas.make==='BMW'&&gas.model==='2-Series'&&gas.year===2026&&gas.trim===null,'EDGE supplied gasoline fixture: labeled identity and exact manufacturer/model/year, no invented trim')
    check(gas.fuel==='Gasoline'&&gas.cylinders===6&&gas.drivetrain==='AWD'&&gas.doorCount===2&&gas.body==='Coupe'&&gas.transmission===undefined&&gas.engineCc===undefined,'EDGE gasoline: confirmed specifications only, unknown transmission and engine volume remain missing')
    check(gas.mileage?.value===9614&&gas.mileage.unit==='mi'&&gas.mileageKm===undefined&&gas.exteriorColor==='BLUE'&&gas.interiorColor==='TAN'&&gas.interiorMaterial==='Cloth'&&!!gas.equipment?.length&&!gas.price&&!gas.description,'EDGE gasoline: original miles, labeled colors/material/options; no price or description copied')
    const photos=inspectEdgePhotos(doc,urlA)
    check(photos.availableImageCount===47&&photos.images.length===17&&!photos.galleryReady,'EDGE gasoline actual snapshot: 47 gallery slots, 17 observed identities retained without fabricating the remaining unloaded photos')
    const nav=[...doc.querySelectorAll('.fotorama__nav__frame--thumb')],navURLs=nav.map(n=>n.querySelector('img')?.getAttribute('src')).filter((x):x is string=>!!x).map(x=>edgePhotoUrl(x)!)
    check(photos.images.slice(0,navURLs.length).every((u,i)=>edgePhotoIdentity(u)===edgePhotoIdentity(navURLs[i]))&&new Set(photos.images.map(edgePhotoIdentity)).size===17,'EDGE: gallery order and genuinely distinct identities survive deduplication')
    check(photos.images.filter(u=>edgePhotoRank(u)>7500).length>=2,'EDGE snapshot: verified large variants preferred; other thumbnail paths are never fabricated')
    check(edgePhotoUrl('//file3.autolookout.net/a.jpg')==='https://file3.autolookout.net/a.jpg'&&safePhotoUrl('http://file3.autolookout.net/a.jpg')==='http://file3.autolookout.net/a.jpg'&&!edgePhotoUrl('https://file3.autolookout.net/a.jpg?token=secret')&&!safePhotoUrl('https://unknown.example/a.jpg')&&!edgePhotoUrl('https://file3.autolookout.net/placeholder.jpg'),'EDGE CDN registration: protocol-relative/HTTP/HTTPS supported; tokens and unknown hosts rejected')
    const shaft=doc.querySelector('.fotorama__nav__shaft')!,parent=shaft.parentElement!;shaft.remove();check(!inspectEdgePhotos(doc,urlA).galleryReady&&parseEdgePipeline(doc,urlA).images.length===0,'EDGE: partial stage gallery never masquerades as the complete complete gallery')
    const stageOnly=await resolveSelectedPhotos(doc,{vin:gas.vin,listingId:gas.listingId},50,undefined,current=>inspectEdgePhotos(current,urlA))
    check(stageOnly.images.length>0&&stageOnly.images.length<15&&!stageOnly.galleryReady,'EDGE bounded readiness preserves verified stage/print photos when API and thumbnail initialization never finish');parent.append(shaft)
    const firstImage=nav[0].querySelector('img')!;firstImage.setAttribute('data-src','https://file3.autolookout.net/placeholder.jpg');check(inspectEdgePhotos(doc,urlA).images.length===17,'EDGE lazy attributes: invalid data-src never masks a valid src');firstImage.removeAttribute('data-src')
    const saved=nav.map(node=>node.innerHTML);nav.forEach(node=>node.replaceChildren())
    check(!inspectEdgePhotos(doc,urlA).galleryReady,'EDGE lazy gallery: active primary cannot masquerade as 47 ready photos')
    const waiting=resolveSelectedPhotos(doc,{vin:gas.vin,listingId:gas.listingId},500,undefined,current=>inspectEdgePhotos(current,urlA))
    nav.forEach((node,i)=>{node.innerHTML=saved[i];const img=node.querySelector('img');if(img){img.setAttribute('data-src',img.getAttribute('src')!);img.removeAttribute('src')}})
    check((await waiting).images.length===17,'EDGE bounded gallery observer resolves delayed data-src thumbnails')
    // Documented runtime Fotorama data bridge, with synthetic verified originals.
    const output=doc.createElement('script');output.id='auto-importer-edge-gallery-data';output.type='application/json';output.dataset.vehicleId='a'.repeat(32);output.dataset.vin=gas.vin;doc.querySelector('#vdp')!.append(output)
    output.textContent='[]';check(inspectEdgePhotos(doc,urlA).images.length===17,'EDGE empty runtime metadata cannot mask a complete DOM gallery')
    output.textContent=JSON.stringify([{full:'https://file3.autolookout.net/partial-first.jpg'}]);check(inspectEdgePhotos(doc,urlA).images.length>=17,'EDGE partial runtime metadata cannot reduce a complete gallery to one photo')
    shaft.remove()
    for(const count of [1,5,8,15,23,30,47,60]){
      doc.querySelector('.slide-counts > span:last-child')!.textContent=String(count)
      output.textContent=JSON.stringify(Array.from({length:count},(_,i)=>({full:`https://file3.autolookout.net/fixture-a/full-${i+1}.jpg`,thumb:`https://file3.autolookout.net/fixture-a/thumb-${i+1}.jpg`})))
      const info=inspectEdgePhotos(doc,urlA)
      check(info.images.length===count&&info.availableImageCount===count&&info.images.every((u,i)=>u.endsWith(`/full-${i+1}.jpg`)),`EDGE runtime metadata: ${count} ordered photos; full URLs preferred without rewriting`)
    }
    check(collectEdgeRuntimePhotos([{video:true,thumb:'https://file3.autolookout.net/video-poster.jpg'},{img:'https://file3.autolookout.net/real-photo.jpg'}]).photos.length===1,'EDGE video posters are excluded from genuine vehicle photos')
    const original=collectEdgeRuntimePhotos([{full:'https://file3.autolookout.net/original.jpg',thumb:'https://file3.autolookout.net/O3Jlc29sdXRpb246MTAweDc1Ow==/original.jpg'}]);check(original.photos[0].full?.endsWith('/original.jpg'),'EDGE runtime: an explicit original full URL is never downgraded to a measurable thumbnail')
    const frames=Array.from({length:17},(_,i)=>({full:`https://file3.autolookout.net/runtime/vehicle-${Math.max(1,i)}.jpg`}))
    const collected=collectEdgeRuntimePhotos(frames)
    check(collected.photos.length===16&&collected.unique===16&&new Set(collected.photos.map(row=>row.full)).size===16,'EDGE reproduced truncation bug: deduplicate all 17 runtime frames without the old 15-photo cap')
    doc.querySelector('.slide-counts > span:last-child')!.textContent='16'
    output.textContent=JSON.stringify(collected.photos);output.setAttribute('data-gallery-count',String(collected.unique))
    check(inspectEdgePhotos(doc,urlA).galleryReady&&parseEdgePipeline(doc,urlA).images.length===16,'EDGE runtime duplicate frames no longer become an empty vehicle photo payload')
    parent.append(shaft);doc.querySelector('.slide-counts > span:last-child')!.textContent='47'
    output.dataset.vin='3HGCM82633A004352';check(!inspectEdgePhotos(doc,urlA).images.some(u=>u.includes('/fixture-a/full-')),'EDGE bridge rejects metadata belonging to another VIN')
    output.remove()
    const canonical=doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')!;canonical.content=urlB
    check(rejected(()=>parseEdgePipeline(doc,urlB)),'EDGE SPA: new listing URL cannot reuse old vehicle DOM')
    load(b);const ev=parseEdgePipeline(doc,urlB);assertNormalizedVehicle(ev)
    check(ev.make==='Tesla'&&ev.model==='Cybertruck'&&ev.trim==='CyberBeast'&&ev.year===2024&&ev.fuel==='Electric'&&ev.transmission==='Automatic'&&ev.drivetrain==='AWD'&&ev.mileage?.value===30026&&ev.mileage.unit==='mi','EDGE supplied EV fixture: Cybertruck/CyberBeast, electric/automatic/AWD and exact 30026 miles')
    check(ev.engineCc===undefined&&ev.cylinders===undefined&&ev.interiorColor===undefined&&ev.images.length===1&&ev.availableImageCount===1,'EDGE EV: exactly one genuine photo, no invented combustion values or unknown interior color')
    const gallery=doc.querySelector('.gallery')!,originalGallery=gallery.innerHTML,sourcePhoto=ev.images[0]
    gallery.innerHTML=`<div class="fotorama"></div><div class="slide-counts">1 of 1</div><a class="download-pic" href="${sourcePhoto}"></a>`
    check(inspectEdgePhotos(doc,urlB).galleryReady&&parseEdgePipeline(doc,urlB).images[0]===sourcePhoto,'EDGE single-photo gallery can use its actual download-pic link without thumbnail/stage initialization')
    // Documented Fotorama HTML variations, synthetic URLs and source identity.
    for(const count of [1,5,15,28,47,60]){
      gallery.innerHTML='<div class="fotorama">'+Array.from({length:count},(_,index)=>`<a href="https://file3.autolookout.net/html-original-${index}.jpg"><img src="https://file3.autolookout.net/html-thumb-${index}.jpg"></a>`).join('')+'</div><div class="slide-counts">1 of '+count+'</div>'
      const result=inspectEdgePhotos(doc,urlB)
      check(result.galleryReady&&result.images.length===count&&result.images.every((url,index)=>url.endsWith(`/html-original-${index}.jpg`)),`EDGE uninitialized HTML anchors: ${count} ordered originals without duplicate nested thumbnails`)
    }
    gallery.innerHTML='<div class="fotorama"><img src="https://file3.autolookout.net/small.jpg" data-full="https://file3.autolookout.net/full.jpg"><div data-img="https://file3.autolookout.net/html-frame.webp" data-thumb="https://file3.autolookout.net/html-frame-thumb.jpg"></div><img data-src="https://file3.autolookout.net/lazy-original.png"><img data-full="https://unknown.example/rejected.jpg" src="https://file3.autolookout.net/valid-fallback.jpg"></div><div class="slide-counts">1 of 4</div>'
    const htmlVariants=inspectEdgePhotos(doc,urlB)
    check(htmlVariants.galleryReady&&htmlVariants.images.map(url=>url.split('/').pop()).join(',')==='full.jpg,html-frame.webp,lazy-original.png,valid-fallback.jpg','EDGE data-full/data-img/data-thumb/lazy originals: explicit original chosen once, invalid full URL falls back safely')
    gallery.innerHTML='<div class="fotorama"><a href="https://file3.autolookout.net/standard.jpg"><img data-full="https://file3.autolookout.net/nested-full.jpg" src="https://file3.autolookout.net/nested-thumb.jpg"></a><div data-thumb="https://file3.autolookout.net/container-thumb.jpg"><img src="https://file3.autolookout.net/child-original.jpg"></div></div><div class="slide-counts">1 of 2</div>'
    check(inspectEdgePhotos(doc,urlB).images.map(url=>url.split('/').pop()).join(',')==='nested-full.jpg,child-original.jpg','EDGE nested full image outranks anchor standard image; child original outranks container thumbnail')
    gallery.innerHTML='<div class="fotorama"><div data-thumb="https://file3.autolookout.net/thumb-only.jpg"></div><a data-video="true" href="https://file3.autolookout.net/video-poster.jpg"></a></div><div class="slide-counts">1 of 1</div>'
    check(inspectEdgePhotos(doc,urlB).images.length===1,'EDGE thumbnail-only frame retained when no original exists; video posters excluded')
    gallery.innerHTML='<div class="fotorama"><img></div><div class="slide-counts">1 of 1</div>'
    const stopLazy=watchEdge(doc,()=>()=>{})
    const lateFull=resolveSelectedPhotos(doc,{vin:ev.vin,listingId:ev.listingId},1000,undefined,current=>inspectEdgePhotos(current,urlB))
    gallery.querySelector('img')!.setAttribute('data-full','https://file3.autolookout.net/late-full.jpg')
    check((await lateFull).images[0].endsWith('/late-full.jpg'),'EDGE data-full-only lazy mutation wakes bounded source readiness')
    stopLazy()
    gallery.innerHTML=originalGallery
    check(ev.body==='Pickup'&&myautoFields(ev).find(field=>field.field==='body')?.optionValue?.equivalents?.includes('პიკაპი'),'EDGE mapping: labeled Pickup Truck uses verified Pickup/MyAuto Georgian equivalent')
    const descriptions=[vehicleDescription(gas),vehicleDescription(ev)]
    check(descriptions[0].includes('ბენზინი')&&descriptions[1].includes('ელექტრო')&&descriptions[1].includes('პიკაპი')&&descriptions.every((text,i)=>!text.includes(i?ev.vin:gas.vin)&&!/(?:undefined|null|--|\?|<[^>]+>|\$)/.test(text)),'EDGE Georgian description audit: translated verified specifications, no VIN, price, placeholders or HTML; autofill remains skipped')
    check(descriptions[1].split('CyberBeast').length===2,'EDGE description audit: trim appears once')
    const odo=doc.querySelector('.odometer')!;odo.textContent='Odometer: 12,000 km';check(parseEdgePipeline(doc,urlB).mileage?.unit==='km'&&parseEdgePipeline(doc,urlB).mileage?.value===12000,'EDGE explicit kilometers remain kilometers without relabeling or conversion');odo.textContent='Odometer: 30,026'
    const detail=doc.querySelector('.section.details')!,row=doc.createElement('div');row.className='field';row.innerHTML='<label>Model</label><span>Cybertruck Special</span>';detail.append(row)
    check(parseEdgePipeline(doc,urlB).model==='Cybertruck Special','EDGE independently labeled model takes precedence over title fallback');row.remove()
    const fuelRow=[...detail.querySelectorAll('.field')].find(field=>field.querySelector('label')?.textContent==='Fuel Type')!,savedFuel=fuelRow.querySelector('span')!.textContent
    fuelRow.querySelector('span')!.textContent='?';const missingFuel=parseEdgePipeline(doc,urlB);assertNormalizedVehicle(missingFuel);check(missingFuel.model==='Cybertruck'&&missingFuel.fuel===undefined&&missingFuel.images.length===1,'EDGE missing optional fuel cannot block model identification or photos');fuelRow.querySelector('span')!.textContent=savedFuel
    doc.querySelector('.gallery')!.remove();check(parseEdgePipeline(doc,urlB).images.length===0,'EDGE: missing gallery never falls back to unrelated page images')
    load(a);doc.querySelector('.slide-counts > span:last-child')!.textContent='1001';const guarded=parseEdgePipeline(doc,urlA);assertNormalizedVehicle(guarded)
    check(!guarded.images.length&&guarded.availableImageCount===1001,'EDGE metadata safety limit preserves valid vehicle text instead of rejecting the entire transfer')
    // Shared session/download/destination contracts, no second uploader.
    load(a);const memory:Record<string,unknown>={},store=new IndexedPhotoStore();let nextTab=900,downloads=0,delivered=0,peakCache=0,restart=false,restarted=false,galleryGate:Promise<void>|undefined,releaseGallery:(()=>void)|undefined,textBeforeGallery=false,sender:Sender={}
    const sourceSender:Sender={id:'edge-fixture',tab:{id:81,url:urlA},documentId:'edge-source'}
    const api:ExtensionApi={runtime:{id:'edge-fixture',onMessage:{addListener(){}},sendMessage:async message=>{try{const value=await manager.handle(message as Record<string,unknown>,sender);if((message as {type:string}).type==='EDGE_PHOTO_RELEASE'&&restart&&!restarted){manager=new TransferManager(api,store,edgeDownloader);await manager.validateState();restarted=true}return {ok:true,value}}catch{return {ok:false}}}},tabs:{query:async()=>[],create:async()=>({id:++nextTab}),sendMessage:async(_tab,message)=>{const m=message as {type:string};if(m.type==='MANHEIM_RESOLVE')return {ok:true,vehicle:edgePipelineAdapter.parse(doc,sourceSender.tab!.url),preparationId:crypto.randomUUID()};if(m.type==='MANHEIM_VERIFY')return {ok:true,verified:true};if(m.type==='MANHEIM_PHOTOS'){if(photoFailure==='sourceClosed')throw new Error('Synthetic source closed');if(galleryGate)await galleryGate;return {ok:true,value:inspectEdgePhotos(doc,sourceSender.tab!.url)}};return {ok:true,vehicle:edgePipelineAdapter.parse(doc,sourceSender.tab!.url)}}},storage:{session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async values=>{Object.assign(memory,structuredClone(values))},remove:async key=>{delete memory[key]}}}}
    let photoFailure:'none'|'one'|'all'|'sourceClosed'|'reject'='none'
    const decodedCanvas=document.createElement('canvas');decodedCanvas.width=8;decodedCanvas.height=8
    const put=store.put.bind(store);store.put=async(...args)=>{await put(...args);peakCache=Math.max(peakCache,await store.count(args[0]))}
    const edgeDownloader:typeof downloadPhoto=(url,index,_unused,trace,signal)=>downloadEdgePhoto(url,index,async()=>{downloads++;if(photoFailure==='all'||photoFailure==='one'&&index===0)return new Response('',{status:403});const context=decodedCanvas.getContext('2d')!;context.fillStyle=`rgb(${(index*13)%256},${index},120)`;context.fillRect(0,0,8,8);return new Response(Uint8Array.from(atob(decodedCanvas.toDataURL(['image/png','image/jpeg','image/webp'][index%3]).split(',')[1]),c=>c.charCodeAt(0)))},trace,signal)
    let manager=new TransferManager(api,store,edgeDownloader)
    const chrome=Object.getOwnPropertyDescriptor(window,'chrome');Object.defineProperty(window,'chrome',{configurable:true,value:api})
    try{
      for(const [html,url,expected,partial,failure,limit] of [[classic,urlClassic,15,false,'none',15],[a,urlA,15,false,'none',15],[a,urlA,0,false,'none',15],[a,urlA,5,false,'sourceClosed',15],[b,urlB,1,false,'none',15],[a,urlA,8,false,'none',15],[a,urlA,9,false,'none',15],[a,urlA,5,false,'reject',15],[a,urlA,15,true,'none',15],[a,urlA,15,false,'one',15],[b,urlB,1,false,'all',15],[a,urlA,28,false,'none',28],[a,urlA,47,false,'none',47],[a,urlA,30,false,'none',30],[a,urlA,60,false,'none',60],[a,urlA,30,false,'none',15],[a,urlA,30,false,'one',15]] as const){
        photoFailure=failure;delivered=0;peakCache=0;restart=expected===60;restarted=false;galleryGate=expected===8?new Promise<void>(resolve=>{releaseGallery=resolve}):undefined;textBeforeGallery=false
        load(html);const photos=expected>17?Array.from({length:expected},(_,i)=>`https://file3.autolookout.net/universal-${i}${expected===28?'':'.png'}`):inspectEdgePhotos(doc,url).images.slice(0,expected);doc.querySelector('.gallery')!.innerHTML='<div class="fotorama"></div><div class="slide-counts">1 of '+expected+'</div><div class="fotorama__nav__shaft">'+photos.map(photo=>'<div class="fotorama__nav__frame--thumb"><img src="'+photo+'"></div>').join('')+'</div>';sourceSender.tab!.url=url;const lazy=expected===9?[...doc.querySelectorAll<HTMLImageElement>('.gallery .fotorama__nav__frame--thumb img')].slice(4).map(image=>({image,url:image.getAttribute('src')!})):[];for(const item of lazy)item.image.removeAttribute('src');const job=await manager.begin(sourceSender)
        sender={id:'edge-fixture',tab:{id:job.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:'edge-'+job.id}
        const target=document.createElement('iframe');document.body.append(target);const destination=target.contentDocument!
        try{
          destination.body.innerHTML='<input name="primaryFeatures.vinCode"><input name="primaryFeatures.mileage"><span data-testid="single-select-value-primaryFeatures.mileageType">მილი</span><textarea data-testid="description-textarea"></textarea><label data-testid="toggle-checkbox-label-sale.isNegotiablePrice"><input type="checkbox" name="sale.isNegotiablePrice" data-testid="toggle-checkbox-input-sale.isNegotiablePrice"></label><input name="sale.price"><div data-testid="photo-video-container"><span data-testid="photo-video-label">ფოტო 0/15</span><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>'.replace('/15','/'+limit)
          const legacy=expected===8,galleryNode=destination.querySelector('[data-testid="photo-video-gallery"]')!
          if(legacy){const label=destination.querySelector('[data-testid="photo-video-label"]')!;label.textContent='\u10e4\u10dd\u10e2\u10dd / \u10d5\u10d8\u10d3\u10d4\u10dd';const counter=destination.createElement('span');counter.className='fixture-photo-count';counter.textContent='\u10e4\u10dd\u10e2\u10dd 0/'+limit;label.after(counter);galleryNode.removeAttribute('data-testid')}
          let submissions=0,rejectedName='';const deliveredNames=new Set<string>(),batches:number[]=[]
          const input=destination.querySelector<HTMLInputElement>('input[type="file"]')!
          input.addEventListener('change',()=>{
            submissions++;const batch=input.files!.length;batches.push(batch);for(const file of input.files!)deliveredNames.add(file.name);delivered=deliveredNames.size
            if(partial&&!rejectedName)rejectedName=input.files![0].name
            for(let i=0;i<batch;i++){if(failure==='reject'||input.files![i].name===rejectedName){const pending=destination.createElement('div');pending.dataset.testid=`photo-video-loading-edge-${submissions}-${i}`;destination.querySelector('[data-testid="photo-video-gallery"]')!.append(pending);pending.remove();continue}const card=destination.createElement('div');card.dataset.testid=`photo-video-item-edge-${submissions}-${i}`;const image=destination.createElement('img');image.dataset.testid=`photo-video-image-edge-${submissions}-${i}`;Object.defineProperties(image,{currentSrc:{value:`https://static.tnet.ge/edge-${submissions}-${i}.jpg`},complete:{value:true},naturalWidth:{value:640}});if(legacy)galleryNode.append(image);else{card.append(image);galleryNode.append(card)}}
            const count=legacy?galleryNode.querySelectorAll('img').length:destination.querySelectorAll('[data-testid^="photo-video-item-"]').length
            destination.querySelector(legacy?'.fixture-photo-count':'[data-testid="photo-video-label"]')!.textContent=`ფოტო ${count}/${limit}`
          })
          const claimed=await manager.handle({type:'TRANSFER_CLAIM',protocol:1},sender) as TransferRecord,before=downloads
          if(failure==='sourceClosed')await manager.tabClosed(sourceSender.tab!.id!)
          const pipelineStarted=performance.now()
          const result=await runMyautoTransfer(destination,claimed,current=>{if(lazy.length&&current.fields.some(field=>field.key==='mileageKm'&&field.persisted))for(const item of lazy)item.image.setAttribute('src',item.url);if(galleryGate&&current.fields.some(field=>field.key==='mileageKm'&&field.persisted)){textBeforeGallery=true;releaseGallery?.();galleryGate=undefined}},{pageUrl:()=>sender.tab!.url!,dropdownTimeoutMs:1,uploadTimeoutMs:1000})
          onMeasurement?.({transferId:job.id,vehicleId:'synthetic-'+job.vehicle.fuel,scenario:job.vehicle.fuel+(partial?'-partial':'-complete'),wallMs:performance.now()-pipelineStarted,selected:expected,downloaded:downloads-before,prepared:result.photos.prepared,submittedUnique:delivered,accepted:result.photos.uploaded,batches,stages:result.timings})
          if(url===urlClassic){
            check(destination.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')!.value===job.vehicle.vin&&destination.querySelector<HTMLInputElement>('input[name="primaryFeatures.mileage"]')!.value==='1111','EDGE legacy payload reaches destination VIN and mileage fields despite unsupported optional dropdowns')
            check(!destination.querySelector<HTMLTextAreaElement>('textarea')!.value&&batches.length===1&&result.photos.uploaded===15,'EDGE classic vehicle keeps description untouched and uses one verified simulated photo batch')
          }
          if(expected===9)check(submissions===1&&result.photos.total===9&&result.photos.uploaded===9,'EDGE delayed gallery grows during text filling, then all nine photos use one input change')
          if(expected===8)check(textBeforeGallery&&performance.now()-pipelineStarted<2000,'EDGE blocked gallery response does not hold text-progress job lock; first text persists before gallery completion')
          const failedFiles=failure==='all'?expected:failure==='one'?1:0,eligible=Math.min(expected,limit+failedFiles)
          check(downloads-before===eligible&&delivered===eligible-failedFiles&&result.photos.uploaded===(failure==='reject'?0:eligible-failedFiles-(partial?1:0)),`EDGE isolated ${job.vehicle.fuel}: extracted/downloaded/delivered/simulated-confirmed ${expected}/${eligible-failedFiles}/${eligible-failedFiles}/${eligible-failedFiles-(partial?1:0)} (${failure})`)
          check(peakCache<=4&&(!batches.length||batches[0]===Math.min(result.photos.prepared,limit)),'EDGE internal transport retains four job blobs; complete prepared collection is submitted in one batch')
          if(failure==='reject')check(submissions===2&&result.photos.uploaded===0&&result.errors.length>0,'EDGE full batch rejection is reported; existing uploader makes only its bounded safe retry, text remains filled')
          if(expected===60)check(restarted&&result.photos.uploaded===60,'EDGE service-worker manager restart preserves cumulative prepared indexes and tab-bound photo progress')
          if(expected>limit)check(result.errors.some(error=>error.includes(String(limit)))&&result.photos.uploaded===limit,'EDGE actual destination limit is reported explicitly; source payload remains complete')
          if(failure==='sourceClosed')check(result.photos.uploaded===expected,'EDGE source closure preserves captured valid photo references and text payload')
          if(expected===0)check(result.errors.length>0&&result.fields.some(field=>field.key==='mileageKm'&&field.persisted),'EDGE no gallery reports photo failure after independent text filling')
          if(failure==='one'||failure==='all')check(result.errors.length>0&&result.photos.uploaded<result.photos.total&&submissions===(failure==='all'?0:1),'EDGE failed download is field-independent: valid files survive; all-failed does not call uploader or claim success')
          if(partial)check(submissions===2&&batches.join(',')==='15,1'&&result.errors.length>0&&result.photos.uploaded<result.photos.total,'EDGE partial acceptance: 14/15 stays partial after one missing-file retry; successful 14 are never resubmitted')
          check(destination.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value===String(job.vehicle.mileage!.value)&&destination.querySelector('textarea')!.value===''&&destination.querySelector<HTMLInputElement>('[name="sale.price"]')!.value===''&&destination.querySelector<HTMLInputElement>('[name="sale.isNegotiablePrice"]')!.checked,'EDGE receiver: original miles, description untouched, negotiable price, no auction price')
        }finally{target.remove();await manager.tabClosed(job.destinationTabId!)}
      }
    }finally{if(chrome)Object.defineProperty(window,'chrome',chrome);else Reflect.deleteProperty(window,'chrome')}
    load(a);const originalRoot=doc.querySelector('.gallery')!,savedGallery=originalRoot.innerHTML
    originalRoot.innerHTML='<div class="fotorama">'+Array.from({length:8},(_,index)=>'<a href="https://file3.autolookout.net/embedded-'+index+'.webp"><img src="https://file3.autolookout.net/embedded-'+index+'.webp"></a>').join('')+'</div><div class="slide-counts">1 of 8</div>'
    check(inspectEdgePhotos(doc,urlA).images.length===8&&inspectEdgePhotos(doc,urlA).galleryReady,'EDGE original Fotorama anchor metadata provides a complete ordered gallery before plugin initialization')
    originalRoot.innerHTML=savedGallery
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d')!.fillRect(0,0,8,8)
    const png=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0))
    let fetches=0
    const transient=await downloadPhoto('https://file3.autolookout.net/audit.jpg',0,async()=>{fetches++;return fetches===1?new Response('',{status:503}):new Response(png)})
    check(fetches===2&&transient.metadata.size===png.length,'EDGE download: transient 503 retries only failed image through existing bounded downloader')
    for(const [status,html] of [[404,false],[403,false],[200,true]] as const){
      fetches=0;let failed=false
      try{await downloadPhoto('https://file3.autolookout.net/audit.jpg',0,async()=>{fetches++;return new Response(html?'<html>unavailable image</html>':'',{status})})}catch{failed=true}
      check(failed&&fetches===1,`EDGE download: ${html?'non-image response':status} fails once without permanent retries`)
    }
    check(edgeDownloadUrl('http://file3.autolookout.net/audit.jpg')==='https://file3.autolookout.net/audit.jpg'&&rejected(()=>edgeDownloadUrl('https://unknown.example/audit.jpg')),'EDGE transport canonicalizes only the verified scheme, preserving path; unknown host rejected')
    let edgeCalls=0,edgeInit:RequestInit|undefined,edgeInput='',marks=0
    const trace={transferId:'00000000-0000-4000-8000-000000000000',vehicleId:'fixture',platform:'EdgePipeline' as const,mark(){marks++}}
    const controller=new AbortController()
    const downloaded=await downloadSourcePhoto('http://file3.autolookout.net/audit.jpg',2,async(input,init)=>{edgeCalls++;edgeInput=String(input);edgeInit=init;const response=new Response(png);Object.defineProperty(response,'url',{value:'https://dxbrs3zlwqu4z.cloudfront.net/audit.jpg'});return response},trace,controller.signal)
    check(edgeCalls===1&&edgeInput==='https://file3.autolookout.net/audit.jpg'&&edgeInit?.redirect==='follow'&&edgeInit.credentials==='include'&&edgeInit.referrerPolicy==='no-referrer'&&!!edgeInit.signal&&marks===2&&downloaded.metadata.index===2&&downloaded.metadata.mime==='image/png'&&downloaded.metadata.name==='vehicle-03.png','EDGE exact CDN redirect is permitted; existing credentials, cancellation, byte validation and metadata contract preserved')
    for(const destination of ['https://unknown.example/audit.jpg','http://dxbrs3zlwqu4z.cloudfront.net/audit.jpg']){
      let calls=0,error:unknown
      try{await downloadEdgePhoto('https://file3.autolookout.net/audit.jpg',0,async()=>{calls++;const response=new Response(png);Object.defineProperty(response,'url',{value:destination});return response})}catch(caught){error=caught}
      check(calls===1&&error instanceof Error&&'photoErrorCode' in error&&error.photoErrorCode==='URL_REJECTED'&&error.cause instanceof Error,'EDGE rejects unapproved final CDN/downgrade once and retains original failure cause')
    }
    let attempts=0
    await downloadEdgePhoto('https://file3.autolookout.net/audit.jpg',0,async()=>++attempts===1?new Response('',{status:503}):new Response(png))
    check(attempts===2,'EDGE wrapper preserves bounded transient retries')
    attempts=0;let denied=false
    try{await downloadEdgePhoto('https://file3.autolookout.net/audit.jpg',0,async()=>{attempts++;return new Response('',{status:403})})}catch{denied=true}
    check(denied&&attempts===1,'EDGE authentication failure is not retried or bypassed')
    let otherRedirect:RequestRedirect|undefined,otherInput=''
    await downloadSourcePhoto('https://images.cdn.manheim.com/audit.jpg',0,async(input,init)=>{otherInput=String(input);otherRedirect=init?.redirect;return new Response(png)},{...trace,platform:'ManheimSearch'})
    check(otherRedirect==='error'&&otherInput==='https://images.cdn.manheim.com/audit.jpg','Non-EDGE registration delegates unchanged to existing shared downloader')
    const thumb='https://file3.autolookout.net/source/O3Jlc29sdXRpb246MTAweDc1Ow==/photo.png'
    const variants=edgeDownloadCandidates(thumb),seen:string[]=[]
    check(variants.length===2&&variants[0].includes('O3Jlc29sdXRpb246MTYwMHgxMjAwOw==')&&edgePhotoIdentity(variants[0])===edgePhotoIdentity(thumb),'EDGE candidate keeps exact photo identity and uses only observed resize instruction')
    const recovered=await downloadEdgePhoto(thumb,4,async(input)=>{seen.push(String(input));return seen.length===1?new Response('',{status:404}):new Response(png)})
    check(seen.join()===variants.join()&&recovered.metadata.index===4&&recovered.metadata.mime==='image/png','EDGE failed large candidate falls back to actual gallery thumbnail, preserving PNG/order')
    let largeFails=0
    const full=variants[0],fullFallbacks=edgeDownloadCandidates(full)
    const smaller=await downloadEdgePhoto(full,1,async(input)=>{largeFails++;return new Response(String(input)===full?'':png,{status:String(input)===full?404:200,headers:{'Content-Type':'text/html'}})})
    check(fullFallbacks.length===2&&fullFallbacks[1]===thumb&&largeFails===2&&smaller.metadata.mime==='image/png','EDGE observed full-size failure can recover through a decoded small variant; bytes override misleading response MIME')
    let brokenCalls=0,brokenError:unknown
    try{await downloadEdgePhoto('https://file3.autolookout.net/broken.jpg',0,async()=>{brokenCalls++;return new Response(new Uint8Array([255,216,255,0]))})}catch(error){brokenError=error}
    check(brokenCalls===1&&brokenError instanceof Error&&'photoErrorCode' in brokenError&&brokenError.photoErrorCode==='INVALID_IMAGE_BYTES','EDGE rejects a JPEG signature with undecodable image bytes before File delivery')
    const httpSeen:string[]=[]
    await downloadEdgePhoto('http://file3.autolookout.net/http-only.png',0,async(input)=>{httpSeen.push(String(input));return new Response(String(input).startsWith('https:')?'':png,{status:String(input).startsWith('https:')?404:200})})
    check(httpSeen.length===2&&httpSeen[0].startsWith('https:')&&httpSeen[1].startsWith('http:'),'EDGE HTTP-only original has bounded fallback after HTTPS 404 without guessing new paths')
    let rejectedCount=0
    try{await downloadEdgePhoto(thumb,0,async()=>{rejectedCount++;return new Response('',{status:403})})}catch{/* Expected authentication failure. */}
    check(rejectedCount===1,'EDGE authorization rejection never tries alternate resolution or scheme')
    for(const body of [new Uint8Array(),new TextEncoder().encode('<html>sign in</html>'),new TextEncoder().encode('GIF89a')]){
      let count=0,invalid:unknown
      try{await downloadEdgePhoto('https://file3.autolookout.net/invalid.jpg',0,async()=>{count++;return new Response(body,{headers:{'Content-Type':'image/jpeg'}})})}catch(error){invalid=error}
      check(count===1&&invalid instanceof Error&&'photoErrorCode' in invalid&&invalid.photoErrorCode==='INVALID_IMAGE_BYTES','EDGE rejects empty/HTML/unsupported bytes despite JPEG MIME, without retrying permanent errors')
    }
    let timeoutCalls=0,timeout:unknown
    try{await downloadEdgePhoto('https://file3.autolookout.net/timeout.jpg',0,async()=>{timeoutCalls++;throw new DOMException('Synthetic timeout','TimeoutError')})}catch(error){timeout=error}
    check(timeoutCalls===3&&timeout instanceof Error&&'photoErrorCode' in timeout&&timeout.photoErrorCode==='NETWORK_OR_TIMEOUT','EDGE timeout has exactly three existing bounded attempts; original cause retained')
    let abortCalls=0;const cancelled=new AbortController();cancelled.abort();let aborted=false
    try{await downloadEdgePhoto('https://file3.autolookout.net/abort.jpg',0,async()=>{abortCalls++;return new Response(png)},undefined,cancelled.signal)}catch{aborted=true}
    check(aborted&&abortCalls===0,'EDGE cancelled transfer starts no network request')
    const gif=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),c=>c.charCodeAt(0))
    const converted=await downloadEdgePhoto('https://file3.autolookout.net/vehicle.gif',0,async()=>new Response(gif,{headers:{'Content-Type':'image/gif'}}))
    check(converted.metadata.mime==='image/png'&&converted.blob.size>0,'EDGE browser-supported GIF is decoded and converted only when necessary into lossless PNG')
    const webp=Uint8Array.from(atob(canvas.toDataURL('image/webp').split(',')[1]),c=>c.charCodeAt(0))
    const preserved=await downloadEdgePhoto('https://dxbrs3zlwqu4z.cloudfront.net/vehicle.webp',0,async()=>new Response(webp))
    check(preserved.metadata.mime==='image/webp'&&preserved.metadata.size===webp.length,'EDGE verified direct CDN origin and WebP preserve original bytes without conversion')
    let redirectMode:RequestRedirect|undefined
    await downloadPhoto('http://file3.autolookout.net/audit.jpg',0,async(_url,init)=>{redirectMode=init?.redirect;return new Response(png)})
    check(redirectMode==='error','Shared downloader retains redirect:error; verified redirect support is EDGE-only')
    load(a);let route=urlA,mounts=0,unmounts=0
    Object.defineProperty(doc,'URL',{configurable:true,get:()=>route})
    const dispose=watchEdge(doc,()=>{mounts++;return()=>{unmounts++}}),duplicate=watchEdge(doc,()=>{throw new Error('duplicate watcher')})
    check(dispose===duplicate&&mounts===1&&!!inspectEdgeSelection(doc,urlA),'EDGE watcher mounts exactly once on a verified detail page')
    const lazyImages=[...doc.querySelectorAll('.fotorama__nav__frame--thumb img')],lazySources=lazyImages.map(node=>node.getAttribute('src')!);lazyImages.forEach(node=>node.removeAttribute('src'))
    const lazyAt=performance.now(),lazyOnly=resolveSelectedPhotos(doc,{vin:gas.vin,listingId:gas.listingId},500,undefined,current=>inspectEdgePhotos(current,urlA))
    lazyImages.forEach((node,index)=>node.setAttribute('data-src',lazySources[index]))
    check((await lazyOnly).images.length===17&&performance.now()-lazyAt<800,'EDGE watcher wakes bounded photo readiness on data-src-only updates, before timeout')

    route='https://www.edgepipeline.com/';frame.contentWindow!.dispatchEvent(new Event('popstate'));await new Promise(resolve=>setTimeout(resolve,0))
    check(unmounts===1,'EDGE watcher removes launcher and preparation on informational routes')
    route=urlA;frame.contentWindow!.dispatchEvent(new Event('popstate'));await new Promise(resolve=>setTimeout(resolve,0))
    check(mounts===2,'EDGE watcher reactivates on valid SPA detail navigation')
    dispose();duplicate();check(unmounts===2,'EDGE watcher cleanup is idempotent')
  }finally{frame.remove()}
}
