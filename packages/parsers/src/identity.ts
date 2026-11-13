import type { OriginalVehicleIdentity } from '@auto-importer/shared'
export type OriginalIdentity = OriginalVehicleIdentity
export const MODEL_TRIM_WARNING='მოდელი და კომპლექტაცია ცალ-ცალკე ვერ განისაზღვრა. სრული დასახელება შენარჩუნებულია და გადატანა გაგრძელდება.'
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const name = (v: unknown) => typeof v === 'string' && v.trim() && v.length <= 500 && !['not specified','unspecified','none','unknown','n/a','na','not available','unavailable','-','--','null','undefined'].includes(v.trim().toLowerCase()) ? v.trim() : undefined
const names=(v:unknown):string[]=>Array.isArray(v)?v.map(name).filter((value):value is string=>!!value):[]
const one = (v: unknown) => {const values=names(v);return values.length===1?values[0]:undefined}
const display = (v: string) => v.replace(/\s+/g, ' ').trim()
export function extractOriginalIdentity(data: Record<string, unknown>, title: string, vin: string): { original: OriginalIdentity; year?: number; shortDescription?: string;warnings:string[] } {
  const enrichment = record(data.designatedDescriptionEnrichment)
  if (data.vin !== vin || (enrichment.vin !== undefined && enrichment.vin !== vin)) throw new Error('არჩეული ავტომობილის VIN და სტრუქტურირებული მონაცემები არ ემთხვევა. დაელოდეთ გვერდის განახლებას.')
  const manufacturer = name(enrichment.make) ?? name(data.make)
  if(!manufacturer)throw new Error('მწარმოებელი საიმედოდ ვერ განისაზღვრა. გადატანა შეჩერებულია.')
  if(name(data.make) && name(data.make)!==manufacturer)throw new Error('ავტომობილის მწარმოებლის ჩანაწერები ერთმანეთს არ ემთხვევა. ხელახლა სცადეთ.')
  const enrichmentModel=name(enrichment.model),catalogModel=one(data.models) ?? enrichmentModel
  const baseModel=catalogModel
  // Trim comes only from separately labeled fields, never from splitting a title.
  // Conflicting optional trim metadata is not an unsafe vehicle-identity mismatch.
  const trimValues=[...new Set([name(enrichment.trim),...names(data.trims),name(data.sourceTrim)].filter((value):value is string=>!!value))]
  const trim=trimValues.length===1?trimValues[0]:null
  const sourceYear = enrichment.year ?? data.year
  const year = (typeof sourceYear === 'number' && Number.isInteger(sourceYear)) || (typeof sourceYear === 'string' && /^\d{4}$/.test(sourceYear)) ? Number(sourceYear) : undefined
  if (year !== undefined && (year < 1886 || year > 2100)) throw new Error('სტრუქტურირებული გამოშვების წელი არასწორია.')
  if (enrichment.year != null && data.year != null && Number(enrichment.year) !== Number(data.year)) throw new Error('გამოშვების წლის მონაცემები ჯერ ახლდება.')
  const shortDescription = name(record(enrichment.manheimStandardDescription).shortDescription)
  if(shortDescription && display(shortDescription)!==display(title))throw new Error('სათაური და სტრუქტურირებული აღწერა სხვადასხვა ავტომობილს ეკუთვნის ან ჯერ ახლდება.')
  const source=shortDescription ?? title
  // Remove only the independently known manufacturer/year header. Everything after
  // that header is the full designation, including trim/body/cab/bed words verbatim.
  const prefix=year===undefined
    ? source.startsWith(`${manufacturer} `)?`${manufacturer} `:/^\d{4} /.test(source)?`${source.slice(0,4)} ${manufacturer} `:undefined
    : `${year} ${manufacturer} `
  let fullModelName:string | undefined,evidence:OriginalIdentity['evidence']='structured-model'
  if(prefix && source.startsWith(prefix)) {
    fullModelName=name(source.slice(prefix.length))
    evidence=shortDescription?'structured-standard-description':'selected-title'
  }else if(shortDescription || year!==undefined) {
    // Keep a genuine conflicting manufacturer/year display unsafe; this is unrelated to trim.
    throw new Error('არჩეული ავტომობილის სათაურის წელი და მწარმოებელი ვერ დადასტურდა. გადატანა შეჩერებულია.')
  }else fullModelName=enrichmentModel ?? catalogModel
  // A separately labeled model may be more complete than a shortened display.
  // Accept only an exact prefix extension from that verified source field, never
  // manufacture suffixes from trim/body fields or choose a similar model family.
  for(const structured of [enrichmentModel,catalogModel]) {
    if(fullModelName && structured?.startsWith(`${fullModelName} `)){fullModelName=structured;evidence='structured-model'}
  }
  if(!fullModelName)throw new Error('არჩეული ავტომობილის მოდელის დასახელება საიმედოდ ვერ განისაზღვრა. გადატანა შეჩერებულია.')
  const trimEmbedded=trim && (` ${fullModelName} `).includes(` ${trim} `)
  const ambiguous=!trim || (trimEmbedded && baseModel && fullModelName!==baseModel && fullModelName!==`${baseModel} ${trim}` && !fullModelName.startsWith(`${baseModel} ${trim} `))
  return {original:{manufacturer,model:fullModelName,fullModelName,baseModel,trim,catalogModel,evidence},year,shortDescription,warnings:ambiguous?[MODEL_TRIM_WARNING]:[]}
}
