import {parseManheim24Search,inspectManheim24SearchPhotos} from '../src/manheim24Search'
import {safePhotoUrl,deduplicatePhotos} from '../src/photoUrls'
import {assertNormalizedVehicle} from '../src/validation'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
export async function runSearch24SnapshotTests(check:(v:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/manheim24-search-snapshot.html')).text(),frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  const url='https://search.manheim24.com/results#/details/1HGCM82633A004352/OVE'
  try{
    const data=JSON.parse(doc.querySelector('[data-test-id="stockwave-info"]')!.textContent!),scroller=doc.querySelector('#fyusion-prism-viewer .svfy_scroller')!
    const slots=[...scroller.children],ordered=deduplicatePhotos(slots.map(slot=>safePhotoUrl(slot.querySelector('img[src]')?.getAttribute('src'))),Infinity)
    check(data.images.length===1&&slots.length===25&&slots.filter(slot=>slot.classList.contains('svfy_tip')).length===19&&ordered.length===25,'supplied Search24 snapshot: one structured photo, 25 ordered carousel slots, six unlabeled slots')
    const vehicle=parseManheim24Search(doc,url);assertNormalizedVehicle(vehicle)
    check(vehicle.source==='Manheim24Search'&&vehicle.make==='BMW'&&vehicle.fullModelName==='X3 Sports Activity Vehicle xDrive30i'&&vehicle.trim==='xDrive30i'&&vehicle.year===2021&&vehicle.mileage?.value===38548&&vehicle.mileage.unit==='mi'&&vehicle.mileageKm===undefined,'supplied Search24 snapshot: BMW identity/year and 38,548 original miles parsed without conversion')
    check(vehicle.engineCc===2000&&vehicle.cylinders===4&&vehicle.fuel==='Gasoline'&&vehicle.transmission==='Automatic'&&vehicle.drivetrain==='AWD'&&vehicle.body==='SUV'&&vehicle.doorCount===4&&vehicle.exteriorColor==='White'&&vehicle.interiorColor==='Black'&&vehicle.interiorMaterial==='Leather','supplied Search24 snapshot: labeled engine, fuel, drivetrain, doors, colors and material parsed')
    check(data.designatedDescriptionEnrichment.installedEquipment.every((row:{primaryDescription:string})=>vehicle.equipment?.includes(row.primaryDescription))&&!vehicle.price,'supplied Search24 snapshot: confirmed equipment retained, auction price excluded')
    const photos=inspectManheim24SearchPhotos(doc,url)
    check(photos.availableImageCount===25,'supplied Search24 regression: discovery counts gallery items rather than extra main-render frames')
    check(photos.images.length===15&&photos.images.map(value=>new URL(value).pathname.replace('/1080p/','/')).join('|')===ordered.slice(0,15).map(value=>new URL(value).pathname.replace('/1080p/','/')).join('|'),'supplied Search24 snapshot: first 15 gallery photos preserve DOM order, including unlabeled slots')
    const hero=doc.querySelector<HTMLImageElement>('#fyusion-prism-viewer .svfy_main img[src]')!,savedHero=hero.src
    hero.src=ordered[20]
    check(inspectManheim24SearchPhotos(doc,url).images.map(value=>new URL(value).pathname.replace('/1080p/','/')).join('|')===photos.images.map(value=>new URL(value).pathname.replace('/1080p/','/')).join('|'),'Search24: changing active preview cannot reorder the transferred gallery')
    hero.src=savedHero
    const saved=scroller.innerHTML;scroller.replaceChildren()
    const waiting=resolveSelectedPhotos(doc,{vin:vehicle.vin,listingId:vehicle.listingId},500,undefined,current=>inspectManheim24SearchPhotos(current,url));scroller.innerHTML=saved
    check((await waiting).images.length===15,'supplied Search24 snapshot: descriptive carousel lazy loading resolves through bounded readiness observer')
    const wrapper=doc.querySelector('[data-test-id="vehicle-details-view-container"]')!,key=wrapper.getAttribute('data-key')!
    wrapper.setAttribute('data-key','STALE-LISTING')
    let rejected=false;try{parseManheim24Search(doc,url)}catch{rejected=true}
    check(rejected,'Search24 snapshot: mismatched outer listing and scoped metadata cannot transfer stale vehicle data')
    wrapper.setAttribute('data-key',key)
  }finally{frame.remove()}
}
