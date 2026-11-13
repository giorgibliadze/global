import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
import {parseManheim24} from '../src/manheim24'
import {isMyautoControllerForm,textInteractive} from '../src/myautoContract'

export async function runStagedTests(manheim:string,html:string,check:(value:unknown,label:string)=>void){
  const vehicle=parseManheim24(new DOMParser().parseFromString(manheim,'text/html'))
  const frame=document.createElement('iframe');frame.style.width='1280px';document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  const counts:Record<string,number>={},labels:Record<string,string>={manufacturer:'BMW',model:'M5 Touring Wagon',issueYear:'2026',fuelType:'დამუხტვადი ჰიბრიდი',engineVolume:'4.4',cylinders:'8',vehicleCategory:'უნივერსალი'}
  let textInputs=0,changes=0,focuses=0,maxMenus=0
  const tab=doc.createElement('button');tab.type='button';tab.dataset.testid='description-locale-tab-ka';tab.setAttribute('aria-pressed','true');doc.body.append(tab)
  for(const input of doc.querySelectorAll<HTMLInputElement>('[data-testid^="single-select-input-"]'))input.className='opacity-0 pointer-events-none'
  const model=doc.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.model"]')!;model.style.pointerEvents='none'
  const nodes=[...doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input[name]:not([type="checkbox"]),[data-testid="description-textarea"]')]
  for(const input of nodes){input.addEventListener('input',()=>{textInputs++;input.defaultValue=input.value});input.addEventListener('change',()=>changes++);input.addEventListener('focus',()=>focuses++)}
  for(const [key,label] of Object.entries(labels)){
    const owner=doc.querySelector<HTMLElement>(`[data-testid="single-select-primaryFeatures.${key}"]`)!,trigger=owner.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
    trigger.onclick=()=>{
      const existing=owner.querySelector('[data-testid^="single-select-dropdown-"]');if(existing){existing.remove();return}
      counts[key]=(counts[key]??0)+1
      const list=doc.createElement('div');list.dataset.testid='single-select-dropdown-primaryFeatures.'+key
      const option=doc.createElement('div');option.dataset.testid='single-select-option-primaryFeatures.'+key+'-actual-'+key;option.textContent=label
      option.onclick=()=>{
        owner.querySelector('[data-testid^="single-select-value-"]')!.textContent=label
        if(!owner.querySelector('[data-testid^="single-select-clear-"]')){const clear=doc.createElement('span');clear.dataset.testid='single-select-clear-primaryFeatures.'+key;owner.append(clear)}
        list.remove()
        if(key==='manufacturer')queueMicrotask(()=>{model.style.pointerEvents='auto'})
      }
      list.append(option);owner.append(list)
      maxMenus=Math.max(maxMenus,doc.querySelectorAll('[data-testid^="single-select-dropdown-primaryFeatures."]').length)
    }
  }
  for(const control of doc.querySelectorAll<HTMLElement>('[data-testid^="single-checkbox-primaryFeatures."]'))control.onclick=()=>{control.className='border-[#02cc59] bg-[#02cc59]/10'}
  try{
    check(isMyautoControllerForm(doc),'staged: selects the confirmed MyAuto Controller contract')
    const form=doc.querySelector('form')!;form.style.visibility='hidden'
    check(!textInteractive(doc),'staged: present but loading/invisible text controls are not interactive')
    form.style.visibility='visible';check(textInteractive(doc),'staged: actual loading visibility transition enables text plan')
    const description=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!
    description.value='მომხმარებლის აღწერა';description.defaultValue=description.value
    let descriptionEvents=0;description.addEventListener('input',()=>descriptionEvents++)
    const price=doc.querySelector<HTMLInputElement>('[name="sale.price"]')!;price.value='25000'
    const negotiable=doc.querySelector<HTMLInputElement>('[name="sale.isNegotiablePrice"]')!
    let clicks=0;negotiable.addEventListener('click',()=>clicks++)
    const planned=myautoFields(vehicle)
    // A stale prepared payload must not bypass the new no-description/no-price policy.
    planned.push({field:'description',label:'აღწერა',mode:'text',selector:'[data-testid="description-textarea"]',value:'ძველი აღწერა'})
    const filled=await fillMyautoForm(doc,vehicle,{planned,dropdownTimeoutMs:100})
    const checked=await verifyMyautoPersistence(doc,vehicle,filled,planned)
    check(checked.filter(field=>field.status==='filled'&&field.persisted).length===17,'staged: all 17 supported fields commit; description skipped and condition manual')
    check(textInputs===3 && changes===0 && focuses===0,'staged: independent native writes use one input event each; no per-field focus/blur/change probing')
    check(maxMenus===1 && Object.values(counts).every(count=>count===1),'staged: dropdowns are serialized and inspected once')
    check(doc.querySelector<HTMLInputElement>('[data-testid="single-select-input-primaryFeatures.manufacturer"]')!.value==='','staged: manufacturer succeeds without fabricating a tracking-input ID')
    const mileage=doc.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!;mileage.value='';mileage.defaultValue=''
    const lost=await verifyMyautoPersistence(doc,vehicle,checked,planned)
    check(lost.find(field=>field.key==='mileageKm')?.code==='verification','staged: final pass observes a genuine committed-value reset')
    const before={...counts}
    const repaired=await fillMyautoForm(doc,vehicle,{planned,onlyFields:['mileageKm'],recoveringFields:['mileageKm'],previousResults:lost})
    check(repaired.find(field=>field.key==='mileageKm')?.persisted && JSON.stringify(before)===JSON.stringify(counts),'staged: targeted text repair does not reopen successful dropdowns')
    mileage.value='999';mileage.defaultValue='999'
    const manual=await fillMyautoForm(doc,vehicle,{planned,onlyFields:['mileageKm'],previousResults:repaired})
    check(manual.find(field=>field.key==='mileageKm')?.code==='protected' && mileage.value==='999','staged: later manual edits remain untouched')
    check(description.value==='მომხმარებლის აღწერა' && descriptionEvents===0 && !checked.some(field=>field.key==='description'),'staged: stale prepared descriptions, verification and retries never touch the textarea')
    check(negotiable.checked && clicks===1 && price.value==='25000','staged: negotiable enabled once; auction price never written and manual price preserved when site does not clear it')
    const again=await fillMyautoForm(doc,vehicle,{onlyFields:['price']})
    check(negotiable.checked && clicks===1 && again[0].persisted,'staged: already enabled negotiable is not toggled off')
    negotiable.checked=false
    const lostPrice=await verifyMyautoPersistence(doc,vehicle,checked,planned)
    check(lostPrice.some(field=>field.key==='price'&&!field.persisted),'staged: final verification detects negotiable reset')
    negotiable.remove()
    const missing=await fillMyautoForm(doc,vehicle,{onlyFields:['price','description']})
    check(missing.length===1 && missing[0].code==='manual' && !missing[0].retryable && price.value==='25000','staged: unavailable negotiable is manual without blocking or price fallback')
  }finally{frame.remove()}
}
