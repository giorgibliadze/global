import type { OriginalVehicleIdentity } from '@auto-importer/shared'
export type OriginalIdentity = OriginalVehicleIdentity
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const name = (v: unknown) => typeof v === 'string' && v.trim() && v.length <= 500 && !['unknown','n/a','na','not available','unavailable','-','--','null','undefined'].includes(v.trim().toLowerCase()) ? v.trim() : undefined
const one = (v: unknown) => Array.isArray(v) && v.length === 1 ? name(v[0]) : undefined
const display = (v: string) => v.replace(/\s+/g, ' ').trim()
export function extractOriginalIdentity(data: Record<string, unknown>, title: string, vin: string): { original: OriginalIdentity; year?: number; shortDescription?: string } {
  const enrichment = record(data.designatedDescriptionEnrichment)
  if (data.vin !== vin || (enrichment.vin !== undefined && enrichment.vin !== vin)) throw new Error('არჩეული ავტომობილის VIN და სტრუქტურირებული მონაცემები არ ემთხვევა. დაელოდეთ გვერდის განახლებას.')
  const manufacturer = name(enrichment.make) ?? name(data.make)
  const enrichmentModel = name(enrichment.model)
  const listedModel = one(data.models)
  const catalogModel = listedModel ?? enrichmentModel
  const trim = name(enrichment.trim) ?? one(data.trims) ?? name(data.sourceTrim)
  if (!manufacturer || !catalogModel) throw new Error('მწარმოებელი ან მოდელი საიმედოდ ვერ განისაზღვრა. გადატანა შეჩერებულია.')
  if ((name(data.make) && name(data.make) !== manufacturer) || (one(data.trims) && trim !== one(data.trims))) throw new Error('ავტომობილის საიდენტიფიკაციო ველები ერთმანეთს არ ემთხვევა. ხელახლა სცადეთ.')
  const sourceYear = enrichment.year ?? data.year
  const year = (typeof sourceYear === 'number' && Number.isInteger(sourceYear)) || (typeof sourceYear === 'string' && /^\d{4}$/.test(sourceYear)) ? Number(sourceYear) : undefined
  if (year !== undefined && (year < 1886 || year > 2100)) throw new Error('სტრუქტურირებული გამოშვების წელი არასწორია.')
  if (enrichment.year !== undefined && data.year !== undefined && Number(enrichment.year) !== Number(data.year)) throw new Error('გამოშვების წლის მონაცემები ჯერ ახლდება.')
  const shortDescription = name(record(enrichment.manheimStandardDescription).shortDescription)
  let model = enrichmentModel ?? catalogModel
  let evidence: OriginalIdentity['evidence'] = 'structured-model'
  if (shortDescription) {
    if (display(shortDescription) !== display(title)) throw new Error('სათაური და სტრუქტურირებული აღწერა სხვადასხვა ავტომობილს ეკუთვნის ან ჯერ ახლდება.')
    // This is an observed structured display field, not positional tokenization of a title.
    // Remove only the exact, independently known year/manufacturer prefix. Never strip body words.
    const prefix = year === undefined ? undefined : `${year} ${manufacturer} `
    if (!prefix || !shortDescription.startsWith(prefix)) throw new Error('სრული სტრუქტურირებული სახელის წელი და მწარმოებელი ვერ დადასტურდა. გადატანა შეჩერებულია.')
    if (shortDescription.startsWith(prefix)) {
      const designation = shortDescription.slice(prefix.length)
      const includesSeparateTrim = trim && designation !== model && (` ${designation} `).includes(` ${trim} `)
      if (includesSeparateTrim) {
        if (designation !== `${model} ${trim}` && !designation.startsWith(`${model} ${trim} `)) throw new Error('სრული მოდელი და კომპლექტაცია საიმედოდ ვერ გაიმიჯნა. გადატანა შეჩერებულია.')
      } else { model = designation; evidence = 'structured-standard-description' }
    }
  } else if (year !== undefined) {
    if (enrichmentModel && listedModel && enrichmentModel !== listedModel) throw new Error('მოდელის სტრუქტურირებული ჩანაწერები ერთმანეთს არ ემთხვევა. გადატანა შეჩერებულია.')
    const expected = `${year} ${manufacturer} ${catalogModel}`
    if (display(title) !== expected && !display(title).startsWith(`${expected} `)) throw new Error('სათაური არჩეულ მწარმოებელსა და მოდელს არ ემთხვევა. გადატანა შეჩერებულია.')
  }
  return { original: { manufacturer, model, trim, catalogModel, evidence }, year, shortDescription }
}
