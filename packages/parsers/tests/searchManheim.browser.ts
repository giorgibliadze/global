import {parseSearchManheim,inspectSearchManheimPhotos,searchManheimRoute,searchManheimDescription} from '../src/searchManheim'
import {inspectSiteManheimPhotos} from '../src/siteManheim'
import {assertNormalizedVehicle} from '../src/validation'
import {detectWebsite} from '../../../apps/extension/src/services/website'
import {vehicleSource} from '../../../apps/extension/src/services/sourceRegistry'
import {VehiclePreparation} from '../../../apps/extension/src/content/preparation'
import {searchManheimAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {TransferManager} from '../../../apps/extension/src/background/transfers'
import {IndexedPhotoStore} from '../../../apps/extension/src/photos/store'
import {runMyautoTransfer} from '../../../apps/extension/src/myauto/transfer'
import type {ExtensionApi,Sender} from '../../../apps/extension/src/services/extensionApi'
import type {TransferRecord} from '@auto-importer/shared'

export async function runSearchManheimTests(check:(value:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  let url='https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE'
  const rejected=(fn:()=>unknown)=>{try{fn();return false}catch{return true}}
  try{
    check(vehicleSource(url)?.id==='ManheimSearch'&&detectWebsite(url).name==='Manheim','search source: registry and existing website detection recognize exact search host')
    check(vehicleSource('https://site.manheim.com/')?.id==='ManheimSite'&&!vehicleSource('https://search.manheim.com.attacker.example/results')&&!vehicleSource('http://search.manheim.com/'),'search source: marketing/lookalike/HTTP pages are not vehicle parser sources')
    check(vehicleSource('https://home.manheim24.com/')?.id==='Manheim24'&&detectWebsite('https://www.adesa.com').kind==='auction'&&detectWebsite('https://edgepipeline.com').kind==='auction'&&detectWebsite('https://myauto.ge/ka/add').kind==='destination','search source: existing auction/destination detection remains compatible')
    check(searchManheimRoute(url.replace('/results#','/#'))==='SALKZ9F90RA229948','search route: hash details can open from the search homepage path')
    const vehicle=parseSearchManheim(doc,url);assertNormalizedVehicle(vehicle)
    check(vehicle.vin==='SALKZ9F90RA229948'&&vehicle.listingId==='OVE.NVAA.467124903'&&vehicle.source==='ManheimSearch','search snapshot: VIN/listing identity read from confirmed root and matching structured data')
    check(vehicle.title==='2024 Land Rover Range Rover SV'&&vehicle.make==='Land Rover'&&vehicle.fullModelName==='Range Rover SV'&&vehicle.baseModel==='Range Rover'&&vehicle.trim==='SV'&&vehicle.year===2024,'search snapshot: complete original title/model preserved; independently structured trim retained')
    check(vehicle.mileage?.value===10005&&vehicle.mileage.unit==='mi'&&vehicle.mileageKm===undefined&&vehicle.raw.odometer===10005&&vehicle.raw.odometerUnits==='mi','search snapshot: 10,005 miles remain 10,005 mi without conversion')
    check(vehicle.engineCc===4400&&vehicle.cylinders===8&&vehicle.transmission==='Automatic'&&vehicle.raw.transmission==='8-Speed Automatic'&&vehicle.fuel==='Gasoline'&&vehicle.drivetrain==='AWD','search snapshot: labeled seller specifications and explicit powertrain, no model-based guesses')
    check(vehicle.raw.exteriorColor==='Santorini Black Metallic'&&vehicle.raw.interiorColor==='Ebony Semi-Aniline Leather'&&vehicle.exteriorColor==='Black'&&vehicle.interiorColor==='Black'&&vehicle.interiorMaterial==='Leather'&&vehicle.body==='SUV'&&vehicle.doorCount===4,'search snapshot: detailed original colors/material retained alongside structured form-compatible values')
    check(vehicle.steeringWheel===undefined&&vehicle.condition===undefined&&!vehicle.price&&(vehicle.equipment?.length??0)>20,'search snapshot: features available, absent steering/condition and auction price not fabricated')
    check(searchManheimDescription(vehicle,200).length<=200&&!vehicle.description?.includes(vehicle.vin)&&!String(vehicle.raw.description??'').includes(vehicle.vin),'search snapshot: concise Georgian description and seller notes exclude VIN; public autofill policy unchanged')
    const info=inspectSearchManheimPhotos(doc,url)
    check(info.images.length===15&&info.availableImageCount===98&&info.images.every((u,i)=>new URL(u).pathname.endsWith(`fixture-search-${String(i+1).padStart(3,'0')}.jpg`)),'search snapshot: 98 original photo candidates; first 15 preserve structured sequence')
    check(rejected(()=>parseSearchManheim(doc,'https://search.manheim.com'))&&rejected(()=>parseSearchManheim(doc,'https://search.manheim.com/results#/results'))&&searchManheimRoute(url)===vehicle.vin,'search source: homepage/results cannot be mistaken for a selected vehicle even with stale detail DOM')
    const dataNode=doc.querySelector('[data-test-id="stockwave-info"]')!,data=JSON.parse(dataNode.textContent!)
    data.accessToken='DO-NOT-TRANSFER';data.buyerAccountAutotecNumber='DO-NOT-TRANSFER'
    data.images.reverse();data.images.push({...data.images[0]});for(const image of data.images)image.largeUrl+='?size=w300h210'
    dataNode.textContent=JSON.stringify(data)
    const normalized=inspectSearchManheimPhotos(doc,url)
    check(normalized.images.join('|')===info.images.join('|')&&normalized.availableImageCount===98,'search photos: sequence sorting, thumbnail normalization and deduplication do not change original order')
    check(!JSON.stringify(parseSearchManheim(doc,url)).includes('DO-NOT-TRANSFER'),'search snapshot: account/session fields are never copied from embedded data')
    const keyRoot=doc.querySelector('[data-test-id="vehicle-details-view-container"]')!
    keyRoot.setAttribute('data-key','OVE.STALE.001')
    check(rejected(()=>parseSearchManheim(doc,url)),'search identity: stale embedded listing cannot override a changed root listing key')
    keyRoot.setAttribute('data-key',vehicle.listingId!)
    const savedImages=data.images;data.images=[savedImages.find((image:{sequence:number})=>image.sequence===1)];dataNode.textContent=JSON.stringify(data)
    check(inspectSearchManheimPhotos(doc,url).images.length===15,'search gallery regression: one structured photo cannot mask the complete 98-photo DOM gallery')
    data.images=[];dataNode.textContent=JSON.stringify(data)
    check(inspectSearchManheimPhotos(doc,url).images.length===15,'search photos: actual scoped Fyusion DOM supplies ordered fallback')
    const gallery=doc.querySelector('#fyusion-prism-viewer')!,savedGallery=[...gallery.childNodes];gallery.replaceChildren()
    check(parseSearchManheim(doc,url).images.length===0,'search photos: empty gallery is not a successful or stale photo list')
    const waiting=resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},500,undefined,current=>inspectSearchManheimPhotos(current,url))
    gallery.append(...savedGallery)
    check((await waiting).images.length===15,'search photos: delayed gallery is detected by bounded MutationObserver')
    // Regular-only regressions: descriptive/unlabelled carousel slots, not previews.
    const scroller=gallery.querySelector('.svfy_scroller')!,originalSlots=scroller.innerHTML
    const counter=gallery.querySelector('.svfy_catbtn[data-name="All"] span.svfy_chp')!,originalCount=counter.textContent
    data.images=[savedImages.find((image:{sequence:number})=>image.sequence===1)];dataNode.textContent=JSON.stringify(data)
    for(const count of [1,5,15,23]){
      counter.textContent=String(count)
      scroller.innerHTML=Array.from({length:count},(_,i)=>`<div${i%2?'':' class="svfy_tip" tip="Exterior"'}><img src="https://images.cdn.manheim.com/regular-photo-${i+1}.jpg?size=w300h210"></div>`).join('')
      const expected=Math.min(count,15),search=inspectSearchManheimPhotos(doc,url),site=inspectSiteManheimPhotos(doc,'https://site.manheim.com/vehicle')
      check(search.galleryReady&&search.images.length===expected&&site.images.join('|')===search.images.join('|'),`regular carousel: ${count} photos on both hosts, including unlabeled/descriptive slots`)
      check(search.images.every((u,i)=>new URL(u).pathname.endsWith(`regular-photo-${i+1}.jpg`)&&!u.includes('size=')), 'regular carousel: distinct similar CDN paths retain order and original URLs')
      check(parseSearchManheim(doc,url).images.length===expected,'regular carousel: all selected photos survive vehicle payload construction')
    }
    counter.textContent='5';scroller.innerHTML='<div><img src="https://images.cdn.manheim.com/regular-photo-1.jpg"></div>'
    check(!inspectSearchManheimPhotos(doc,url).galleryReady,'regular carousel: one initial slot cannot satisfy five-photo metadata')
    const lazy=resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},500,undefined,current=>inspectSearchManheimPhotos(current,url))
    scroller.innerHTML=Array.from({length:5},(_,i)=>`<div><img data-src="https://images.cdn.manheim.com/regular-photo-${i+1}.jpg"></div>`).join('')
    check((await lazy).images.length===5,'regular carousel: bounded observer resolves lazy data-src slots')
    scroller.append(scroller.firstElementChild!.cloneNode(true))
    check(inspectSearchManheimPhotos(doc,url).images.length===5,'regular carousel: duplicate thumbnail does not duplicate payload')
    scroller.innerHTML=originalSlots;counter.textContent=originalCount
    data.images=savedImages;dataNode.textContent=JSON.stringify(data)

    const memory:Record<string,unknown>={},store=new IndexedPhotoStore()
    let tabs=0,downloads=0,parses=0,source:VehiclePreparation
    const sender:Sender={id:'fixture-search',tab:{id:71,url},documentId:'source-search'}
    const api:ExtensionApi={runtime:{id:'fixture-search',onMessage:{addListener(){}},sendMessage:async message=>{
      try{return {ok:true,value:await manager.handle(message as Record<string,unknown>,{...sender,tab:{id:71,url}})}}catch{return {ok:false}}
    }},tabs:{query:async()=>[{id:71,url}],create:async()=>({id:++tabs+700}),sendMessage:async(_id,message)=>{
      const input=message as Record<string,unknown>
      if(input.type==='MANHEIM_VERIFY')return {ok:true,verified:source.verify(input.preparationId)}
      if(input.type==='MANHEIM_RESOLVE'){try{return {ok:true,...await source.resolve()}}catch{return {ok:false}}}
      throw new Error('Warm prepared search source must not trigger full extraction')
    }},storage:{session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async entries=>{Object.assign(memory,structuredClone(entries))},remove:async key=>{delete memory[key]}}}}
    const manager=new TransferManager(api,store,async(_url,index)=>{
      downloads++;const bytes=new Uint8Array([255,216,255,index]),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
      return {blob:new Blob([bytes],{type:'image/jpeg'}),metadata:{index,name:`fixture-${index}.jpg`,mime:'image/jpeg',size:bytes.length,sha256}}
    })
    source=new VehiclePreparation(doc,api,()=>url,{...searchManheimAdapter,parse:(doc,url)=>{parses++;return parseSearchManheim(doc,url)}})
    let a:TransferRecord,b:TransferRecord
    try{
      const prepared=await source.resolve(),count=parses
      check((await source.resolve()).preparationId===prepared.preparationId&&parses===count&&downloads===0&&tabs===0,'search prefetch: normalize once, reuse warm prepared payload, no idle network downloads')
      a=await manager.begin({...sender,tab:{id:71,url}})
      check(a.vehicle.source==='ManheimSearch'&&a.preparation?.cacheHit&&tabs===1&&a.photos.total===15,'search transfer: registry admits prepared payload and opens existing one-click MyAuto route')
      check((await manager.begin({...sender,tab:{id:71,url}})).id===a.id&&tabs===1,'search transfer: repeated clicks reuse the active transfer without duplicate tabs')
      url='https://search.manheim.com/results#/details/2HGCM82633A004352/OVE'
      check(!source.verify(prepared.preparationId),'search SPA: hash navigation invalidates cached previous listing before new DOM arrives')
      data.vin='2HGCM82633A004352';data.id='OVE.FIXTURE.002';data.make='Ford';data.models=['Ranger'];data.trims=['XLT'];data.year='2019';data.engineDisplacement='2.3L'
      data.designatedDescriptionEnrichment={vin:data.vin,make:'Ford',model:'Ranger',trim:'XLT',year:2019,manheimStandardDescription:{shortDescription:'2019 Ford Ranger XLT'},powertrain:{engine:{primaryDescription:'2.3L I4'}}}
      for(const image of data.images)image.largeUrl=image.largeUrl.replace('fixture-search-','fixture-search-B-')
      dataNode.textContent=JSON.stringify(data);const root=doc.querySelector('[data-test-id="vehicle-details-view-container"]')!
      root.setAttribute('data-vin',data.vin);root.setAttribute('data-key',data.id);doc.querySelector('[data-testid="vdp-vin"]')!.textContent=data.vin;doc.querySelector('[data-testid="vdp-title-text"]')!.textContent='2019 Ford Ranger XLT'
      const next=await source.resolve()
      check(next.vehicle.listingId===data.id&&next.vehicle.make==='Ford'&&next.preparationId!==prepared.preparationId&&next.vehicle.images.every(u=>u.includes('fixture-search-B-')),'search SPA: new listing key/VIN prepares independent current-vehicle photos/data')
      b=await manager.begin({...sender,tab:{id:71,url}})
      check(b.id!==a.id&&tabs===2&&(await manager.handle({type:'TRANSFER_STATUS',id:a.id},sender) as TransferRecord).vehicle.vin===a.vehicle.vin,'search transfer: vehicle A and B payload/cache namespaces remain isolated')
      url='https://search.manheim.com/results#/results'
      check(!source.verify(next.preparationId),'search SPA: returning to results invalidates the detail payload')
      let blocked=false
      try{await manager.begin({...sender,tab:{id:71,url}})}catch{blocked=true}
      check(blocked&&tabs===2,'search results: stale detail DOM cannot start another transfer or open MyAuto')
    }finally{source.dispose()}

    // Existing receiver, real File/DataTransfer and IndexedDB; only the remote
    // download/server completion are mocked. Never claim authenticated E2E.
    const target=document.createElement('iframe');document.body.append(target)
    const originalChrome=(globalThis as typeof globalThis & {chrome?:unknown}).chrome
    try{
      const destination=target.contentDocument!
      destination.body.innerHTML='<input name="primaryFeatures.vinCode"><input name="primaryFeatures.mileage"><span data-testid="single-select-value-primaryFeatures.mileageType">მილი</span><textarea data-testid="description-textarea"></textarea><label data-testid="toggle-checkbox-label-sale.isNegotiablePrice"><input type="checkbox" name="sale.isNegotiablePrice" data-testid="toggle-checkbox-input-sale.isNegotiablePrice"></label><input name="sale.price"><div data-testid="photo-video-container"><span data-testid="photo-video-label">ფოტო 0/15</span><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>'
      const targetSender:Sender={id:'fixture-search',tab:{id:a!.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:'destination-search-A'}
      let preparedBeforeText=false,delivered=0,submittedAfterText=false
      ;(globalThis as typeof globalThis & {chrome?:unknown}).chrome={runtime:{sendMessage:async(message:Record<string,unknown>)=>{
        if(message.type==='PHOTO_PREPARE'&&!destination.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!.value)preparedBeforeText=true
        try{return {ok:true,value:await manager.handle(message,targetSender)}}catch{return {ok:false}}
      }}}
      const input=destination.querySelector<HTMLInputElement>('input[type="file"]')!,cards=destination.querySelector('[data-testid="photo-video-gallery"]')!,label=destination.querySelector('[data-testid="photo-video-label"]')!
      input.addEventListener('change',()=>{
        submittedAfterText=destination.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!.value===a!.vehicle.vin&&!!destination.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value
        delivered=input.files!.length
        for(let i=0;i<delivered;i++){
          const card=destination.createElement('div');card.dataset.testid=`photo-video-item-search-${i}`
          const image=destination.createElement('img');image.dataset.testid=`photo-video-image-search-${i}`
          Object.defineProperties(image,{currentSrc:{value:`https://static.tnet.ge/fixture/search-${i}.jpg`},complete:{value:true},naturalWidth:{value:640}})
          card.append(image);cards.append(card)
        }
        label.textContent=`ფოტო ${delivered}/15`
      })
      const claim=await manager.handle({type:'TRANSFER_CLAIM',protocol:1},targetSender) as TransferRecord
      const result=await runMyautoTransfer(destination,claim,()=>{},{pageUrl:()=>targetSender.tab!.url!,dropdownTimeoutMs:1,uploadTimeoutMs:1000})
      check(submittedAfterText,'search receiver: photo submission follows text autofill')
      check(preparedBeforeText,'search receiver: photo preparation starts concurrently with text without blocking it')
      check(downloads===15&&delivered===15&&result.photos.uploaded===15,'search mocked workflow: URLs 15, downloads 15, actual Files 15, simulated gallery confirmations 15')
      check(destination.querySelector<HTMLTextAreaElement>('textarea')!.value===''&&destination.querySelector<HTMLInputElement>('[name="sale.price"]')!.value===''&&destination.querySelector<HTMLInputElement>('[name="sale.isNegotiablePrice"]')!.checked,'search receiver: description skipping and negotiable price preserved; no auction price copied')
      check(result.fields.some(field=>field.key==='model'&&field.status!=='filled'),'search receiver: missing exact model control remains manual without blocking photos')
    }finally{(globalThis as typeof globalThis & {chrome?:unknown}).chrome=originalChrome;target.remove()}
  }finally{frame.remove()}
}
