import {parseManheim24} from '../src/manheim24'
import {parseSiteManheim,inspectSiteManheimPhotos} from '../src/siteManheim'
import {parseSearchManheim,inspectSearchManheimPhotos} from '../src/searchManheim'
import {PreparedVehicles} from '../../../apps/extension/src/background/preparation'
import {waitForGalleryActivity} from '../../../apps/extension/src/photos/activity'

export async function runPlatformIsolationTests(check:(v:unknown,label:string)=>void){
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),modern=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(modern);doc.close()
  const siteUrl='https://site.manheim.com/selected',searchUrl='https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE'
  try{
    const site=parseSiteManheim(doc,siteUrl),search=parseSearchManheim(doc,searchUrl),cache=new PreparedVehicles(),a=crypto.randomUUID(),b=crypto.randomUUID()
    cache.invalidate(1,a);cache.prepare(1,a,site,Date.now());cache.invalidate(2,b);cache.prepare(2,b,search,Date.now())
    check(cache.get(1,a)?.vehicle.source==='ManheimSite'&&cache.get(2,b)?.vehicle.source==='ManheimSearch','platform isolation: identical listing IDs in concurrent Site/Search tabs retain separate cache namespaces')
    cache.invalidate(1,crypto.randomUUID())
    check(!cache.get(1,a)&&cache.get(2,b)?.vehicle.source==='ManheimSearch','platform isolation: invalidating one source cannot clear another source cache')
    const dataNode=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(dataNode.textContent!)
    // Complete metadata must avoid thumbnail scans but remain identity guarded.
    const gallery=doc.querySelector('#fyusion-prism-viewer')!;gallery.remove()
    check(inspectSiteManheimPhotos(doc,siteUrl).images.length===15&&inspectSearchManheimPhotos(doc,searchUrl).images.length===15,'performance: complete structured galleries are ready without rendering thumbnails')
    dataNode.textContent='{invalid';let rejected=false;try{parseSiteManheim(doc,siteUrl)}catch{rejected=true}
    check(rejected,'platform isolation: malformed Site payload fails closed')
    const old=parseManheim24(new DOMParser().parseFromString(legacy,'text/html'))
    check(old.source==='Manheim24'&&old.images.length===15,'platform isolation: Site failure cannot corrupt independent Manheim24 parser/gallery')
    dataNode.textContent=JSON.stringify(data)
    check(parseSearchManheim(doc,searchUrl).images.length===15,'platform isolation: Search remains usable after Site failure')
    const container=doc.createElement('div');doc.body.append(container)
    const controller=new AbortController(),aborted=waitForGalleryActivity(container,controller.signal,500);controller.abort()
    let cancelled=false;try{await aborted}catch{cancelled=true}
    check(cancelled,'performance: uploader activity observer cancels without leaving a timer')
    const changed=waitForGalleryActivity(container,undefined,500);container.append(doc.createElement('img'));await changed
    const loaded=waitForGalleryActivity(container,undefined,500);container.querySelector('img')!.dispatchEvent(new Event('load'));await loaded
    check(true,'performance: uploader wakes on scoped DOM and image load events')
  }finally{frame.remove()}
}
