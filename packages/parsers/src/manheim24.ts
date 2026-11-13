import { extractOriginalIdentity } from './identity'
import type { NormalizedVehicle } from '@auto-importer/shared'

const text = (root: ParentNode, id: string) => {
  const elements = [...root.querySelectorAll(`[data-testid="${id}"]`)].filter(visible)
  if (elements.length > 1) throw new Error('არჩეული ავტომობილის ველები ჯერ ახლდება ან დუბლირებულია. ხელახლა სცადეთ.')
  return elements[0]?.textContent?.replace(/\s+/g, ' ').replace(/^•\s*/, '').trim() ?? ''
}
const string = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : undefined
const positive = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
export const milesToKm = (miles: number) => miles * 1.609344
export function engineToCc(value: string): number | undefined {
  const m = value.match(/^\s*(\d+(?:\.\d+)?)\s*(L|liters?|litres?|cc|cm3|cm³)\s*$/i)
  return m ? Math.round(Number(m[1]) * (/^l/i.test(m[2]) ? 1000 : 1)) : undefined
}

export function safePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) return
    if (!['i.fyuse.com', 'images.cdn.manheim.com'].includes(u.hostname)) return
    if (!/\.(jpe?g|png|webp)$/i.test(u.pathname) || /\/(tags|icons|logos)\//i.test(u.pathname)) return
    // Never persist/transmit signed URLs, authentication parameters, or arbitrary query data.
    if ([...u.searchParams.keys()].some(k => !['w', 'h', 'width', 'height', 'quality', 'format'].includes(k))) return
    return u.href
  } catch { return }
}
export function deduplicatePhotos(values: unknown[], limit = 15): string[] {
  const found = new Map<string, { url: string; rank: number }>()
  for (const value of values) {
    const url = safePhotoUrl(value)
    if (!url) continue
    const u = new URL(url)
    const key = u.hostname + u.pathname.replace(/\/(?:1080p|720p|480p)\//, '/')
    const rank = /\/1080p\//.test(u.pathname) ? 3 : /\/720p\//.test(u.pathname) ? 2 : 1
    if (!found.has(key) || found.get(key)!.rank < rank) found.set(key, { url, rank })
  }
  return [...found.values()].slice(0, limit).map(v => v.url)
}

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

function selectedManheim24(doc: Document) {
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
export function inspectManheim24Selection(doc:Document):{key:string;root:Element} {
  const {root,title,vin,data,identity}=selectedManheim24(doc)
  return {root,key:JSON.stringify([string(data.id),vin,title,identity.original.manufacturer,identity.original.fullModelName])}
}
export function parseManheim24(doc: Document): NormalizedVehicle {
  const {root,title,vin,data,identity}=selectedManheim24(doc)
  const warnings: string[] = [...identity.warnings]
  const raw: Record<string, string | number | boolean | string[]> = { title, vin }
  // Explicit allowlist: never copy account/contact data, script state, cookies, or tokens.
  for (const key of ['make', 'year', 'sourceTrim', 'odometer', 'odometerUnits', 'engineDisplacement', 'engineType', 'engineFuelType', 'transmission', 'driveTrain', 'exteriorColor', 'interiorColor', 'interiorType', 'bodyStyle', 'conditionType', 'conditionGrade', 'buyNowPrice', 'currency']) {
    const v = data[key]
    if (typeof v === 'number' && Number.isFinite(v)) raw[key] = v
    else if (typeof v === 'string' && v.length <= 500) raw[key] = v
  }
  const mileageText = text(root, 'vdp-decription-info')
  raw.mileageDisplay = mileageText
  const mileageMatch = mileageText.match(/(?:^|[\s•])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(mi(?:les)?|km)\b/i)
  const structuredOdo = positive(data.odometer)
  const displayedOdo = mileageMatch ? Number(mileageMatch[1].replace(/,/g, '')) : undefined
  const odo = structuredOdo ?? displayedOdo
  const unit = string(data.odometerUnits) || mileageMatch?.[2]
  if (structuredOdo !== undefined && displayedOdo !== undefined && structuredOdo !== displayedOdo) throw new Error('გარბენის მონაცემები ახლდება. ხელახლა სცადეთ.')
  let mileageKm: number | undefined
  if (odo !== undefined && unit) {
    if (/^(mi|miles?)$/i.test(unit)) mileageKm = milesToKm(odo)
    else if (/^(km|kilometers?|kilometres?)$/i.test(unit)) mileageKm = odo
  }
  if (odo !== undefined && mileageKm === undefined) warnings.push('გარბენის ერთეული უცნობია; კილომეტრებში გადაყვანა ვერ მოხერხდა.')
  const displacement = string(data.engineDisplacement) ?? text(root, 'card-view-engine-displacement')
  const engineType = string(data.engineType) ?? text(root, 'card-view-engine-type')
  if (displacement) raw.engineDisplacement = displacement
  if (engineType) raw.engineType = engineType
  const cylinders = engineType.match(/\b(\d+)\s*cyl(?:inder)?s?\b/i)
  const year = identity.year
  raw.model = identity.original.model
  if(identity.original.catalogModel)raw.catalogModel = identity.original.catalogModel
  raw.fullModelName=identity.original.model
  if(identity.original.baseModel)raw.baseModel=identity.original.baseModel
  if (identity.shortDescription) raw.structuredShortDescription = identity.shortDescription
  if (Array.isArray(data.models)) raw.models = data.models.filter((s): s is string => typeof s === 'string' && s.length <= 500)
  if (identity.original.trim) raw.trim = identity.original.trim
  const gallery = [...root.querySelectorAll('#fyusion-prism-viewer img[src]')].filter(img => !img.classList.contains('svfy_thumb')).map(img => img.getAttribute('src'))
  const imageRecords = Array.isArray(data.images) ? data.images : []
  const urls = imageRecords.map(v => v && typeof v === 'object' ? (v as Record<string, unknown>).largeUrl : undefined)
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
  const allImages = deduplicatePhotos([...gallery, ...urls], Infinity)
  const vehicle: NormalizedVehicle = {
    source: 'Manheim24', original: identity.original, listingId: string(data.id), title, vin,
    make: identity.original.manufacturer, model: identity.original.model, fullModelName:identity.original.fullModelName,baseModel:identity.original.baseModel,bodyStyle:string(data.bodyStyle),year,
    trim: identity.original.trim, mileageKm,
    engineCc: engineToCc(displacement), cylinders: cylinders ? Number(cylinders[1]) : undefined,
    fuel: string(data.engineFuelType) ?? (text(root, 'card-view-engine-fuel-type') || undefined),
    transmission: string(data.transmission) ?? (text(root, 'card-view-engine-transmission') || undefined),
    drivetrain: string(data.driveTrain) ?? (text(root, 'card-view-drive-train') || undefined),
    exteriorColor: string(data.exteriorColor), interiorColor: string(data.interiorColor),
    interiorMaterial: string(data.interiorType), body: string(data.bodyStyle),
    condition: string(data.conditionType), conditionGrade: positive(data.conditionGradeNumeric),
    price: price !== undefined && currency && /^[A-Z]{3}$/.test(currency) ? { amount: price, currency, kind: 'buyNow' } : undefined,
    description, equipment, optionalEquipmentSummary, announcements, damage, auction, availableImageCount: allImages.length,
    images: allImages.slice(0, 15), raw, warnings,
  }
  return vehicle
}

export { MODEL_TRIM_WARNING } from './identity'
