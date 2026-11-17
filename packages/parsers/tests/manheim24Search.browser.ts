import {parseManheim24,inspectManheim24Photos} from '../src/manheim24'
import {parseManheim24Search,inspectManheim24SearchPhotos} from '../src/manheim24Search'
import {vehicleSource,vehicleDetailUrl} from '../../../apps/extension/src/services/sourceRegistry'
import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {assertNormalizedVehicle} from '../src/validation'
export async function runManheim24SearchTests(check:(v:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  const url='https://search.manheim24.com/results#/details/1HGCM82633A004352/OVE'
  try{
    check(vehicleSource(url)?.id==='Manheim24Search'&&vehicleSource(url.replace('manheim24','manheim'))?.id==='ManheimSearch'&&vehicleSource('https://home.manheim24.com/landingPage')?.id==='Manheim24','Manheim24 Search: explicit distinct hostname routes independently from regular Search and working details')
    check(vehicleDetailUrl(url)&&!vehicleDetailUrl('https://search.manheim24.com/results')&&!vehicleSource('https://search.manheim24.com.attacker.example'),'Manheim24 Search: no detail transfer without VIN hash or on lookalike domains')
    const original=parseManheim24(doc),base=parseManheim24Search(doc,url);assertNormalizedVehicle(base)
    check(base.source==='Manheim24Search'&&base.mileage?.value===1048&&base.mileage.unit==='mi'&&base.mileageKm===undefined&&base.images.length===15,'Manheim24 Search: confirmed legacy component contract preserves original miles and 15 scoped photos')
    check(parseManheim24(doc).mileageKm===original.mileageKm&&parseManheim24(doc).images.join('|')===original.images.join('|'),'Manheim24 detail: original parser output and gallery remain unchanged')
    const node=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!),gallery=doc.querySelector('#fyusion-prism-viewer')!
    const counter=(n:number)=>'<div class="svfy_catbtn" data-name="All"><span class="svfy_chp">'+n+'</span></div>'
    const tips=(n:number)=>Array.from({length:n},(_,i)=>'<div class="svfy_tip" tip="Image '+(i+1)+'"><img src="https://images--cdn.manheim24.com/search-'+(i+1)+'.jpg?size=w300h210"></div>').join('')
    data.images=Array.from({length:15},(_,i)=>({sequence:i+1,largeUrl:'https://images--cdn.manheim24.com/structured-'+(i+1)+'.jpg'}));node.textContent=JSON.stringify(data);gallery.innerHTML=counter(23)
    check(inspectManheim24Photos(doc).images.length===0,'Manheim24 Search regression: empty initializing numbered gallery masks 15 valid structured photos in legacy extractor')
    check(inspectManheim24SearchPhotos(doc,url).images.length===15,'Manheim24 Search fix: complete structured originals survive an initializing empty gallery')
    data.images=[];delete data.mainImage;node.textContent=JSON.stringify(data)
    for(const count of [1,5,15,23]){
      gallery.innerHTML=counter(count)+tips(count)
      const photos=inspectManheim24SearchPhotos(doc,url)
      check(photos.galleryReady&&photos.images.length===Math.min(15,count)&&photos.availableImageCount===count&&photos.images.every((value,i)=>new URL(value).pathname==='/search-'+(i+1)+'.jpg'&&!new URL(value).searchParams.has('size')),'Manheim24 Search gallery: '+count+' ordered originals, no thumbnail size or padding')
    }
    gallery.innerHTML=counter(23)
    const pending=resolveSelectedPhotos(doc,{vin:base.vin,listingId:base.listingId},500,undefined,current=>inspectManheim24SearchPhotos(current,url));gallery.innerHTML=counter(23)+tips(23)
    check((await pending).images.length===15,'Manheim24 Search: bounded source-only gallery refresh resolves lazy images without rerunning MyAuto fields')
    data.images=[{largeUrl:'https://images--cdn.manheim24.com/structured-only.jpg'}];node.textContent=JSON.stringify(data)
    check(inspectManheim24SearchPhotos(doc,url).images.length===15,'Manheim24 Search: primary metadata cannot mask a complete 23-photo gallery')
    data.vin='2HGCM82633A004352';data.id='SEARCH24-NEXT';data.designatedDescriptionEnrichment.vin=data.vin;node.textContent=JSON.stringify(data);doc.querySelector('[data-testid="vdp-vin"]')!.textContent=data.vin
    const nextUrl=url.replace('1HGCM82633A004352',data.vin)
    check(inspectManheim24SearchPhotos(doc,nextUrl).galleryStale&&inspectManheim24SearchPhotos(doc,nextUrl).images.length===0,'Manheim24 Search: previous listing photos cannot survive a vehicle identity switch')
    gallery.innerHTML=(counter(23)+tips(23)).replaceAll('/search-','/next-search-');data.images=[];node.textContent=JSON.stringify(data)
    check(inspectManheim24SearchPhotos(doc,nextUrl).images.every(value=>value.includes('/next-search-')),'Manheim24 Search: new gallery restores only the current vehicle photos')
  }finally{frame.remove()}
}
