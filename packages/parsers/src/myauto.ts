import { selectDropdown, matchesOption } from './dropdowns'
import { translateDetail, myautoEquivalents, reviewDetails } from './normalization'
import type { DetailCategory } from './normalization'
import type { DropdownValue, DropdownSelection } from './dropdowns'
import type { FieldResult, NormalizedVehicle } from '@auto-importer/shared'

export interface FormField {
  field: string; label: string; value?: string; selector?: string
  dropdownKey?: string; optionValue?: DropdownValue
  mode: 'text' | 'choice' | 'dropdown' | 'manual'; verifySelector?: string
  reason?: string
}
const testid = (id: string) => `[data-testid="${id}"]`
export function vehicleDescription(v: NormalizedVehicle): string {
  const untranslatedOptions = [...(v.equipment ?? []),...(v.announcements ?? [])].some(s=> !translateDetail(v.equipment?.includes(s) ? 'equipment' : 'note',s).verified)
  const details = reviewDetails(v).filter(row => !['vin','make','model','trim','year','price'].includes(row.key))
  return [
    `${v.year === undefined ? '' : `${v.year} `}${v.make ?? ''} ${v.model ?? ''}`.trim(),
    v.trim ? `კომპლექტაცია: ${v.trim}` : '', `VIN: ${v.vin}`, `წყარო: ${v.source}`,
    ...details.filter(row => row.original !== undefined).map(row => `${row.label}: ${row.georgian ?? row.original}${row.resolved ? '' : ' (ორიგინალი; დაუდასტურებელი შესაბამისობა)'}`),
    v.description ? `წყაროს დამატებითი აღწერა (ორიგინალი): ${v.description}` : '',
    v.announcements?.length ? `აუქციონის შენიშვნები: ${v.announcements.map(s => translateDetail('note',s).georgian).join('; ')}` : '',
    untranslatedOptions ? 'დაუდასტურებელი თარგმანის მქონე ოფციები შენარჩუნებულია ორიგინალური სახელებით.' : '',
    v.optionalEquipmentSummary ? `დამატებითი პაკეტების დასახელება (ორიგინალი): ${v.optionalEquipmentSummary}` : '',
    v.equipment?.length ? `აღჭურვილობა: ${v.equipment.map(s => translateDetail('equipment',s).georgian).join('; ')}` : '',
    v.auction?.name ? `აუქციონი: ${v.auction.name}` : '',
    v.price ? `წყაროს აუქციონის ფასი: ${v.price.amount} ${v.price.currency} (არ არის MyAuto-ზე გასაყიდი ფასი)` : '',
    'ინფორმაცია გადმოტანილია წყაროდან და საჭიროებს გადამოწმებას. უცნობი მონაცემები არ არის შევსებული.',
  ].filter(Boolean).join('\n')
}
export function myautoFields(v: NormalizedVehicle): FormField[] {
  const fields: FormField[] = [
    { field: 'vin', label: 'VIN', mode: 'text', selector: 'input[name="primaryFeatures.vinCode"]', value: v.vin },
    { field: 'trim', label: 'კომპლექტაცია', mode: 'text', selector: 'input[name="primaryFeatures.customModel"]', value: v.trim },
    { field: 'mileageKm', label: 'გარბენი', mode: 'text', selector: 'input[name="primaryFeatures.mileage"]', value: v.mileageKm === undefined ? undefined : String(Math.round(v.mileageKm)) },
    { field: 'description', label: 'აღწერა', mode: 'text', selector: testid('description-textarea'), value: vehicleDescription(v) },
  ]
  for (const [field, label, key, value] of [
    ['make', 'მწარმოებელი', 'manufacturer', v.make], ['model', 'მოდელი', 'model', v.model],
    ['year', 'წელი', 'issueYear', v.year], ['fuel', 'საწვავი', 'fuelType', v.fuel],
    ['engineCc', 'ძრავის მოცულობა', 'engineVolume', v.engineCc], ['cylinders', 'ცილინდრები', 'cylinders', v.cylinders],
    ['body', 'ძარის ტიპი', 'vehicleCategory', v.body],
  ] as const) {
    const category: DetailCategory | undefined = field === 'fuel' ? 'fuel' : field === 'body' ? 'body' : undefined
    fields.push({ field, label, mode: 'dropdown', selector: testid(`single-select-trigger-primaryFeatures.${key}`),
      dropdownKey: key, optionValue: { candidates: value === undefined ? [] : field === 'engineCc' && typeof v.raw.engineDisplacement === 'string' ? [v.raw.engineDisplacement] : [String(value)], equivalents: category && value !== undefined ? myautoEquivalents(category,String(value)) : [], engineCc: field === 'engineCc' ? v.engineCc : undefined },
      value: value === undefined ? undefined : String(value), reason: 'ჩამოსაშლელი სიის ზუსტი შესაბამისობა ვერ დადასტურდა.' })
  }
  function choice(field: string, label: string, key: string, source: string | undefined, options: Record<string, number>) {
    const id = source ? options[source.toLowerCase()] : undefined
    fields.push({ field, label, mode: 'choice', value: id === undefined ? undefined : String(id),
      selector: id === undefined ? undefined : testid(`single-checkbox-primaryFeatures.${key}-${id}`),
      verifySelector: id === undefined ? undefined : testid(`single-checkbox-input-primaryFeatures.${key}-${id}`),
    })
  }
  choice('transmission', 'გადაცემათა კოლოფი', 'gearTypeId', v.transmission, { automatic: 2, auto: 2, manual: 1, cvt: 4 })
  choice('drivetrain', 'წამყვანი თვლები', 'driveTypeId', v.drivetrain, { awd: 3, '4wd': 3, fwd: 1, rwd: 2 })
  choice('exteriorColor', 'ძარის ფერი', 'vehicleColorId', v.exteriorColor, { white: 1, black: 16, silver: 12, gray: 13, grey: 13, red: 8, blue: 14, yellow: 4, green: 5, orange: 9, gold: 6, purple: 19, pink: 18, beige: 2, burgundy: 11, brown: 7 })
  choice('interiorColor', 'სალონის ფერი', 'saloonColorId', v.interiorColor, { black: 16, white: 1, gray: 13, grey: 13, brown: 7, beige: 2, red: 8, blue: 3, yellow: 4, orange: 9, burgundy: 11, gold: 6 })
  choice('interiorMaterial', 'სალონის მასალა', 'saloonMaterialId', v.interiorMaterial, { leather: 1, cloth: 2 })
  fields.push({ field: 'price', label: 'ფასი', mode: 'manual', value: v.price ? `${v.price.amount} ${v.price.currency}` : undefined, reason: 'აუქციონის ფასი გასაყიდ ფასად ავტომატურად არ გადაიტანება.' })
  fields.push({ field: 'condition', label: 'მდგომარეობა', mode: 'manual', value: v.condition, reason: 'მდგომარეობის შესაბამისი ველი დადასტურებული არ არის; იხილეთ აღწერა.' })
  
  return fields
}

