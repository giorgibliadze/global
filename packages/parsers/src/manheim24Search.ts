import {specificationCylinders,specificationOdometer,specificationEngine,specificationBody,specificationTransmission,specificationMaterial,specificationFuel} from './specNumbers'
import {extractSearch24Carousel} from './manheim24SearchGallery'
import {sanitizeDescription} from './vinPrivacy'
// Manheim24 Search: independent existing Manheim24 component contract.
// No regular-Manheim parser or layout fallback is used.
import {manheim24SearchRouteVin} from '@auto-importer/shared'
import {sourceMileage} from './mileage'
import {explicitSteering,sourceDoorCount} from './mandatorySpecifications'
import { extractOriginalIdentity } from './identity'
import type { NormalizedVehicle } from '@auto-importer/shared'

const text = (root: ParentNode, id: string) => {
  const elements = [...root.querySelectorAll(`[data-testid="${id}"]`)].filter(visible)
  if (elements.length > 1) throw new Error('არჩეული ავტომობილის ველები ჯერ ახლდება ან დუბლირებულია. ხელახლა სცადეთ.')
  return elements[0]?.textContent?.replace(/\s+/g, ' ').replace(/^•\s*/, '').trim() ?? ''
}
const string = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : undefined
const positive = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined

export {safePhotoUrl,deduplicatePhotos} from './photoUrls'
import {deduplicatePhotos} from './photoUrls'
import {createFyusionGalleryExtractor} from './fyusion'
import {photoIdentity} from './photoUrls'
const extractFyusionGallery=createFyusionGalleryExtractor()
const owners=new WeakMap<Document,{key:string;photos:Set<string>;forbidden:Set<string>}>()
const portals=new WeakMap<Document,{key:string;node:Element}>()
const vehiclePhotos=(values:unknown[])=>deduplicatePhotos(values,Infinity).filter(url=>!/(?:^|[\/_.-])(?:placeholders?|icons?|logos?|loading|spinner|no[-_]?image|no[-_]?photo)(?:[\/_.-]|$)/i.test(new URL(url).pathname))

function visible(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:!important)?(?:;|$)/i.test(current.getAttribute('style') ?? '')) return false
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false
    const style = current.ownerDocument.defaultView?.getComputedStyle(current)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
    current = current.parentElement
  }
  return true
}

