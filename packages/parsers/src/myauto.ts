import {enableNegotiablePrice,negotiableSelected,negotiableSelector} from './negotiablePrice'
import {isMyautoControllerForm} from './myautoContract'
import {fillStagedMyauto,readStagedFields} from './stagedMyauto'
import {commitTurn} from './inputInteraction'
import { fitDescription } from './descriptionFit'
import type { PreparedFormField } from '@auto-importer/shared'
import { probePersistence, writeControlledInput, activateOption } from './inputInteraction'
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

export interface FormField extends PreparedFormField {optionValue?:DropdownValue}
const testid = (id: string) => `[data-testid="${id}"]`
const fullModel=(vehicle:NormalizedVehicle)=>vehicle.fullModelName ?? vehicle.model
export function myautoModelName(vehicle:NormalizedVehicle):string|undefined {
  const full=fullModel(vehicle),base=vehicle.baseModel,trim=vehicle.trim
  // Use only independently labeled source model/trim, never guessed word offsets.
  // Retain complete compound models when the suffix is not a verified trim.
  return full && base && trim && vehicle.original.catalogModel===base && full.startsWith(`${base} ${trim} `)?base:full
}
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
  ]
  for (const [field, label, key, value] of [
    ['make', 'მწარმოებელი', 'manufacturer', v.make], ['model', 'მოდელი', 'model', myautoModelName(v)],
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
  fields.push(negotiableField())
  fields.push({ field: 'condition', label: 'მდგომარეობა', mode: 'manual', value: v.condition, reason: 'ხელით შესავსები' })
  
  return fields
}

const negotiableField=():FormField=>({field:'price',label:'ფასი',mode:'toggle',selector:negotiableSelector,value:'true'})
// Apply policy even to payloads prepared by an older extension version.
export function applyAutofillPolicy(fields:FormField[]):FormField[]{
  return [...fields.filter(field=>!['description','price'].includes(field.field)),negotiableField()]
}

export interface FillOptions { planned?:FormField[];recoveringFields?:string[];onlyFields?:string[];previousResults?:FieldResult[];onField?:(label:string)=>void;onFieldStage?:(stage:'discovery'|'matching'|'selection')=>void; onTiming?: (stage:TimingStage,ms:number)=>void; allowAutofillCorrection?: boolean; dropdownTimeoutMs?: number; signal?: AbortSignal; beforeField?: () => void; onResult?: (results: FieldResult[]) => void | Promise<void> }
export async function fillMyautoForm(doc: Document, vehicle: NormalizedVehicle, options: FillOptions = {}): Promise<FieldResult[]> {
  const safePlan=applyAutofillPolicy(options.planned ?? myautoFields(vehicle))
  if(isMyautoControllerForm(doc))return fillStagedMyauto(doc,vehicle,safePlan,options)
  const results: FieldResult[] = (options.previousResults ?? []).filter(result=>result.key!=='description' && result.field!=='აღწერა').map(result=>({...result}))
  const normalizationStarted=performance.now()
  const planned = safePlan
  options.onTiming?.('normalization',performance.now()-normalizationStarted)
  for(let i=results.length-1;i>=0;i--)if(options.onlyFields?.includes(results[i].key ?? planned.find(field=>field.label===results[i].field)?.field ?? ''))results.splice(i,1)
  const verify=async(predicate:()=>boolean)=>{const started=performance.now();try{return await settleField(doc,predicate,options.signal)}finally{options.onTiming?.('fieldVerification',performance.now()-started)}}
  const selectedAtStart=(field:FormField)=>nativeDropdown(doc,field.dropdownKey!)?.value ?? (field.field==='model'?editableModelInput(doc)?.element.value:undefined) ?? doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${field.dropdownKey}"]`)?.textContent?.trim()
  const initiallyEmpty = new Set(planned.filter(f=>f.mode==='dropdown' && !selectedAtStart(f)).map(f=>f.field))
  const userEdited = new Set<string>()
  const protectUserEdit = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof doc.defaultView!.Element)) return
    for (const f of planned) {
      const owner = f.dropdownKey?doc.querySelector(`[data-testid="single-select-primaryFeatures.${f.dropdownKey}"]`) ?? nativeDropdown(doc,f.dropdownKey) ?? (f.field==='model'?editableModelInput(doc)?.element:undefined):f.selector?doc.querySelector(f.selector):null
      if(owner?.contains(event.target) && (event.type!=='pointerdown' || f.mode!=='text'))userEdited.add(f.field)
    }
  }
  const editEvents=['pointerdown','keydown','input','change']
  for(const type of editEvents)doc.addEventListener(type,protectUserEdit,true)
  // Independent inputs must not wait behind an unavailable dropdown. Shared-overlay
  // dropdowns remain serialized, with manufacturer before its dependent model.
  const ordered = options.recoveringFields?.length ? [...planned.filter(f=>f.mode==='dropdown'),...planned.filter(f=>f.mode!=='dropdown')] : [...planned.filter(f => f.mode !== 'dropdown'), ...planned.filter(f => f.mode === 'dropdown')]
  try {
  for (const field of ordered) {
    if(options.onlyFields && !options.onlyFields.includes(field.field))continue
    options.signal?.throwIfAborted()
    options.beforeField?.()
    options.onField?.(field.label)
    const fail = (reason:string,code:FieldFailureCode='unresolved',retryable=['unavailable','verification'].includes(code)) => results.push({key:field.field,field:field.label,status:'unfilled',reason,code,retryable})
    let omissions:string[]|undefined,reviewRequired=false
    let diagnostic:DropdownDiagnostic | undefined
    const descriptor={...field.optionValue!,interaction:'pointer' as const,onPhase:options.onFieldStage,onDiagnostic:(item:DropdownDiagnostic)=>{diagnostic=item;reportDropdown(item);options.onTiming?.('dropdownDiscovery',item.discoveryMs ?? 0);options.onTiming?.('dropdownSelection',item.selectionMs ?? 0);options.onTiming?.('matching',item.matchingMs ?? 0);options.onTiming?.('fieldVerification',item.verificationMs ?? 0)}}
    const dropdownFailure=(reason:string)=>diagnostic?.outcome==='unverified'?results.push({key:field.field,field:field.label,status:'unverified',persisted:false,code:'unverified',retryable:false,reason}):fail(reason,diagnostic?.outcome==='protected'?'protected':diagnostic && ['unavailable','not-discovered','interaction-error'].includes(diagnostic.outcome)?'unavailable':diagnostic?.outcome==='not-verified'?'verification':'unresolved')
    const resultStart=results.length
    try {
    if(field.mode==='toggle'){results.push(await enableNegotiablePrice(doc,options.signal));continue}
    if (field.value === undefined || field.value === '') { fail('წყაროში მონაცემი არ არის ან შესაბამისობა დაუდასტურებელია.','missing'); continue }
    if (field.mode === 'dropdown') {
      if (field.field === 'model' && !results.some(r => r.field === 'მწარმოებელი' && r.status === 'filled')) { fail('ჯერ საჭიროა მწარმოებლის დადასტურებული არჩევანი.','dependency',results.some(result=>result.field==='მწარმოებელი' && result.retryable)); continue }
      if (field.field === 'model' && editableModelInput(doc) && !nativeDropdown(doc,'model') && !interactive(doc,'model')) {
        const error=await fillEditableModel(doc,myautoModelName(vehicle)!,((options.allowAutofillCorrection === true && initiallyEmpty.has(field.field)) || options.recoveringFields?.includes(field.field)===true) && !userEdited.has(field.field))
        if(error)fail(`${MYAUTO_MODEL_WARNING} ${error}`)
        else results.push({field:field.label,status:'filled',persisted:true,reason:'სრული ორიგინალური მოდელი შეყვანილია მოდელის რედაქტირებად ველში.',match:'custom',optionLabel:myautoModelName(vehicle)})
        continue
      }
      if (field.dropdownKey && nativeDropdown(doc,field.dropdownKey)) {
        const selected=await selectNativeDropdown(doc,field.dropdownKey,field.value,((options.allowAutofillCorrection === true && initiallyEmpty.has(field.field)) || options.recoveringFields?.includes(field.field)===true) && !userEdited.has(field.field),descriptor,options.dropdownTimeoutMs,options.signal)
        if(selected.error){if(field.field==='model' && editableModelInput(doc)){const error=await fillEditableModel(doc,myautoModelName(vehicle)!);if(!error){results.push({field:field.label,status:'filled',persisted:true,match:'custom',optionLabel:myautoModelName(vehicle),reason:'სრული მოდელი შეყვანილია რედაქტირებად ველში.'});continue}}dropdownFailure([field.field==='model'?MYAUTO_MODEL_WARNING:undefined,selected.error,myautoCatalogHint(field.dropdownKey,field.value)].filter(Boolean).join(' '))}
        else results.push({field:field.label,status:'filled',reason:'ზუსტი ვარიანტი დადასტურებულია.',...selected.selection})
        continue
      }
      let selection: DropdownSelection | undefined
      options.onFieldStage?.('discovery')
      const reason = await selectDropdown(doc, field.dropdownKey!, {...descriptor,allowReplaceSelection:((options.allowAutofillCorrection === true && initiallyEmpty.has(field.field)) || options.recoveringFields?.includes(field.field)===true) && !userEdited.has(field.field),onSelected:value => {selection=value}}, options.dropdownTimeoutMs, options.signal)
      if(reason && field.field==='model' && diagnostic?.outcome!=='protected' && editableModelInput(doc)){const error=await fillEditableModel(doc,myautoModelName(vehicle)!);if(!error){results.push({field:field.label,status:'filled',persisted:true,match:'custom',optionLabel:myautoModelName(vehicle),reason:'სრული მოდელი შეყვანილია რედაქტირებად ველში.'});continue}}
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
      } else results.push({key:field.field,field:field.label,status:'unverified',persisted:false,code:'unverified',retryable:false,reason:'არჩევანი დაჭერილია, მაგრამ ფორმის შენახული მდგომარეობა ვერ გადამოწმდა. გადაამოწმეთ ხელით.'})
      continue
    }
    if (field.field === 'mileageKm' && doc.querySelector(testid('single-select-value-primaryFeatures.mileageType'))?.textContent?.trim() !== 'კმ') {
      options.onFieldStage?.('discovery')
      const reason = await selectDropdown(doc, 'mileageType', { candidates: ['კმ'] }, options.dropdownTimeoutMs, options.signal)
      if (reason) { fail('გარბენის ერთეული „კმ“ ვერ დადასტურდა.'); continue }
    }
    if (!(element instanceof doc.defaultView!.HTMLInputElement || element instanceof doc.defaultView!.HTMLTextAreaElement)) { fail('ველის ტიპი შეიცვალა.'); continue }
    if(field.field==='description'){const fitted=fitDescription(field.value,element.maxLength,vehicle.vin);field.value=fitted.text;omissions=fitted.omissions;reviewRequired=fitted.criticalOmitted;if(!field.value){fail('სრული დასახელება აღწერის ლიმიტში ვერ ეტევა. სრული მონაცემები შენარჩუნებულია.','manual');continue}}
    if (element.maxLength > 0 && field.value.length > element.maxLength) { fail('ტექსტი აღემატება ფორმის დაშვებულ სიგრძეს. მონაცემები არ შემოკლებულა; ორიგინალი შენარჩუნებულია.'); continue }
    if (element.disabled || element.readOnly) { fail('ველი მიუწვდომელია.','unavailable'); continue }
    if (element.value && element.value !== field.value && !options.recoveringFields?.includes(field.field)) { fail('არსებული მნიშვნელობა არ გადაგვიწერია.','protected'); continue }
    if(userEdited.has(field.field) && doc.querySelector<HTMLInputElement|HTMLTextAreaElement>(field.selector!)?.value!==field.value){fail('მომხმარებლის შეცვლილი ველი ავტომატურად არ გადაგვიწერია.','protected');continue}
    const persisted=await writeControlledInput(doc,()=>doc.querySelector<HTMLInputElement|HTMLTextAreaElement>(field.selector!),field.value,options.signal,()=>!userEdited.has(field.field),options.recoveringFields?.includes(field.field))
    if(persisted)results.push({field:field.label,status:'filled',persisted:true,omissions,reviewRequired,reason:'შევსებულია და შენარჩუნებულია'})
    else fail('მნიშვნელობა ვერ შენარჩუნდა','verification')

    } finally {
      const index=results.findIndex((result,offset)=>offset>=resultStart && result.field===field.label)
      const result=results[index]
      if(result?.status==='filled' && !result.persisted) {
        const resolve=()=>field.mode==='dropdown' ? result.match==='custom'?editableModelInput(doc)?.element:nativeDropdown(doc,field.dropdownKey!) ?? interactive(doc,field.dropdownKey!) : field.selector?doc.querySelector<HTMLElement>(field.selector):undefined
        const valid=()=>verifyMyautoFields(doc,vehicle,[result],planned)[0]?.status==='filled'
        let persisted=await probePersistence(doc,resolve,valid,options.signal)
        // One supported alternate interaction, never a whole-form restart or a blind
        // overwrite of a different user-selected value.
        if(!persisted && !userEdited.has(field.field)) {
          if(field.mode==='dropdown' && result.match==='custom')persisted=!(await fillEditableModel(doc,myautoModelName(vehicle)!))
          else if(field.mode==='dropdown' && !nativeDropdown(doc,field.dropdownKey!)) {
            const current=doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${field.dropdownKey}"]`)?.textContent?.trim()
            if(!current){let selected:DropdownSelection|undefined;const error=await selectDropdown(doc,field.dropdownKey!,{...descriptor,interaction:'pointer',onSelected:option=>{selected=option}},options.dropdownTimeoutMs,options.signal);if(!error && selected){Object.assign(result,selected);persisted=await probePersistence(doc,resolve,valid,options.signal)}}
          }else if(field.mode==='choice' && field.selector && doc.querySelector<HTMLInputElement>(field.verifySelector!)?.value==='') {
            const control=doc.querySelector<HTMLElement>(field.selector);if(control){activateOption(control,'pointer',options.signal);persisted=await probePersistence(doc,resolve,valid,options.signal)}
          }
        }
        if(persisted){result.persisted=true;result.reason='შევსებულია და შენარჩუნებულია'}
        else results[index]={...result,status:'unfilled',persisted:false,code:'verification',retryable:!userEdited.has(field.field),reason:'მნიშვნელობა ვერ შენარჩუნდა'}
      }
      if(field.mode==='dropdown' && result?.status==='filled') {
        // Observe only. Refill later, after all dependency-changing operations and
        // photo side effects have settled. This records sequence, not causation.
        for(let offset=0;offset<results.length;offset++) {
          const previous=results[offset]
          if(offset===index || previous.status!=='filled')continue
          const checked=verifyMyautoFields(doc,vehicle,[previous],planned)[0]
          if(checked.status!=='filled'){
            const key=previous.key ?? planned.find(item=>item.label===previous.field)?.field
            results[offset]=userEdited.has(key ?? '')?{...checked,code:'protected',retryable:false,reason:'მომხმარებლის შეცვლილი ველი ავტომატურად არ გადაგვიწერია.'}:{...checked,resetAfter:field.field,reason:`მნიშვნელობა შეიცვალა ველის „${field.label}“ ოპერაციის შემდეგ; საჭიროა გადამოწმება.`}
          }
        }
      }
      await options.onResult?.(results.map(result=>({...result,key:result.key ?? planned.find(item=>item.label===result.field)?.field})))
    }

  }
  } finally {for(const type of editEvents)doc.removeEventListener(type,protectUserEdit,true)}
  await options.onResult?.([...results])
  return results.map(result=>({...result,key:result.key ?? planned.find(field=>field.label===result.field)?.field}))
}

