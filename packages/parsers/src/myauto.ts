import { settleField, interactive } from './dropdownDom'
import type { DropdownDiagnostic } from './dropdownDiagnostics'
import type { FieldFailureCode } from '@auto-importer/shared'
import { reportDropdown } from './dropdownDiagnostics'
import type { TimingStage } from '@auto-importer/shared'
import { manufacturerOptionLabel, myautoCatalogHint } from './myautoCatalog'
import { sanitizeDescription } from './vinPrivacy'
import { editableModelInput, fillEditableModel, nativeDropdown, selectNativeDropdown } from './modelField'
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
const fullModel=(vehicle:NormalizedVehicle)=>vehicle.fullModelName ?? vehicle.model
export const MYAUTO_MODEL_WARNING='მოდელის ზუსტი ვარიანტი MyAuto-ზე ვერ მოიძებნა. გადაამოწმეთ მოდელის ველი.'
export function vehicleDescription(v: NormalizedVehicle): string {
  const clean=(value:string)=>sanitizeDescription(value,v.vin)
  const sourceDescription=v.description?clean(v.description):''
  const optionalSummary=v.optionalEquipmentSummary?clean(v.optionalEquipmentSummary):''
  const equipment=(v.equipment ?? []).map(s=>translateDetail('equipment',s)).filter(t=>!!clean(t.georgian))
  const notes=(v.announcements ?? []).map(s=>translateDetail('note',s)).filter(t=>!!clean(t.georgian))
  const untranslatedOptions=[...equipment,...notes].some(t=>!t.verified)
  const details = reviewDetails(v).filter(row => !['vin','make','model','trim','year','price'].includes(row.key))
  return sanitizeDescription([
    `${v.year === undefined ? '' : `${v.year} `}${v.make ?? ''} ${fullModel(v) ?? ''}`.trim(),
    v.trim ? `კომპლექტაცია: ${v.trim}` : '', `წყარო: ${v.source}`,
    ...details.filter(row => row.original !== undefined).map(row => `${row.label}: ${row.georgian ?? row.original}${row.resolved ? '' : ' (ორიგინალი; დაუდასტურებელი შესაბამისობა)'}`),
    sourceDescription ? `წყაროს დამატებითი აღწერა (ორიგინალი): ${sourceDescription}` : '',
    notes.length ? `აუქციონის შენიშვნები: ${notes.map(t=>clean(t.georgian)).join('; ')}` : '',
    untranslatedOptions ? 'დაუდასტურებელი თარგმანის მქონე ოფციები შენარჩუნებულია ორიგინალური სახელებით.' : '',
    optionalSummary ? `დამატებითი პაკეტების დასახელება (ორიგინალი): ${optionalSummary}` : '',
    equipment.length ? `აღჭურვილობა: ${equipment.map(t=>clean(t.georgian)).join('; ')}` : '',
    v.auction?.name ? `აუქციონი: ${v.auction.name}` : '',
    v.price ? `წყაროს აუქციონის ფასი: ${v.price.amount} ${v.price.currency} (არ არის MyAuto-ზე გასაყიდი ფასი)` : '',
    'ინფორმაცია გადმოტანილია წყაროდან და საჭიროებს გადამოწმებას. უცნობი მონაცემები არ არის შევსებული.',
  ].filter(Boolean).join('\n'),v.vin)
}
export function myautoFields(v: NormalizedVehicle): FormField[] {
  const fields: FormField[] = [
    { field: 'vin', label: 'VIN', mode: 'text', selector: 'input[name="primaryFeatures.vinCode"]', value: v.vin },
    { field: 'trim', label: 'კომპლექტაცია', mode: 'text', selector: 'input[name="primaryFeatures.customModel"]', value: v.trim ?? undefined },
    { field: 'mileageKm', label: 'გარბენი', mode: 'text', selector: 'input[name="primaryFeatures.mileage"]', value: v.mileageKm === undefined ? undefined : String(Math.round(v.mileageKm)) },
    { field: 'description', label: 'აღწერა', mode: 'text', selector: testid('description-textarea'), value: vehicleDescription(v) },
  ]
  for (const [field, label, key, value] of [
    ['make', 'მწარმოებელი', 'manufacturer', v.make], ['model', 'მოდელი', 'model', fullModel(v)],
    ['year', 'წელი', 'issueYear', v.year], ['fuel', 'საწვავი', 'fuelType', v.fuel],
    ['engineCc', 'ძრავის მოცულობა', 'engineVolume', v.engineCc], ['cylinders', 'ცილინდრები', 'cylinders', v.cylinders],
    ['body', 'ძარის ტიპი', 'vehicleCategory', v.body],
  ] as const) {
    const category: DetailCategory | undefined = field === 'fuel' ? 'fuel' : field === 'body' ? 'body' : undefined
    fields.push({ field, label, mode: 'dropdown', selector: testid(`single-select-trigger-primaryFeatures.${key}`),
      dropdownKey: key, optionValue: { exactText: field === 'model', candidates: value === undefined ? [] : field === 'engineCc' ? [...(typeof v.raw.engineDisplacement === 'string' ? [v.raw.engineDisplacement] : []),String(v.engineCc! / 1000)] : [String(value)], equivalents: field === 'make' && typeof value === 'string' ? [manufacturerOptionLabel(value)].filter((label):label is string=>!!label && label!==value) : category && value !== undefined ? myautoEquivalents(category,String(value)) : [], engineCc: field === 'engineCc' ? v.engineCc : undefined, engineUnit: field === 'engineCc' ? 'liters' : undefined },
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

export interface FillOptions { planned?:FormField[];onlyFields?:string[];previousResults?:FieldResult[];onFieldStage?:(stage:'discovery'|'matching'|'selection')=>void; onTiming?: (stage:TimingStage,ms:number)=>void; allowAutofillCorrection?: boolean; dropdownTimeoutMs?: number; signal?: AbortSignal; beforeField?: () => void; onResult?: (results: FieldResult[]) => void }
export async function fillMyautoForm(doc: Document, vehicle: NormalizedVehicle, options: FillOptions = {}): Promise<FieldResult[]> {
  const results: FieldResult[] = (options.previousResults ?? []).map(result=>({...result}))
  const normalizationStarted=performance.now()
  const planned = options.planned ?? myautoFields(vehicle)
  options.onTiming?.('normalization',performance.now()-normalizationStarted)
  for(let i=results.length-1;i>=0;i--)if(options.onlyFields?.includes(results[i].key ?? planned.find(field=>field.label===results[i].field)?.field ?? ''))results.splice(i,1)
  const verify=async(predicate:()=>boolean)=>{const started=performance.now();try{return await settleField(doc,predicate,options.signal)}finally{options.onTiming?.('fieldVerification',performance.now()-started)}}
  const selectedAtStart=(field:FormField)=>nativeDropdown(doc,field.dropdownKey!)?.value ?? (field.field==='model'?editableModelInput(doc)?.element.value:undefined) ?? doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${field.dropdownKey}"]`)?.textContent?.trim()
  const initiallyEmpty = new Set(planned.filter(f=>f.mode==='dropdown' && !selectedAtStart(f)).map(f=>f.field))
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
    if(options.onlyFields && !options.onlyFields.includes(field.field))continue
    options.signal?.throwIfAborted()
    options.beforeField?.()
    options.onResult?.([...results])
    const fail = (reason:string,code:FieldFailureCode='unresolved',retryable=['unavailable','verification'].includes(code)) => results.push({key:field.field,field:field.label,status:'unfilled',reason,code,retryable})
    let diagnostic:DropdownDiagnostic | undefined
    const descriptor={...field.optionValue!,onPhase:options.onFieldStage,onDiagnostic:(item:DropdownDiagnostic)=>{diagnostic=item;reportDropdown(item);options.onTiming?.('dropdownDiscovery',item.discoveryMs ?? 0);options.onTiming?.('dropdownSelection',item.selectionMs ?? 0);options.onTiming?.('matching',item.matchingMs ?? 0);options.onTiming?.('fieldVerification',item.verificationMs ?? 0)}}
    const dropdownFailure=(reason:string)=>fail(reason,diagnostic?.outcome==='protected'?'protected':diagnostic && ['unavailable','not-discovered','interaction-error'].includes(diagnostic.outcome)?'unavailable':diagnostic?.outcome==='not-verified'?'verification':'unresolved')
    if (field.value === undefined || field.value === '') { fail('წყაროში მონაცემი არ არის ან შესაბამისობა დაუდასტურებელია.','missing'); continue }
    if (field.mode === 'dropdown') {
      if (field.field === 'model' && !results.some(r => r.field === 'მწარმოებელი' && r.status === 'filled')) { fail('ჯერ საჭიროა მწარმოებლის დადასტურებული არჩევანი.','dependency',results.some(result=>result.field==='მწარმოებელი' && result.retryable)); continue }
      if (field.field === 'model' && editableModelInput(doc) && !nativeDropdown(doc,'model') && !interactive(doc,'model')) {
        const error=await fillEditableModel(doc,fullModel(vehicle)!,options.allowAutofillCorrection === true && initiallyEmpty.has(field.field) && !userEdited.has(field.field))
        if(error)fail(`${MYAUTO_MODEL_WARNING} ${error}`)
        else results.push({field:field.label,status:'filled',reason:'სრული ორიგინალური მოდელი შეყვანილია მოდელის რედაქტირებად ველში.',match:'custom',optionLabel:fullModel(vehicle)})
        continue
      }
      if (field.dropdownKey && nativeDropdown(doc,field.dropdownKey)) {
        const selected=await selectNativeDropdown(doc,field.dropdownKey,field.value,options.allowAutofillCorrection === true && initiallyEmpty.has(field.field) && !userEdited.has(field.field),descriptor,options.dropdownTimeoutMs,options.signal)
        if(selected.error){if(field.field==='model' && editableModelInput(doc)){const error=await fillEditableModel(doc,fullModel(vehicle)!);if(!error){results.push({field:field.label,status:'filled',match:'custom',optionLabel:fullModel(vehicle),reason:'სრული მოდელი შეყვანილია რედაქტირებად ველში.'});continue}}dropdownFailure([field.field==='model'?MYAUTO_MODEL_WARNING:undefined,selected.error,myautoCatalogHint(field.dropdownKey,field.value)].filter(Boolean).join(' '))}
        else results.push({field:field.label,status:'filled',reason:'ზუსტი ვარიანტი დადასტურებულია.',...selected.selection})
        continue
      }
      let selection: DropdownSelection | undefined
      options.onFieldStage?.('discovery')
      const reason = await selectDropdown(doc, field.dropdownKey!, {...descriptor,allowReplaceSelection:options.allowAutofillCorrection === true && initiallyEmpty.has(field.field) && !userEdited.has(field.field),onSelected:value => {selection=value}}, options.dropdownTimeoutMs, options.signal)
      if(reason && field.field==='model' && diagnostic?.outcome!=='protected' && editableModelInput(doc)){const error=await fillEditableModel(doc,fullModel(vehicle)!);if(!error){results.push({field:field.label,status:'filled',match:'custom',optionLabel:fullModel(vehicle),reason:'სრული მოდელი შეყვანილია რედაქტირებად ველში.'});continue}}
      if (reason) dropdownFailure(field.field === 'model' ? `${MYAUTO_MODEL_WARNING} ${reason}` : [reason,myautoCatalogHint(field.dropdownKey!,field.value)].filter(Boolean).join(' '))
      else results.push({ field: field.label, status: 'filled', reason: 'რეალური ვარიანტი და მისი მნიშვნელობა დადასტურებულია.', ...selection })
      continue
    }
    if (field.mode === 'manual') { fail(field.reason!,'manual'); continue }
    const element = field.selector ? doc.querySelector<HTMLElement>(field.selector) : null
    if (!element) { fail('ველის სელექტორი მიმდინარე ფორმაზე ვერ მოიძებნა.','unavailable'); continue }
    if (field.mode === 'choice') {
      // The snapshot has custom div controls and hidden tracking inputs, not native radios.
      // Only report success if the site's own tracking input confirms the exact option ID.
      const current = doc.querySelector<HTMLInputElement>(field.verifySelector!)
      const group = field.verifySelector!.match(/primaryFeatures\.([A-Za-z]+)-/)?.[1]
      const otherSelected = group && [...doc.querySelectorAll<HTMLInputElement>(`input[data-testid^="single-checkbox-input-primaryFeatures.${group}-"]`)].some(input => input !== current && input.value !== '')
      if (otherSelected && current?.value !== field.value) { fail('არსებული არჩევანი არ გადაგვიწერია.','protected'); continue }
      if (current?.value !== field.value) element.click()
      if (await verify(()=>doc.querySelector<HTMLInputElement>(field.verifySelector!)?.value===field.value)) {
        results.push({ field: field.label, status: 'filled', reason: 'არჩევანი დადასტურებულია.', optionId: field.value, match: 'equivalent' })
      } else fail('არჩევანი დაჭერილია, მაგრამ ფორმის მდგომარეობა ვერ დადასტურდა. გადაამოწმეთ ხელით.','verification')
      continue
    }
    if (field.field === 'mileageKm' && doc.querySelector(testid('single-select-value-primaryFeatures.mileageType'))?.textContent?.trim() !== 'კმ') {
      options.onFieldStage?.('discovery')
      const reason = await selectDropdown(doc, 'mileageType', { candidates: ['კმ'] }, options.dropdownTimeoutMs, options.signal)
      if (reason) { fail('გარბენის ერთეული „კმ“ ვერ დადასტურდა.'); continue }
    }
    if (!(element instanceof doc.defaultView!.HTMLInputElement || element instanceof doc.defaultView!.HTMLTextAreaElement)) { fail('ველის ტიპი შეიცვალა.'); continue }
    if (field.field === 'description') field.value = sanitizeDescription(field.value,vehicle.vin)
    if (element.maxLength > 0 && field.value.length > element.maxLength) { fail('ტექსტი აღემატება ფორმის დაშვებულ სიგრძეს. მონაცემები არ შემოკლებულა; ორიგინალი შენარჩუნებულია.'); continue }
    if (element.disabled || element.readOnly) { fail('ველი მიუწვდომელია.','unavailable'); continue }
    if (field.field === 'description' && !(await enforceDescriptionPrivacy(doc,vehicle.vin))) { fail('აღწერიდან საიდენტიფიკაციო მონაცემის მოცილება ვერ დადასტურდა.'); continue }
    if (element.value && element.value !== field.value) { fail('არსებული მნიშვნელობა არ გადაგვიწერია.','protected'); continue }
    // Use native setters so React receives a real value change rather than a changed tracker.
    const proto = element.tagName === 'TEXTAREA' ? doc.defaultView!.HTMLTextAreaElement.prototype : doc.defaultView!.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, field.value)
    element.dispatchEvent(new doc.defaultView!.Event('input', { bubbles: true }))
    element.dispatchEvent(new doc.defaultView!.Event('change', { bubbles: true }))
    if (await verify(()=>doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(field.selector!)?.value===field.value)) results.push({ field: field.label, status: 'filled', reason: 'მნიშვნელობა შეყვანილია; საბოლოოდ გადაამოწმეთ ფორმაში.' })
    else fail('ფორმამ მნიშვნელობა არ შეინარჩუნა. შეავსეთ ხელით.','verification')
  }
  } finally { doc.removeEventListener('pointerdown',protectUserEdit,true);doc.removeEventListener('keydown',protectUserEdit,true) }
  if (!(await enforceDescriptionPrivacy(doc,vehicle.vin))) {
    const index=results.findIndex(result=>result.field==='აღწერა')
    const result:FieldResult={field:'აღწერა',status:'unfilled',reason:'ფორმა აღწერაში საიდენტიფიკაციო მონაცემს ხელახლა ამატებს. გამოქვეყნება დაუშვებელია მის მოცილებამდე.'}
    if(index>=0)results[index]=result;else results.push(result)
  }
  options.onResult?.([...results])
  return results.map(result=>({...result,key:result.key ?? planned.find(field=>field.label===result.field)?.field}))
}

export function verifyMyautoFields(doc: Document, vehicle: NormalizedVehicle, results: FieldResult[],plan?:FormField[]): FieldResult[] {
  const planned = plan ?? myautoFields(vehicle)
  return results.map(result => {
    if (result.status !== 'filled') return result
    const field = planned.find(f => f.label === result.field)
    if (!field) return result
    let valid = false
    if (field.mode === 'text') valid = doc.querySelector<HTMLInputElement>(field.selector!)?.value === field.value
    if (field.mode === 'choice') valid = doc.querySelector<HTMLInputElement>(field.verifySelector!)?.value === field.value
    if (field.mode === 'dropdown' && field.field === 'model' && result.match === 'custom') {
      valid=editableModelInput(doc)?.element.value===fullModel(vehicle)
    } else if (field.mode === 'dropdown' && field.dropdownKey && nativeDropdown(doc,field.dropdownKey)) {
      const control=nativeDropdown(doc,field.dropdownKey)!
      valid=control.value===result.optionId && control.selectedOptions[0]?.text.trim()===result.optionLabel
    } else if (field.mode === 'dropdown') {
      const selected = doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${field.dropdownKey}"]`)?.textContent ?? ''
      valid = matchesOption(selected, field.optionValue!) && !!result.optionId && doc.querySelector<HTMLInputElement>(`[data-testid="single-select-input-primaryFeatures.${field.dropdownKey}"]`)?.value === result.optionId
    }
    if (field.field === 'mileageKm') valid &&= doc.querySelector('[data-testid="single-select-value-primaryFeatures.mileageType"]')?.textContent?.trim() === 'კმ'
    return valid ? result : { key:field.field,field: result.field, status: 'unfilled',code:'verification',retryable:true, reason: 'საბოლოო შემოწმებისას მნიშვნელობა შეიცვალა ან ვერ დადასტურდა.' }
  })
}

export async function enforceDescriptionPrivacy(doc:Document,vin:string):Promise<boolean> {
  for(let attempt=0;attempt<3;attempt++) {
    const input=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')
    if(!input)return true
    const clean=sanitizeDescription(input.value,vin)
    if(clean===input.value)return true
    if(input.disabled || input.readOnly)return false
    const view=doc.defaultView!
    const prototype=input.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,clean)
    input.dispatchEvent(new view.Event('input',{bubbles:true}));input.dispatchEvent(new view.Event('change',{bubbles:true}))
    await settleField(doc,()=>sanitizeDescription(input.value,vin)===input.value)
  }
  const value=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')?.value ?? ''
  return sanitizeDescription(value,vin)===value
}

export { settleField }
