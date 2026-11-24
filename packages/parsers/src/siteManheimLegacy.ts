import {specificationCylinders,specificationOdometer,specificationEngine,specificationBody,specificationTransmission,specificationMaterial,specificationFuel} from './specNumbers'
import {sourceMileage} from './mileage'
// Site legacy detail contract from supplied snapshot; independent of Manheim24.
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
export {milesToKm,engineToCc} from './units'

export {safePhotoUrl,deduplicatePhotos} from './photoUrls'
import {deduplicatePhotos} from './photoUrls'
import {createFyusionGalleryExtractor} from './fyusion'
const extractFyusionGallery=createFyusionGalleryExtractor()

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

function selectedSiteLegacy(doc: Document) {
  const roots = [...doc.querySelectorAll('.VehicleDetails__container')].filter(el => visible(el) && [...el.querySelectorAll('[data-testid="vdp-title-text"]')].some(visible))
  if (roots.length !== 1) throw new Error('გახსენით მხოლოდ ერთი ავტომობილის დეტალური გვერდი და ხელახლა სცადეთ.')
  const root = roots[0]
  const title = text(root, 'vdp-title-text')
  const vin = text(root, 'vdp-vin').replace(/\s/g, '').toUpperCase()
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error('არჩეული ავტომობილის სრული VIN ვერ მოიძებნა.')
  const records = root.querySelectorAll('.StockWaveInfo.stockwave-vehicle-info')
  if (records.length !== 1) throw new Error('სტრუქტურირებული საიდენტიფიკაციო მონაცემები ვერ მოიძებნა. გადატანა შეჩერებულია.')
  let data: Record<string, unknown> = {}
  if (records.length === 1) {
    try {
      const parsed: unknown = JSON.parse(records[0].textContent ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
    } catch { /* Fall back to the confirmed detail attributes, never other page scripts. */ }
  }
  const identity = extractOriginalIdentity(data,title,vin)
  return {root,title,vin,data,identity}
}
// Same validated selected-detail evidence as the parser, without specifications,
// photos or description generation. Identity keys stay internal and are never logged.
export function inspectSiteLegacySelection(doc:Document):{key:string;root:Element} {
  const {root,title,vin,data,identity}=selectedSiteLegacy(doc)
  return {root,key:JSON.stringify([string(data.id),vin,title,identity.original.manufacturer,identity.original.fullModelName])}
}
function selectedPhotos(root:Element,data:Record<string,unknown>){
  const fyusion=extractFyusionGallery(root,JSON.stringify([data.id,data.vin]))
  if(fyusion.present)return {...fyusion,availableImageCount:fyusion.galleryCount??fyusion.validCount}
  const gallery=[...root.querySelectorAll('#fyusion-prism-viewer img[src]')].filter(img=>!img.classList.contains('svfy_thumb')&&visible(img.closest('#fyusion-prism-viewer')!)).map(img=>img.getAttribute('src'))
  const records=Array.isArray(data.images)?data.images:[]
  const urls=records.map(value=>value && typeof value==='object'?(value as Record<string,unknown>).largeUrl:undefined)
  // mainImage.largeUrl is independently present in the supplied StockWaveInfo.
  const main=data.mainImage && typeof data.mainImage==='object'?(data.mainImage as Record<string,unknown>).largeUrl:undefined
  const images=deduplicatePhotos([...gallery,...urls,main],Infinity).filter(url=>{
    const u=new URL(url)
    return u.hostname!=='i.fyuse.com'||typeof data.fyuseUid!=='string'||u.pathname.split('/').includes(data.fyuseUid)
  })
  return {images,availableImageCount:images.length,present:false,ready:true,stale:false,galleryCount:undefined}
}
export function inspectSiteLegacyPhotos(doc:Document){
  const {root,data,vin}=selectedSiteLegacy(doc)
  const photos=selectedPhotos(root,data)
  return {vin,listingId:string(data.id),images:photos.images.slice(0,15),availableImageCount:photos.availableImageCount,galleryCount:photos.galleryCount,galleryReady:photos.ready,galleryStale:photos.stale}
}
export function parseSiteLegacy(doc: Document): NormalizedVehicle {
  const {root,title,vin,data,identity}=selectedSiteLegacy(doc)
  const warnings: string[] = [...identity.warnings]
  const raw: Record<string, string | number | boolean | string[]> = { title, vin }
  // Explicit allowlist: never copy account/contact data, script state, cookies, or tokens.
  for (const key of ['doorCount', 'doors', 'make', 'year', 'sourceTrim', 'odometer', 'odometerUnits', 'engineDisplacement', 'engineType', 'engineFuelType', 'transmission', 'driveTrain', 'exteriorColor', 'interiorColor', 'interiorType', 'bodyStyle', 'conditionType', 'conditionGrade', 'buyNowPrice', 'currency']) {
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
  const price = positive(data.buyNowPrice)
  const currency = string(data.currency)
  const list = (value: unknown) => Array.isArray(value) ? value.map(string).filter((s): s is string => !!s).slice(0, 500) : []
  const equipment = [...new Set([...list(data.equipment), ...list(data.options), ...list(data.packageOptions), ...[...root.querySelectorAll('.standard-equipment li.cr-component-options')].map(el => string(el.textContent)).filter((s): s is string => !!s)])].slice(0, 500)
  const announcements = Array.isArray(data.announcementsBySource) ? data.announcementsBySource.map(item => item && typeof item === 'object' ? string((item as Record<string, unknown>).text) : undefined).filter((s): s is string => !!s).slice(0, 30) : list(data.announcements)
  const description = string(data.comments) ?? string(data.remarks)
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
    source: 'ManheimSite', original: identity.original, listingId: string(data.id), title, vin,
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
    price: price !== undefined && currency && /^[A-Z]{3}$/.test(currency) ? { amount: price, currency, kind: 'buyNow' } : undefined,
    description, equipment, optionalEquipmentSummary, announcements, damage, auction, availableImageCount: photoSelection.availableImageCount,
    images: allImages.slice(0, 15), raw, warnings,
  }
  return vehicle
}

export { MODEL_TRIM_WARNING } from './identity'
