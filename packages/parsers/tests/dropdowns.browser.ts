import { myautoManufacturerLabels, manufacturerOptionLabel, knownMyautoYears } from '../src/myautoCatalog'
import { selectNativeDropdown } from '../src/modelField'
import { selectDropdown, optionRank } from '../src/dropdowns'
import { fillMyautoForm, verifyMyautoFields, myautoFields } from '../src/myauto'
import { parseManheim24 } from '../src/manheim24'
import { safeExpected } from '../src/dropdownDiagnostics'
import type { DropdownDiagnostic } from '../src/dropdownDiagnostics'

export async function runDropdownTests(manheim:string,myauto:string,check:(value:unknown,label:string)=>void) {
  check(new Set(myautoManufacturerLabels).size===myautoManufacturerLabels.length && ['Ford',"Yuanxin Energy's",'Great wall','Lynk & Co','INEOS'].every(label=>myautoManufacturerLabels.includes(label)),'catalog: supplied manufacturer spellings retained without invented IDs')
  check(manufacturerOptionLabel('FORD')==='Ford' && manufacturerOptionLabel('Land Rover')==='Land Rover' && manufacturerOptionLabel('Rover')==='Rover' && manufacturerOptionLabel('GM')===undefined,'catalog: case-only matching does not substitute related or partial manufacturer names')
  const years2026=knownMyautoYears(new Date(2026,5,1)),years2027=knownMyautoYears(new Date(2027,0,1))
  check(years2026.length===37 && years2026[0]===1990 && years2026.at(-1)===2026 && years2027.at(-1)===2027 && knownMyautoYears(new Date(2030,0,1)).at(-1)===2030,'catalog: year range begins at 1990 and automatically grows after 2026')
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(myauto);doc.close()
  const diagnostics:DropdownDiagnostic[]=[]
  const opts=(candidates:string[])=>({candidates,onDiagnostic:(item:DropdownDiagnostic)=>diagnostics.push(item)})
  function control(key:string) {
    const owner=doc.querySelector<HTMLElement>(`[data-testid="single-select-primaryFeatures.${key}"]`)!
    const trigger=owner.querySelector<HTMLElement>(`[data-testid="single-select-trigger-primaryFeatures.${key}"]`)!
    trigger.tabIndex=0
    return {owner,trigger}
  }
  function choose(key:string,label:string,id:string) {
    doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${key}"]`)!.textContent=label
    doc.querySelector<HTMLInputElement>(`[data-testid="single-select-input-primaryFeatures.${key}"]`)!.value=id
  }
  function option(key:string,label:string,id:string,box:HTMLElement) {
    const node=doc.createElement('div');node.setAttribute('role','option');node.textContent=label
    node.onclick=()=>{choose(key,label,id);box.remove();control(key).trigger.setAttribute('aria-expanded','false')}
    box.append(node);return node
  }
  function box(id:string) { const list=doc.createElement('div');list.id=id;list.setAttribute('role','listbox');return list }
  try {
    let escapes=0
    doc.addEventListener('keydown',event=>{if(event.key==='Escape')escapes++})
    const {trigger}=control('manufacturer')
    trigger.onclick=()=>{
      const wrapper=doc.createElement('div');wrapper.id='portal-wrapper'
      const list=box('portal-options');wrapper.append(list);doc.body.append(wrapper)
      trigger.setAttribute('aria-owns',wrapper.id);trigger.setAttribute('aria-expanded','true')
      setTimeout(()=>option('manufacturer','Ford','fixture-ford',list),35)
    }
    check(await selectDropdown(doc,'manufacturer',opts(['Ford']),500)===undefined,'dropdown: aria-owns portal wrapper and asynchronous options discovered')
    check(escapes===0,'dropdown: a closed successful menu does not dispatch Escape to unrelated page handlers')
    check(diagnostics.at(-1)?.verified && diagnostics.at(-1)?.matched && diagnostics.at(-1)?.optionCount===1,'dropdown: successful selection confirmed by actual label and tracking value')
    const {trigger:modelTrigger}=control('model');modelTrigger.setAttribute('aria-disabled','true')
    setTimeout(()=>modelTrigger.removeAttribute('aria-disabled'),40)
    let searches=0
    modelTrigger.onclick=()=>{
      const list=box('searchable-model-list');doc.body.append(list)
      modelTrigger.setAttribute('aria-controls',list.id);modelTrigger.setAttribute('aria-expanded','true')
      const input=doc.createElement('input');input.type='search';input.setAttribute('role','searchbox');list.append(input)
      input.addEventListener('input',()=>{searches++;setTimeout(()=>option('model','Ranger XLT Crew Cab Medium Bed','fixture-full-ranger',list),30)})
    }
    check(await selectDropdown(doc,'model',{...opts(['Ranger XLT Crew Cab Medium Bed']),exactText:true},700)===undefined && searches===1,'dropdown: dependent model waits for enabled control, searches and retains complete designation')
    check(doc.querySelector('[data-testid="single-select-value-primaryFeatures.model"]')!.textContent==='Ranger XLT Crew Cab Medium Bed','dropdown: full Ranger designation remains in actual Model field')

    const old=box('unrelated-old');doc.body.append(old);option('issueYear','2019','must-not-click',old)
    const year=control('issueYear')
    year.trigger.onclick=()=>{const list=box('fresh-unlinked-year');doc.body.append(list);option('issueYear','2019','fixture-2019',list)}
    check(await selectDropdown(doc,'issueYear',opts(['2019']),400)===undefined && !!old.isConnected,'dropdown: unique newly opened unlinked portal selected without clicking existing unrelated options')
    check(doc.querySelector<HTMLInputElement>('[data-testid="single-select-input-primaryFeatures.issueYear"]')!.value==='fixture-2019','dropdown: year option ID verified')
    old.remove()
    const fuel=control('fuelType');fuel.trigger.id='fuel-trigger'
    fuel.trigger.onclick=()=>{const list=box('labelled-fuel');list.setAttribute('aria-labelledby',fuel.trigger.id);doc.body.append(list);option('fuelType','ბენზინი','fixture-gasoline',list)}
    check(await selectDropdown(doc,'fuelType',{...opts(['Gasoline']),equivalents:['ბენზინი']},400)===undefined,'dropdown: aria-labelledby portal uses verified Georgian fuel equivalent')
    check(optionRank('2.3',{candidates:['2.3'],engineCc:2300})===Infinity && optionRank('2.3',{candidates:['2.3'],engineCc:2300,engineUnit:'liters'})===0 && optionRank('13.1',{candidates:['13.1'],engineCc:13100,engineUnit:'liters'})===Infinity,'dropdown: numeric engine labels require confirmed liters contract and stay within supplied range')
    const engine=control('engineVolume')
    engine.trigger.onclick=()=>{
      const list=box('virtual-engine');list.style.cssText='height:40px;overflow-y:auto';doc.body.append(list)
      engine.trigger.setAttribute('aria-controls',list.id)
      const spacer=doc.createElement('div');spacer.style.height='400px';list.append(spacer)
      option('engineVolume','1.0 L','wrong-engine',list)
      list.addEventListener('scroll',()=>{if(list.querySelector('[data-fixture-target]'))return;option('engineVolume','2.3 ლ','fixture-2300',list).dataset.fixtureTarget='true'})
    }
    check(await selectDropdown(doc,'engineVolume',{...opts(['2.3L']),engineCc:2300},900)===undefined,'dropdown: virtualized options traversed by bounded scrolling; engine units normalized to 2300 cc')
    const cylinders=control('cylinders')
    cylinders.trigger.onclick=()=>{const list=box('async-cylinders');cylinders.owner.append(list);setTimeout(()=>option('cylinders','4','fixture-four',list),45)}
    check(await selectDropdown(doc,'cylinders',opts(['4']),500)===undefined,'dropdown: cylinder selection waits for async option and verifies the accepted value')

    const category=control('vehicleCategory')
    category.trigger.onclick=()=>{
      const one=box('ambiguous-portal-one'),two=box('ambiguous-portal-two')
      doc.body.append(one,two);option('vehicleCategory','Pickup','wrong-one',one);option('vehicleCategory','Pickup','wrong-two',two)
    }
    check(await selectDropdown(doc,'vehicleCategory',opts(['Pickup']),100)!==undefined && !diagnostics.at(-1)?.verified,'dropdown: ambiguous unlinked portals are not selected')
    doc.getElementById('ambiguous-portal-one')?.remove();doc.getElementById('ambiguous-portal-two')?.remove()
    category.trigger.onclick=()=>{const list=box('unverified-option');category.owner.append(list);const node=doc.createElement('div');node.setAttribute('role','option');node.textContent='Pickup';list.append(node)}
    check(await selectDropdown(doc,'vehicleCategory',opts(['Pickup']),150)!==undefined && diagnostics.at(-1)?.outcome==='not-verified','dropdown: clicking without actual form-state change never reports success')
    category.owner.querySelector('[role="listbox"]')?.remove()
    category.trigger.onclick=()=>{}
    check(await selectDropdown(doc,'vehicleCategory',opts(['Pickup']),80)!==undefined && diagnostics.at(-1)?.outcome==='not-discovered','dropdown: missing option structure reports precise discovery failure')
    let opens=0
    category.trigger.onclick=()=>{if(++opens===1)return;const list=box('retried-menu');category.owner.append(list);option('vehicleCategory','Pickup','retried-pickup',list)}
    check(await selectDropdown(doc,'vehicleCategory',opts(['Pickup']),600)===undefined && opens===2,'dropdown: failed opening gets one controlled retry')
    choose('vehicleCategory','','')
    const combo=doc.createElement('input');combo.setAttribute('role','combobox');combo.setAttribute('aria-owns','combobox-options');category.trigger.append(combo)
    category.trigger.onclick=()=>{const list=box('combobox-options');doc.body.append(list);option('vehicleCategory','Pickup','combobox-pickup',list)}
    check(await selectDropdown(doc,'vehicleCategory',opts(['Pickup']),400)===undefined && diagnostics.at(-1)?.controlType==='combobox','dropdown: nested searchable combobox uses its own interactive input and ownership')
    combo.remove()
    const native=doc.createElement('select');native.name='primaryFeatures.engineVolume';native.disabled=true;native.append(new doc.defaultView!.Option('',''));doc.body.append(native)
    setTimeout(()=>{native.disabled=false;native.append(new doc.defaultView!.Option('2.3','verified-engine-id'))},40)
    const nativeResult=await selectNativeDropdown(doc,'engineVolume','2300',false,{...opts(['2.3']),engineCc:2300,engineUnit:'liters'},500)
    check(nativeResult.selection?.optionId==='verified-engine-id' && nativeResult.selection.optionLabel==='2.3','dropdown: native async engine uses the same unit contract and actual option ID')
    native.remove()
    const privateValue='1HGCM82633A004352'
    check(safeExpected([privateValue,'1HGCM82633 A004352','Ford']).join('|')==='[redacted]|[redacted]|Ford','dropdown: diagnostic expectations redact contiguous and formatted VINs')
    check(safeExpected(['VIN '+privateValue,[...privateValue].join(' '),'VIN: '+encodeURIComponent(privateValue).replace('1','%31'),'Cookie: synthetic-session']).every(value=>value==='[redacted]'),'dropdown: diagnostic redaction also covers labeled, spaced, encoded VINs and session labels')
  } finally {frame.remove()}

  const formFrame=document.createElement('iframe');document.body.append(formFrame)
  const d=formFrame.contentDocument!;d.open();d.write(myauto);d.close()
  try {
    const vehicle=parseManheim24(new DOMParser().parseFromString(manheim,'text/html'))
    vehicle.make='Ford';vehicle.model='Ranger XLT Crew Cab Medium Bed';vehicle.fullModelName=vehicle.model;vehicle.original={...vehicle.original,manufacturer:vehicle.make,model:vehicle.model,fullModelName:vehicle.model,catalogModel:'Ranger'};vehicle.year=2019;vehicle.fuel='Gasoline';vehicle.engineCc=2300;vehicle.cylinders=4;vehicle.raw.engineDisplacement='2.3L'
    const order:string[]=[]
    const labels:Record<string,string>={manufacturer:'Ford',model:vehicle.model,issueYear:'2019',fuelType:'ბენზინი',engineVolume:'2.3',cylinders:'4',vehicleCategory:'Wagon'}
    const modelTrigger=d.querySelector<HTMLElement>('[data-testid="single-select-trigger-primaryFeatures.model"]')!
    modelTrigger.setAttribute('aria-disabled','true')
    for(const [key,label] of Object.entries(labels)) {
      const owner=d.querySelector<HTMLElement>(`[data-testid="single-select-primaryFeatures.${key}"]`)!,trigger=owner.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
      trigger.onclick=()=>{
        order.push(key)
        const list=d.createElement('div');list.setAttribute('role','listbox');list.id='form-options-'+key;d.body.append(list)
        trigger.setAttribute('aria-controls',list.id)
        setTimeout(()=>{
          const item=d.createElement('div');item.setAttribute('role','option');item.textContent=label;list.append(item)
          item.onclick=()=>{
            owner.querySelector('[data-testid^="single-select-value-"]')!.textContent=label
            owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value='fixture-'+key
            list.remove()
            if(key==='manufacturer')setTimeout(()=>modelTrigger.removeAttribute('aria-disabled'),45)
          }
        },20)
      }
    }
    const originalMake=vehicle.make
    const canonicalMake=myautoFields({...vehicle,make:'FORD'}).find(field=>field.field==='make')!
    check(canonicalMake.value==='FORD' && canonicalMake.optionValue?.equivalents?.includes('Ford') && vehicle.make===originalMake,'catalog: canonical dropdown display candidate does not alter original manufacturer')
    check(optionRank('2027',myautoFields({...vehicle,year:2027}).find(field=>field.field==='year')!.optionValue!)===0 && optionRank('New Brand',myautoFields({...vehicle,make:'New Brand'}).find(field=>field.field==='make')!.optionValue!)===0,'catalog: newly available live years and manufacturers are not blocked by the reference catalog')
    const noRaw={...vehicle,raw:{...vehicle.raw}};delete noRaw.raw.engineDisplacement
    check(myautoFields(noRaw).find(field=>field.field==='engineCc')?.optionValue?.candidates.includes('2.3'),'dropdown: normalized engine volume remains searchable when original displacement label is missing')
    const fields=await fillMyautoForm(d,vehicle,{dropdownTimeoutMs:600})
    const verified=verifyMyautoFields(d,vehicle,fields)
    check(order.join('|')==='manufacturer|model|issueYear|fuelType|engineVolume|cylinders|vehicleCategory','dropdown: form adapter performs all dependent controls sequentially')
    check(['მწარმოებელი','მოდელი','წელი','საწვავი','ძრავის მოცულობა','ცილინდრები'].every(label=>verified.some(field=>field.field===label && field.status==='filled')),'dropdown: Ford/full Ranger model/year/fuel/engine/cylinders filled and verified through custom portal form')
    const description=d.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!.value
    check(!description.includes(vehicle.vin) && d.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!.value===vehicle.vin,'dropdown: existing dedicated VIN handling and VIN-free Georgian description preserved')
  } finally {formFrame.remove()}
}
