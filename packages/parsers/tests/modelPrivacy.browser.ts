import { parseManheim24 } from '../src/manheim24'
import { fillMyautoForm, vehicleDescription, verifyMyautoFields, enforceDescriptionPrivacy } from '../src/myauto'
import { editableModelInput } from '../src/modelField'
import { sanitizeDescription } from '../src/vinPrivacy'

export async function runModelPrivacyTests(manheim:string,myauto:string,check:(value:unknown,label:string)=>void) {
  const vehicle=parseManheim24(new DOMParser().parseFromString(manheim,'text/html'))
  const vin=vehicle.vin,foreign='2HGCM82633A004352'
  const noisy={...vehicle,description:`ახალი საბურავები. VIN Code: ${vin}; ტექნიკური შემოწმება გავლილია.`,announcements:[`Vehicle Identification Number: ${vin.toLowerCase()}; გასაღები მოყვება.`,`შასის ნომერი: ${vin}; დამატებითი გასაღები`,`საიდენტიფიკაციო ნომერი: ${foreign}`],equipment:[`VIN: ${vin}`,`Black Grille`,`${foreign}`],optionalEquipmentSummary:`კარბონის პაკეტი; VIN ${vin}`}
  const description=vehicleDescription(noisy)
  check(!description.toUpperCase().includes(vin) && !description.includes(foreign),'selected and foreign VINs removed from all generated dynamic description sections')
  check(!/\bVIN\b|Vehicle Identification Number|შასის ნომერი|საიდენტიფიკაციო ნომერი/i.test(description),'all description-specific VIN labels removed')
  check(description.includes('BMW M5 Touring Wagon') && description.includes('კომპლექტაცია: Base') && description.includes('ახალი საბურავები') && description.includes('გასაღები მოყვება') && description.includes('შავი ცხაური'),'sanitized Georgian description preserves exact identity and readable non-VIN details')
  const onlyVinNotes=vehicleDescription({...vehicle,description:`VIN: ${vin}`,announcements:[`VIN: ${vin}`],equipment:[`VIN: ${vin}`]})
  check(!onlyVinNotes.includes('აუქციონის შენიშვნები:') && !onlyVinNotes.includes('აღჭურვილობა:'),'VIN-only copied sections do not leave empty description headings')
  const variants=[vin.toLowerCase(),vin.slice(0,8)+' '+vin.slice(8),[...vin].join('-'),[...vin].join('\u200b'),[...vin].map(c=>`&#${c.charCodeAt(0)};`).join(''),[...vin].map(c=>`%${c.charCodeAt(0).toString(16)}`).join(''),[...vin].map(c=>String.fromCharCode(c.charCodeAt(0)+0xfee0)).join('')]
  for(const [index,value] of variants.entries())check(sanitizeDescription(`მანქანა\nVIN Code: ${value}\nსაბურავები ახალია`,vin)==='მანქანა\nსაბურავები ახალია',`VIN redaction preserves other lines for encoding/layout ${index+1}`)
  check(sanitizeDescription(`შენიშვნა: VIN Code: ${foreign.slice(0,3)}-${foreign.slice(3,9)}-${foreign.slice(9)}; ახალი ზეთი`,vin).includes('ახალი ზეთი') && !sanitizeDescription(`VIN Code: ${foreign.slice(0,3)}-${foreign.slice(3,9)}-${foreign.slice(9)}`,vin).includes('2HG'),'labeled foreign formatted VIN also removed')
  check(sanitizeDescription('BMW M5  Touring Wagon\nVinyl interior',vin)==='BMW M5  Touring Wagon\nVinyl interior','privacy cleanup never renames models or matches VIN inside unrelated words')
  check(!sanitizeDescription('შენიშვნა: VIN Code: TESTVIN123; ახალი ზეთი','TESTVIN123').includes('TESTVIN123'),'privacy of an explicitly supplied identifier does not depend on VIN validation succeeding')
  check(sanitizeDescription(`2026 Honda e:\nVIN: ${vin}\nBase+`,vin)==='2026 Honda e:\nBase+','VIN cleanup preserves punctuation in exact model and trim names')
  check(sanitizeDescription(description,vin)===description,'final description sanitizer is idempotent')

  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!
  function reset(){doc.open();doc.write(myauto);doc.close();doc.querySelector('[data-testid="single-select-value-primaryFeatures.manufacturer"]')!.textContent='BMW';doc.querySelector<HTMLInputElement>('[data-testid="single-select-input-primaryFeatures.manufacturer"]')!.value='fixture-bmw-id'}
  reset()
  check(!editableModelInput(doc),'hidden model tracker/search is not mistaken for a free-text custom model input')
  const model=doc.createElement('input');model.name='primaryFeatures.model'
  doc.querySelector('[data-testid="single-select-primaryFeatures.model"]')!.append(model)
  const result=await fillMyautoForm(doc,noisy,{dropdownTimeoutMs:20})
  check(model.value==='M5 Touring Wagon' && result.find(r=>r.field==='მოდელი')?.match==='custom','complete model entered into the actual editable Model field')
  check(doc.querySelector<HTMLInputElement>('[name="primaryFeatures.customModel"]')!.value==='Base','Touring Wagon is not moved into the trim field')
  check(doc.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!.value===vin,'VIN transferred to dedicated VIN field')
  check([...doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')].filter(input=>input.name!=='primaryFeatures.vinCode').every(input=>!input.value.toUpperCase().includes(vin)),'dedicated VIN control is the only control containing the VIN')
  check(verifyMyautoFields(doc,noisy,result).find(r=>r.field==='მოდელი')?.status==='filled','editable full model verified in Model field rather than description or body')
  const textarea=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!
  textarea.value=`${textarea.value}\nVIN: ${vin}`
  check(await enforceDescriptionPrivacy(doc,vin) && !textarea.value.includes(vin),'final form boundary also removes later site-generated VIN text')

  reset()
  const select=doc.createElement('select');select.name='primaryFeatures.model'
  for(const [label,value] of [['',''],['M5','short'],['5 Series','family'],['M5 Touring Wagon','exact-model']]){const option=doc.createElement('option');option.text=label;option.value=value;select.add(option)}
  doc.querySelector('[data-testid="single-select-primaryFeatures.model"]')!.append(select)
  const nativeResult=await fillMyautoForm(doc,vehicle,{dropdownTimeoutMs:20})
  check(select.value==='exact-model' && select.selectedOptions[0].text==='M5 Touring Wagon' && nativeResult.find(r=>r.field==='მოდელი')?.optionId==='exact-model','native predefined Model field selects exact full designation and records accepted ID')
  select.value='';select.querySelector('option[value="exact-model"]')!.remove()
  const unresolved=await fillMyautoForm(doc,vehicle,{dropdownTimeoutMs:20})
  check(select.value==='' && unresolved.find(r=>r.field==='მოდელი')?.status==='unfilled','unsupported full model never falls back to M5 or 5 Series')

  reset();doc.querySelector('[name="primaryFeatures.vinCode"]')!.remove()
  const writable=doc.createElement('input');writable.name='primaryFeatures.model';doc.querySelector('[data-testid="single-select-primaryFeatures.model"]')!.append(writable)
  const missingVin=await fillMyautoForm(doc,noisy,{dropdownTimeoutMs:20})
  check(missingVin.find(r=>r.field==='VIN')?.status==='unfilled' && writable.value==='M5 Touring Wagon','missing VIN field reported internally without moving VIN into Model')
  check([...doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')].every(input=>!input.value.toUpperCase().includes(vin)),'missing dedicated VIN field cannot leak VIN into any fallback text control')
  check(doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!.value.includes('ახალი საბურავები'),'missing VIN field still permits a readable sanitized description')
  frame.remove()
}
