import type { NormalizedVehicle } from '@auto-importer/shared'
import { safePhotoUrl } from './manheim24'
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, size = 500) => typeof value === 'string' && value.length <= size && !/(?:Bearer\s+[a-z0-9._-]{20,}|eyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{20,})/i.test(value)
const rawKeys = new Set(['fullModelName','baseModel','title','vin','model','catalogModel','models','structuredShortDescription','trim','make','year','sourceTrim','odometer','odometerUnits','engineDisplacement','engineType','engineFuelType','transmission','driveTrain','exteriorColor','interiorColor','interiorType','bodyStyle','conditionType','conditionGrade','buyNowPrice','currency','mileageDisplay','sellerTitle','equipment','announcements','description','frameDamageReported','salvageReported','optionalEquipmentSummary','name','startsAt','endsAt','status'])
export function assertNormalizedVehicle(value: unknown): asserts value is NormalizedVehicle {
  const fail = () => { throw new Error('ავტომობილის მონაცემების ფორმატი ან უსაფრთხოების შემოწმება ვერ დადასტურდა. ახალი ჩანართი არ გაიხსნება.') }
  if (!plain(value) || value.source !== 'Manheim24' || !text(value.title) || typeof value.vin !== 'string' || !/^[A-HJ-NPR-Z0-9]{17}$/.test(value.vin)) return fail()
  if (!plain(value.original) || Object.keys(value.original).some(k=>!['manufacturer','model','fullModelName','baseModel','trim','catalogModel','evidence'].includes(k)) || !text(value.original.manufacturer) || !value.original.manufacturer || !text(value.original.model) || !value.original.model || (value.original.catalogModel!==undefined && !text(value.original.catalogModel)) || !['structured-model','structured-standard-description','selected-title'].includes(String(value.original.evidence)) || value.make !== value.original.manufacturer || value.model !== value.original.model || (value.trim ?? null) !== (value.original.trim ?? null)) return fail()
  if(value.fullModelName!==undefined && (!text(value.fullModelName) || !value.fullModelName || value.fullModelName!==value.model || value.original.fullModelName!==value.fullModelName))return fail()
  for(const key of ['fullModelName','baseModel'])if(value.original[key]!==undefined && !text(value.original[key]))return fail()
  if(value.original.trim!==undefined && value.original.trim!==null && !text(value.original.trim))return fail()
  if (!Array.isArray(value.images) || value.images.length > 15 || !value.images.every(url => typeof url === 'string' && safePhotoUrl(url) === url)) return fail()
  for (const key of ['listingId','fullModelName','baseModel','bodyStyle','make','model','fuel','transmission','drivetrain','exteriorColor','interiorColor','interiorMaterial','body','condition','optionalEquipmentSummary']) if (value[key] !== undefined && !text(value[key])) return fail()
  if(value.trim!==undefined && value.trim!==null && !text(value.trim))return fail()
  for (const key of ['year','mileageKm','engineCc','cylinders','conditionGrade','availableImageCount']) {
    const n = value[key]
    if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return fail()
  }
  if (value.description !== undefined && !text(value.description,12000)) return fail()
  for (const key of ['equipment','announcements','warnings']) if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length > 500 || !value[key].every(v => text(v)))) return fail()
  if (!plain(value.raw) || Object.keys(value.raw).length > 80) return fail()
  for (const [key,v] of Object.entries(value.raw)) {
    if (!rawKeys.has(key)) return fail()
    if (typeof v === 'string' && !text(v,key === 'description' ? 12000 : 500)) return fail()
    if (typeof v === 'number' && !Number.isFinite(v)) return fail()
    if (Array.isArray(v)) { if (v.length > 500 || !v.every(item => text(item))) return fail() }
    else if (!['string','number','boolean'].includes(typeof v)) return fail()
  }
  if (value.damage !== undefined && (!plain(value.damage) || Object.entries(value.damage).some(([key,v]) => !['frameDamageReported','salvageReported'].includes(key) || (v !== undefined && typeof v !== 'boolean')))) return fail()
  if (value.auction !== undefined && (!plain(value.auction) || Object.entries(value.auction).some(([key,v]) => !['name','startsAt','endsAt','status'].includes(key) || (v !== undefined && !text(v))))) return fail()
  if (value.price !== undefined && (!plain(value.price) || value.price.kind !== 'buyNow' || typeof value.price.amount !== 'number' || !Number.isFinite(value.price.amount) || value.price.amount < 0 || typeof value.price.currency !== 'string' || !/^[A-Z]{3}$/.test(value.price.currency))) return fail()
}