const pause = () => new Promise(resolve => setTimeout(resolve, 100))
export interface FillOptions { allowAutofillCorrection?: boolean; dropdownTimeoutMs?: number; signal?: AbortSignal; beforeField?: () => void; onResult?: (results: FieldResult[]) => void }
export async function fillMyautoForm(doc: Document, vehicle: NormalizedVehicle, options: FillOptions = {}): Promise<FieldResult[]> {
  const results: FieldResult[] = []
  const planned = myautoFields(vehicle)
  const initiallyEmpty = new Set(planned.filter(f => f.mode === 'dropdown' && !doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${f.dropdownKey}"]`)?.textContent?.trim()).map(f=>f.field))
  const userEdited = new Set<string>()
  const protectUserEdit = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof doc.defaultView!.Element)) return
    for (const f of planned.filter(f=>f.mode==='dropdown')) {
      const owner = doc.querySelector(`[data-testid="single-select-primaryFeatures.${f.dropdownKey}"]`)
      if (owner?.contains(event.target)) userEdited.add(f.field)
    }
  }
  doc.addEventListener('pointerdown',protectUserEdit,true)
  doc.addEventListener('keydown',protectUserEdit,true)
  const ordered = [planned.find(f => f.field === 'vin')!, ...planned.filter(f => f.mode === 'dropdown'), ...planned.filter(f => f.field !== 'vin' && f.mode !== 'dropdown')]
  try {
  for (const field of ordered) {
    options.signal?.throwIfAborted()
    options.beforeField?.()
    options.onResult?.([...results])
    const fail = (reason: string) => results.push({ field: field.label, status: 'unfilled', reason })
    if (field.value === undefined || field.value === '') { fail('წყაროში მონაცემი არ არის ან შესაბამისობა დაუდასტურებელია.'); continue }
    if (field.mode === 'dropdown') {
      if (field.field === 'model' && !results.some(r => r.field === 'მწარმოებელი' && r.status === 'filled')) { fail('ჯერ საჭიროა მწარმოებლის დადასტურებული არჩევანი.'); continue }
      let selection: DropdownSelection | undefined
      const reason = await selectDropdown(doc, field.dropdownKey!, {...field.optionValue!,allowReplaceSelection:options.allowAutofillCorrection === true && initiallyEmpty.has(field.field) && !userEdited.has(field.field),onSelected:value => {selection=value}}, options.dropdownTimeoutMs, options.signal)
      if (reason) fail(field.field === 'model' ? `${reason} მსგავსი მოდელი არ არჩეულა. „კომპლექტაცია“ მოდელის შემცვლელი არ არის; სრული მოდელი აღწერაში შენარჩუნებულია.` : reason)
      else results.push({ field: field.label, status: 'filled', reason: 'რეალური ვარიანტი და მისი მნიშვნელობა დადასტურებულია.', ...selection })
      continue
    }
    if (field.mode === 'manual') { fail(field.reason!); continue }
    const element = field.selector ? doc.querySelector<HTMLElement>(field.selector) : null
    if (!element) { fail('ველის სელექტორი მიმდინარე ფორმაზე ვერ მოიძებნა.'); continue }
    if (field.mode === 'choice') {
      // The snapshot has custom div controls and hidden tracking inputs, not native radios.
      // Only report success if the site's own tracking input confirms the exact option ID.
      const current = doc.querySelector<HTMLInputElement>(field.verifySelector!)
      const group = field.verifySelector!.match(/primaryFeatures\.([A-Za-z]+)-/)?.[1]
      const otherSelected = group && [...doc.querySelectorAll<HTMLInputElement>(`input[data-testid^="single-checkbox-input-primaryFeatures.${group}-"]`)].some(input => input !== current && input.value !== '')
      if (otherSelected && current?.value !== field.value) { fail('არსებული არჩევანი არ გადაგვიწერია.'); continue }
      if (current?.value !== field.value) element.click()
      await pause()
      if (doc.querySelector<HTMLInputElement>(field.verifySelector!)?.value === field.value) {
        results.push({ field: field.label, status: 'filled', reason: 'არჩევანი დადასტურებულია.', optionId: field.value, match: 'equivalent' })
      } else fail('არჩევანი დაჭერილია, მაგრამ ფორმის მდგომარეობა ვერ დადასტურდა. გადაამოწმეთ ხელით.')
      continue
    }
    if (field.field === 'mileageKm' && doc.querySelector(testid('single-select-value-primaryFeatures.mileageType'))?.textContent?.trim() !== 'კმ') {
      const reason = await selectDropdown(doc, 'mileageType', { candidates: ['კმ'] }, options.dropdownTimeoutMs, options.signal)
      if (reason) { fail('გარბენის ერთეული „კმ“ ვერ დადასტურდა.'); continue }
    }
    if (!(element instanceof doc.defaultView!.HTMLInputElement || element instanceof doc.defaultView!.HTMLTextAreaElement)) { fail('ველის ტიპი შეიცვალა.'); continue }
    if (element.maxLength > 0 && field.value.length > element.maxLength) { fail('ტექსტი აღემატება ფორმის დაშვებულ სიგრძეს. მონაცემები არ შემოკლებულა; ორიგინალი შენარჩუნებულია.'); continue }
    if (element.disabled || element.readOnly) { fail('ველი მიუწვდომელია.'); continue }
    if (element.value && element.value !== field.value) { fail('არსებული მნიშვნელობა არ გადაგვიწერია.'); continue }
    // Use native setters so React receives a real value change rather than a changed tracker.
    const proto = element.tagName === 'TEXTAREA' ? doc.defaultView!.HTMLTextAreaElement.prototype : doc.defaultView!.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, field.value)
    element.dispatchEvent(new doc.defaultView!.Event('input', { bubbles: true }))
    element.dispatchEvent(new doc.defaultView!.Event('change', { bubbles: true }))
    await pause()
    const latest = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(field.selector!)
    if (latest?.value === field.value) results.push({ field: field.label, status: 'filled', reason: 'მნიშვნელობა შეყვანილია; საბოლოოდ გადაამოწმეთ ფორმაში.' })
    else fail('ფორმამ მნიშვნელობა არ შეინარჩუნა. შეავსეთ ხელით.')
  }
  } finally { doc.removeEventListener('pointerdown',protectUserEdit,true);doc.removeEventListener('keydown',protectUserEdit,true) }
  options.onResult?.([...results])
  return results
}

