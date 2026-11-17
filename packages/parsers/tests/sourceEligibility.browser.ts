import {detectWebsite} from '../../../apps/extension/src/services/website'
import {vehicleSource,vehicleDetailUrl} from '../../../apps/extension/src/services/sourceRegistry'
import {getCurrentWebsite} from '../../../apps/extension/src/services/browser'
import {parseSearchManheim,inspectSearchManheimPhotos} from '../src/searchManheim'
import {parseSiteManheim} from '../src/siteManheim'
import {parseManheim24,inspectManheim24Photos} from '../src/manheim24'
import {TransferManager} from '../../../apps/extension/src/background/transfers'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import type {ExtensionApi} from '../../../apps/extension/src/services/extensionApi'

export async function runSourceEligibilityTests(check:(v:unknown,label:string)=>void){
  const rejectsSite=(doc:Document,url:string)=>{try{parseSiteManheim(doc,url);return false}catch{return true}}
  const locations='https://site.manheim.com/en/locations.html',valid='https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE'
  const fake=new DOMParser().parseFromString('<h1>Find A Manheim Location</h1><img src="https://images.cdn.manheim.com/location-banner.jpg"><div id="fyusion-prism-viewer"><div class="svfy_viewer"><div class="svfy_tip" tip="Image 1"><img src="https://images.cdn.manheim.com/map-thumbnail.jpg"></div></div></div>','text/html')
  check(vehicleSource(locations)?.id==='ManheimSite'&&rejectsSite(fake,locations),'source eligibility: locations page is informational, not a vehicle-transfer source')
  check(detectWebsite('https://www.manheim.com/en/about.html').kind==='unsupported'&&detectWebsite('https://search.manheim.com.attacker.example').kind==='unsupported','source eligibility: nonregistered informational and lookalike Manheim hosts are not auction detail sources')
  const rejects=(fn:()=>unknown)=>{try{fn();return false}catch{return true}}
  check(rejects(()=>parseSearchManheim(fake,locations))&&rejects(()=>inspectSearchManheimPhotos(fake,valid))&&rejects(()=>inspectManheim24Photos(fake)),'source photos: banner, allowed-CDN thumbnail and fake gallery without vehicle identity cannot be extracted')
  check(!vehicleDetailUrl('https://search.manheim.com/results#/results')&&!vehicleDetailUrl('https://search.manheim.com')&&vehicleDetailUrl(valid),'source eligibility: supported search host still requires an actual VIN detail route')
  const previous=Object.getOwnPropertyDescriptor(window,'chrome');let queries=0,messages=0
  let tab={id:1,url:locations},verified=false
  Object.defineProperty(window,'chrome',{configurable:true,value:{tabs:{query:async()=>{queries++;return [tab]},sendMessage:async()=>{messages++;return {ok:true,value:{source:'ManheimSearch',vehicle:verified}}}}}})
  try{
    check((await getCurrentWebsite()).transferReady===false&&messages===1,'popup eligibility: locations page stays disabled without verified vehicle status')
    tab={id:1,url:'https://search.manheim.com/results#/results'}
    check((await getCurrentWebsite()).transferReady===false&&messages===1,'popup eligibility: search results do not query stale vehicle content')
    tab={id:1,url:valid}
    check((await getCurrentWebsite()).transferReady===false&&messages===2,'popup eligibility: a VIN-shaped URL without verified vehicle content cannot enable transfer')
    verified=true
    check((await getCurrentWebsite()).transferReady===true&&messages===3&&queries===4,'popup eligibility: matching source plus verified vehicle identity enables the supported detail page')
  }finally{if(previous)Object.defineProperty(window,'chrome',previous);else Reflect.deleteProperty(window,'chrome')}
  let pageMessages=0,tabs=0
  const api={tabs:{query:async()=>[],sendMessage:async()=>{pageMessages++;return {ok:true,vehicle:{}}},create:async()=>{tabs++;return {id:2}}},storage:{session:{get:async()=>({}),set:async()=>{},remove:async()=>{}}}} as unknown as ExtensionApi
  const manager=new TransferManager(api,{get:async()=>undefined,put:async()=>{},bytes:async()=>0,remove:async()=>{},prune:async()=>{}})
  for(const url of [locations,'https://search.manheim.com/results#/results']){
    let rejected=false;try{await manager.begin({tab:{id:1,url}})}catch{rejected=true}
    check(rejected&&pageMessages===1&&tabs===0,'background eligibility: invalid page cannot invoke extraction, navigation or photos even through a direct start message')
  }
  const html=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text(),frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  try{
    const vehicle=parseSearchManheim(doc,valid),dataNode=doc.querySelector('[data-test-id="stockwave-info"]')!,data=JSON.parse(dataNode.textContent!),original=data.images
    check(vehicle.images.length===15&&new Set(vehicle.images).size===15,'source photos: valid verified search listing keeps 15 distinct ordered vehicle photos')
    data.images=[];delete data.mainImage;dataNode.textContent=JSON.stringify(data)
    const gallery=doc.querySelector('#fyusion-prism-viewer')!,children=[...gallery.childNodes];gallery.replaceChildren()
    const banner=doc.createElement('img');banner.src='https://images.cdn.manheim.com/unrelated-banner.jpg';doc.body.append(banner)
    let emptyRejected=false;try{await resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},30,undefined,current=>inspectSearchManheimPhotos(current,valid))}catch{emptyRejected=true}
    check(emptyRejected&&inspectSearchManheimPhotos(doc,valid).images.length===0,'source photos: missing vehicle gallery never falls back to unrelated document images')
    const waiting=resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},500,undefined,current=>inspectSearchManheimPhotos(current,valid))
    gallery.append(...children)
    const ready=await waiting
    check(ready.images.length===15&&ready.images.every(url=>!url.includes('unrelated-banner')),'source photos: only delayed vehicle-gallery stage is retried; page banner remains excluded')
    data.images=original;dataNode.textContent=JSON.stringify(data)
    check(inspectSearchManheimPhotos(doc,valid).images.join('|')===vehicle.images.join('|'),'source photos: dedicated structured gallery retains original order after readiness')
  }finally{frame.remove()}
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text()
  check(parseManheim24(new DOMParser().parseFromString(legacy,'text/html')).images.length===15&&detectWebsite('https://adesa.com').kind==='auction'&&detectWebsite('https://edgepipeline.com').kind==='auction','source eligibility: Manheim24 photo extraction and ADESA/Edge Pipeline recognition unchanged')
}
