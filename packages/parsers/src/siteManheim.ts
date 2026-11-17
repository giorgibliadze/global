import {parseSearchManheim,inspectSearchManheimSelection,inspectSearchManheimPhotos,searchManheimRoot} from './searchManheim'
import {parseSiteLegacy,inspectSiteLegacySelection,inspectSiteLegacyPhotos} from './siteManheimLegacy'
import {extractSiteManheimGallery} from './manheimSiteGallery'
import {sanitizeDescription} from './vinPrivacy'
export const siteManheimRoot=searchManheimRoot+',.VehicleDetails__container'
function layout(doc:Document,url:string){
  let allowed=false
  try{const u=new URL(url);allowed=u.protocol==='https:'&&u.hostname==='site.manheim.com'}catch{/* Not an auction page. */}
  if(!allowed)throw new Error('ავტომობილის წყაროს მისამართი არასწორია.')
  // These are the two actual detail component contracts from supplied snapshots.
  // Never parse promotional page data or infer vehicle fields from a URL alone.
  return doc.querySelector(searchManheimRoot)?'onesearch':'legacy'
}
export function inspectSiteManheimSelection(doc:Document,url=doc.URL){
  if(layout(doc,url)==='onesearch')return inspectSearchManheimSelection(doc,url,'ManheimSite')
  const selection=inspectSiteLegacySelection(doc)
  return {...selection,key:JSON.stringify(['ManheimSite',selection.key])}
}
export function inspectSiteManheimPhotos(doc:Document,url=doc.URL){
  if(layout(doc,url)==='onesearch')return inspectSearchManheimPhotos(doc,url,'ManheimSite')
  const selected=inspectSiteManheimSelection(doc,url),photos=inspectSiteLegacyPhotos(doc),gallery=extractSiteManheimGallery(selected.root,JSON.stringify([photos.listingId,photos.vin]))
  return gallery.images.length>photos.images.length?{...photos,images:gallery.images,availableImageCount:Math.max(gallery.validCount,gallery.galleryCount??0),galleryCount:gallery.galleryCount,galleryReady:gallery.ready,galleryStale:gallery.stale}:photos
}
export function parseSiteManheim(doc:Document,url=doc.URL){
  const modern=layout(doc,url)==='onesearch'
  const vehicle=modern?parseSearchManheim(doc,url,'ManheimSite'):{...parseSiteLegacy(doc),source:'ManheimSite' as const}
  if(!modern){const photos=inspectSiteManheimPhotos(doc,url);vehicle.images=photos.galleryReady?photos.images:[];vehicle.availableImageCount=photos.availableImageCount}
  delete vehicle.price;delete vehicle.raw.buyNowPrice;delete vehicle.raw.currency
  if(vehicle.description)vehicle.description=sanitizeDescription(vehicle.description,vehicle.vin)
  if(typeof vehicle.raw.description==='string')vehicle.raw.description=sanitizeDescription(vehicle.raw.description,vehicle.vin)
  return vehicle
}
