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
  const nodes=[...doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input[name],[data-testid="description-textarea"]')]
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
    const planned=myautoFields(vehicle)
    const filled=await fillMyautoForm(doc,vehicle,{planned,dropdownTimeoutMs:100})
    const checked=await verifyMyautoPersistence(doc,vehicle,filled,planned)
    check(checked.filter(field=>field.status==='filled'&&field.persisted).length===16,'staged: all 16 supported fields commit; only manual price/condition remain')
    check(textInputs===4 && changes===0 && focuses===0,'staged: independent native writes use one input event each; no per-field focus/blur/change probing')
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
    const description=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!
    check(description.value.length<=4000 && !description.value.includes(vehicle.vin),'staged: destination limit and VIN-only-dedicated-field rules remain')
  }finally{frame.remove()}
}