export function verifyMyautoFields(doc: Document, vehicle: NormalizedVehicle, results: FieldResult[],plan?:FormField[]): FieldResult[] {
  const planned = applyAutofillPolicy(plan ?? myautoFields(vehicle))
  results=results.filter(result=>result.key!=='description' && result.field!=='აღწერა')
  if(isMyautoControllerForm(doc))return readStagedFields(doc,vehicle,results,planned)
  return results.map(result => {
    if (result.status !== 'filled') return result
    const field = planned.find(f => f.label === result.field)
    if (!field) return result
    if(field.mode==='toggle')return negotiableSelected(doc)?{...result,status:'filled',persisted:true}: {...result,status:'unfilled',persisted:false,code:'verification',retryable:false,reason:'ხელით შესავსები'}
    let valid = false
    if(field.mode==='text'){const control=doc.querySelector<HTMLInputElement|HTMLTextAreaElement>(field.selector!);const expected=field.field==='description' && field.value!==undefined?fitDescription(field.value,control?.maxLength ?? -1,vehicle.vin).text:field.value;valid=control?.value===expected}
    if (field.mode === 'choice') valid = doc.querySelector<HTMLInputElement>(field.verifySelector!)?.value === field.value
    if (field.mode === 'dropdown' && field.field === 'model' && result.match === 'custom') {
      valid=editableModelInput(doc)?.element.value===myautoModelName(vehicle)
    } else if (field.mode === 'dropdown' && field.dropdownKey && nativeDropdown(doc,field.dropdownKey)) {
      const control=nativeDropdown(doc,field.dropdownKey)!
      valid=control.value===result.optionId && control.selectedOptions[0]?.text.trim()===result.optionLabel
    } else if (field.mode === 'dropdown') {
      const selected = doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${field.dropdownKey}"]`)?.textContent ?? ''
      valid = matchesOption(selected, field.optionValue!) && !!result.optionId && doc.querySelector<HTMLInputElement>(`[data-testid="single-select-input-primaryFeatures.${field.dropdownKey}"]`)?.value === result.optionId
    }
    if (field.field === 'mileageKm') valid &&= doc.querySelector('[data-testid="single-select-value-primaryFeatures.mileageType"]')?.textContent?.trim() === 'კმ'
    return valid ? result : { key:field.field,field: result.field, status: 'unfilled',persisted:false,code:'verification',retryable:true, reason: 'საბოლოო შემოწმებისას მნიშვნელობა შეიცვალა ან ვერ დადასტურდა.' }
  })
}