function selectedManheim24Search(doc: Document,url:string) {
  const expected=manheim24SearchRouteVin(url)
  if(!expected)throw new Error('გახსენით ავტომობილის დეტალები Manheim24 Search-ზე.')
  const roots = [...doc.querySelectorAll('.VehicleDetails__container')].filter(el => visible(el) && [...el.querySelectorAll('[data-testid="vdp-title-text"]')].some(visible))
  if (roots.length !== 1) throw new Error('გახსენით მხოლოდ ერთი ავტომობილის დეტალური გვერდი და ხელახლა სცადეთ.')
  const root = roots[0]
  const title = text(root, 'vdp-title-text')
  const vin = text(root, 'vdp-vin').replace(/\s/g, '').toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error('არჩეული ავტომობილის სრული VIN ვერ მოიძებნა.')
  if(vin!==expected)throw new Error('არჩეული ავტომობილის VIN მარშრუტს არ ემთხვევა.')
  const records = root.querySelectorAll('.StockWaveInfo.stockwave-vehicle-info')
  if (records.length !== 1) throw new Error('სტრუქტურირებული საიდენტიფიკაციო მონაცემები ვერ მოიძებნა. გადატანა შეჩერებულია.')
  let data: Record<string, unknown> = {}
  if (records.length === 1) {
    try {
      const parsed: unknown = JSON.parse(records[0].textContent ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
    } catch { /* Fall back to the confirmed detail attributes, never other page scripts. */ }
  }
  const outer=root.closest('[data-test-id="vehicle-details-view-container"]')
  if(outer&&(outer.getAttribute('data-vin')!==vin||outer.getAttribute('data-key')!==string(data.id)))throw new Error('Manheim24 Search-ის ავტომობილის მონაცემები ჯერ ახლდება.')
  const identity = extractOriginalIdentity(data,title,vin)
  return {root,title,vin,data,identity}
}
// Same validated selected-detail evidence as the parser, without specifications,
// photos or description generation. Identity keys stay internal and are never logged.
export function inspectManheim24SearchSelection(doc:Document,url=doc.URL):{key:string;root:Element} {
  const {root,title,vin,data,identity}=selectedManheim24Search(doc,url)
  return {root,key:JSON.stringify(['Manheim24Search',string(data.id),vin,title,identity.original.manufacturer,identity.original.fullModelName])}
}
function selectedPhotos(root:Element,data:Record<string,unknown>){
  const key=JSON.stringify(['Manheim24Search',data.id,data.vin])
  const nodes=[...root.querySelectorAll('#fyusion-prism-viewer,.svfy_viewer')].filter(node=>!node.closest('#fyusion-prism-viewer-skeleton,.svfy_viewer--skeleton'))
  const outer=nodes.filter(node=>!nodes.some(other=>other!==node&&other.contains(node)))
  if(outer.length===1)portals.set(root.ownerDocument,{key,node:outer[0]})
  const portal=portals.get(root.ownerDocument),scope=outer.length===0&&portal?.key===key&&portal.node.isConnected?portal.node:root
  const fyusion=extractFyusionGallery(scope,key,{includeHidden:true})
  const carousel=extractSearch24Carousel(scope,data.fyuseUid)
  const records=Array.isArray(data.images)?data.images.filter((row):row is Record<string,unknown>=>!!row&&typeof row==='object'):[]
  const ordered=records.every(row=>typeof row.sequence==='number'&&Number.isInteger(row.sequence)&&row.sequence>0)?[...records].sort((a,b)=>Number(a.sequence)-Number(b.sequence)):records
  const structured=vehiclePhotos(ordered.map(row=>row.largeUrl??row.smallUrl))
  const gallery=vehiclePhotos([...scope.querySelectorAll('#fyusion-prism-viewer img[src]')].filter(image=>!image.classList.contains('svfy_thumb')).map(image=>image.getAttribute('src'))).filter(url=>new URL(url).hostname!=='i.fyuse.com'||typeof data.fyuseUid!=='string'||new URL(url).pathname.split('/').includes(data.fyuseUid))
  const candidates=carousel.present?carousel.images:fyusion.present?fyusion.images:gallery
  const selected=candidates.length>structured.length?candidates:structured
  const main=vehiclePhotos([data.mainImage&&typeof data.mainImage==='object'?(data.mainImage as Record<string,unknown>).largeUrl:undefined])
  const images=selected.length?selected:main
  const old=owners.get(root.ownerDocument),forbidden=old?.key===key?old.forbidden:old?.photos??new Set<string>()
  const stale=images.some(url=>forbidden.has(photoIdentity(url)))
  if(images.length&&!stale)owners.set(root.ownerDocument,{key,photos:new Set([...structured,...gallery,...fyusion.images,...main].map(photoIdentity).filter(identity=>!forbidden.has(identity))),forbidden})
  const availableImageCount=Math.max(images.length,carousel.count??fyusion.galleryCount??0)
  const galleryCount=carousel.count??fyusion.galleryCount
  const complete=images.length>=15||galleryCount!==undefined&&galleryCount>0&&images.length>=galleryCount
  const ready=!stale&&images.length>0&&complete&&(!(candidates.length>structured.length&&(carousel.present||fyusion.present))||(carousel.present?carousel.ready:fyusion.ready))
  return {images:stale?[]:images,availableImageCount,present:fyusion.present,ready,stale,galleryCount}
}
export function inspectManheim24SearchPhotos(doc:Document,url=doc.URL){
  const {root,data,vin}=selectedManheim24Search(doc,url)
  const photos=selectedPhotos(root,data)
  return {vin,listingId:string(data.id),images:photos.images.slice(0,15),availableImageCount:photos.availableImageCount,galleryCount:photos.galleryCount,galleryReady:photos.ready,galleryStale:photos.stale}
}
export function parseManheim24Search(doc: Document,url=doc.URL): NormalizedVehicle {
  const {root,title,vin,data,identity}=selectedManheim24Search(doc,url)
  const warnings: string[] = [...identity.warnings]
  const raw: Record<string, string | number | boolean | string[]> = { title, vin }
  // Explicit allowlist: never copy account/contact data, script state, cookies, or tokens.
  for (const key of ['doorCount', 'doors', 'make', 'year', 'sourceTrim', 'odometer', 'odometerUnits', 'engineDisplacement', 'engineType', 'engineFuelType', 'transmission', 'driveTrain', 'exteriorColor', 'interiorColor', 'interiorType', 'bodyStyle', 'conditionType', 'conditionGrade']) {
    const v = data[key]
    if (typeof v === 'number' && Number.isFinite(v)) raw[key] = v
    else if (typeof v === 'string' && v.length <= 500) raw[key] = v
  }
  const mileageText = text(root, 'vdp-decription-info')
  raw.mileageDisplay = mileageText
  const mileageDisplay = specificationOdometer(mileageText),structuredMileage=specificationOdometer(data.odometer)
  const structuredOdo = structuredMileage?.value
  const displayedOdo = mileageDisplay?.value
  const odo = structuredOdo ?? displayedOdo
  const unit = string(data.odometerUnits) || structuredMileage?.unit || mileageDisplay?.unit
  if (structuredOdo !== undefined && displayedOdo !== undefined && structuredOdo !== displayedOdo) throw new Error('გარბენის მონაცემები ახლდება. ხელახლა სცადეთ.')
  const mileage=sourceMileage(odo,unit,mileageDisplay?.unit?`${mileageDisplay.value} ${mileageDisplay.unit}`:undefined)
  if(odo!==undefined&&!mileage)warnings.push('გარბენის ერთეული უცნობია; გადაამოწმეთ წყარო.')
  const displacement = string(data.engineDisplacement) ?? text(root, 'card-view-engine-displacement')
  const engineType = string(data.engineType) ?? text(root, 'card-view-engine-type')
  if (displacement) raw.engineDisplacement = displacement
  if (engineType) raw.engineType = engineType
  const cylinders = specificationCylinders(string(data.engineFuelType) ?? text(root,'card-view-engine-fuel-type'),title,engineType)
  const year = identity.year
  raw.model = identity.original.model
  if(identity.original.catalogModel)raw.catalogModel = identity.original.catalogModel
  raw.fullModelName=identity.original.model
  if(identity.original.baseModel)raw.baseModel=identity.original.baseModel
  if (identity.shortDescription) raw.structuredShortDescription = identity.shortDescription
  if (Array.isArray(data.models)) raw.models = data.models.filter((s): s is string => typeof s === 'string' && s.length <= 500)
  if (identity.original.trim) raw.trim = identity.original.trim
  const sellerTitle = text(root, 'seller-provided-title')
  if (sellerTitle) raw.sellerTitle = sellerTitle
  warnings.push('კომპლექტაცია და მდგომარეობა გადაამოწმეთ ორიგინალ განცხადებასთან; მდგომარეობის შეფასება დაზიანების არქონას არ ადასტურებს.')
  const list = (value: unknown) => Array.isArray(value) ? value.map(string).filter((s): s is string => !!s).slice(0, 500) : []
  const enrichment=data.designatedDescriptionEnrichment&&typeof data.designatedDescriptionEnrichment==='object'?(data.designatedDescriptionEnrichment as Record<string,unknown>):{}
  const decoded=Array.isArray(enrichment.installedEquipment)?enrichment.installedEquipment.flatMap(row=>{const value=row&&typeof row==='object'?string((row as Record<string,unknown>).primaryDescription):undefined;return value?[value]:[]}):[]
  const equipment = [...new Set([...list(data.equipment), ...list(data.options), ...list(data.packageOptions),...decoded, ...[...root.querySelectorAll('.standard-equipment li.cr-component-options')].map(el => string(el.textContent)).filter((s): s is string => !!s)])].slice(0, 500)
  const announcements = Array.isArray(data.announcementsBySource) ? data.announcementsBySource.map(item => item && typeof item === 'object' ? string((item as Record<string, unknown>).text) : undefined).filter((s): s is string => !!s).slice(0, 30) : list(data.announcements)
  const originalDescription=string(data.comments)??string(data.remarks)
  const description=originalDescription?sanitizeDescription(originalDescription,vin):undefined
  const optionalEquipmentSummary = string(root.querySelector('#optional-package-and-equipment-section')?.textContent?.replace(/\s+/g, ' '))
  const damage = { frameDamageReported: typeof data.hasFrameDamage === 'boolean' ? data.hasFrameDamage : undefined, salvageReported: typeof data.salvageVehicle === 'boolean' ? data.salvageVehicle : undefined }
  const auction = { name: string(data.auctionName), startsAt: string(data.auctionStartTime), endsAt: string(data.auctionEndTime), status: string(data.sourceStatus) }
  if (equipment.length) raw.equipment = equipment
  if (announcements.length) raw.announcements = announcements
  if (description) raw.description = description
  if (optionalEquipmentSummary) raw.optionalEquipmentSummary = optionalEquipmentSummary
  for (const [key, value] of Object.entries({ ...damage, ...auction })) if (value !== undefined) raw[key] = value
  const photoSelection = selectedPhotos(root,data)
  const allImages=photoSelection.ready?photoSelection.images:[]
  const vehicle: NormalizedVehicle = {
    location:{physicalCountry:string(data.pickupLocationCountry),physicalCity:string(data.pickupLocationCity),physicalVerified:!!string(data.pickupLocationCountry),auctionCountry:string(data.auctionCountry),atAuction:typeof data.atAuction==='boolean'?data.atAuction:undefined},
    source: 'Manheim24Search', original: identity.original, listingId: string(data.id), title, vin,
    make: identity.original.manufacturer, model: identity.original.model, fullModelName:identity.original.fullModelName,baseModel:identity.original.baseModel,bodyStyle:string(data.bodyStyle),year,
    trim: identity.original.trim, mileage,
    engineCc: specificationEngine(displacement,string(data.engineFuelType) ?? text(root,'card-view-engine-fuel-type')) ?? specificationEngine(engineType,string(data.engineFuelType) ?? text(root,'card-view-engine-fuel-type')), cylinders,
    fuel: specificationFuel(string(data.engineFuelType) ?? (text(root, 'card-view-engine-fuel-type') || undefined)),
    steeringWheel:explicitSteering(equipment),doorCount:sourceDoorCount(data.doorCount,data.doors),
    transmission: specificationTransmission(string(data.transmission) ?? (text(root, 'card-view-engine-transmission') || undefined)),
    drivetrain: string(data.driveTrain) ?? (text(root, 'card-view-drive-train') || undefined),
    exteriorColor: string(data.exteriorColor), interiorColor: string(data.interiorColor),
    interiorMaterial: specificationMaterial(string(data.interiorType)), body: specificationBody(string(data.bodyStyle)),
    condition: string(data.conditionType), conditionGrade: positive(data.conditionGradeNumeric),
    description, equipment, optionalEquipmentSummary, announcements, damage, auction, availableImageCount: photoSelection.availableImageCount,
    images: photoSelection.ready?allImages.slice(0,15):[], raw, warnings,
  }
  return vehicle
}

export { MODEL_TRIM_WARNING } from './identity'