export function verifyMyautoFields(doc: Document, vehicle: NormalizedVehicle, results: FieldResult[]): FieldResult[] {
  const planned = myautoFields(vehicle)
  return results.map(result => {
    if (result.status !== 'filled') return result
    const field = planned.find(f => f.label === result.field)
    if (!field) return result
    let valid = false
    if (field.mode === 'text') valid = doc.querySelector<HTMLInputElement>(field.selector!)?.value === field.value
    if (field.mode === 'choice') valid = doc.querySelector<HTMLInputElement>(field.verifySelector!)?.value === field.value
    if (field.mode === 'dropdown') {
      const selected = doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${field.dropdownKey}"]`)?.textContent ?? ''
      valid = matchesOption(selected, field.optionValue!) && !!result.optionId && doc.querySelector<HTMLInputElement>(`[data-testid="single-select-input-primaryFeatures.${field.dropdownKey}"]`)?.value === result.optionId
    }
    if (field.field === 'mileageKm') valid &&= doc.querySelector('[data-testid="single-select-value-primaryFeatures.mileageType"]')?.textContent?.trim() === 'კმ'
    return valid ? result : { field: result.field, status: 'unfilled', reason: 'საბოლოო შემოწმებისას მნიშვნელობა შეიცვალა ან ვერ დადასტურდა.' }
  })
}