export { settleField }

export async function verifyMyautoPersistence(doc:Document,vehicle:NormalizedVehicle,results:FieldResult[],planned=myautoFields(vehicle),signal?:AbortSignal,only?:string[]):Promise<FieldResult[]> {
  planned=applyAutofillPolicy(planned);results=results.filter(result=>result.key!=='description' && result.field!=='აღწერა')
  if(isMyautoControllerForm(doc)){await commitTurn(doc,signal);return readStagedFields(doc,vehicle,results,planned,only)}
  const checked=verifyMyautoFields(doc,vehicle,results,planned)
  for(let index=0;index<checked.length;index++){
    const result=checked[index]
    if(result.status!=='filled' || result.evidence==='negotiable')continue
    const field=planned.find(item=>item.label===result.field)
    if(!field)continue
    const resolve=()=>field.mode==='dropdown'?result.match==='custom'?editableModelInput(doc)?.element:nativeDropdown(doc,field.dropdownKey!) ?? interactive(doc,field.dropdownKey!):field.selector?doc.querySelector<HTMLElement>(field.selector):undefined
    const valid=()=>verifyMyautoFields(doc,vehicle,[result],planned)[0]?.status==='filled'
    if(await probePersistence(doc,resolve,valid,signal)){result.persisted=true;result.reason='შევსებულია და შენარჩუნებულია'}
    else checked[index]={...result,status:'unfilled',persisted:false,code:'verification',retryable:true,reason:'მნიშვნელობა ვერ შენარჩუნდა'}
  }
  return checked
}

export {isMyautoControllerForm,textInteractive} from './myautoContract'
