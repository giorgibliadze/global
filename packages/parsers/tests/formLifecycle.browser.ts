import { fitDescription } from '../src/descriptionFit'
import { myautoModelName,fillMyautoForm,verifyMyautoFields,vehicleDescription } from '../src/myauto'
import { parseManheim24 } from '../src/manheim24'
import { selectDropdown } from '../src/dropdowns'

export async function runFormLifecycleTests(manheim:string,myauto:string,check:(value:unknown,label:string)=>void){
  const source=new DOMParser().parseFromString(manheim,'text/html')
  const data=JSON.parse(source.querySelector('.StockWaveInfo')!.textContent!)
  Object.assign(data,{make:'Ford',models:['Super Duty F-350'],trims:['XLT'],sourceTrim:'XLT',year:'2019'})
  data.designatedDescriptionEnrichment={vin:data.vin,make:'Ford',model:'Super Duty F-350',trim:'XLT',year:2019,manheimStandardDescription:{shortDescription:'2019 Ford Super Duty F-350 XLT Crew Cab Long Bed DRW'}}
  source.querySelector('.StockWaveInfo')!.textContent=JSON.stringify(data)
  source.querySelector('[data-testid="vdp-title-text"]')!.textContent=data.designatedDescriptionEnrichment.manheimStandardDescription.shortDescription
  const vehicle=parseManheim24(source)
  check(myautoModelName(vehicle)==='Super Duty F-350' && vehicle.trim==='XLT' && vehicle.title.endsWith('Crew Cab Long Bed DRW'),'lifecycle: independently labeled Ford model/trim map separately; complete cab/bed/DRW title is preserved')
  check(myautoModelName(parseManheim24(new DOMParser().parseFromString(manheim,'text/html')))==='M5 Touring Wagon','lifecycle: compound BMW model is never reduced to M5')
  const full=vehicleDescription({...vehicle,announcements:['Frame Damage',`VIN ${vehicle.vin}; მომსახურების ჩანაწერი`],equipment:Array.from({length:300},(_,n)=>`Original package ${n}`)})
  const fitted=fitDescription(full,4000,vehicle.vin)
  check(fitted.text.length<=4000 && fitted.text.includes('Frame Damage') && !fitted.text.includes(vehicle.vin) && fitted.omissions.length>0 && !fitted.criticalOmitted,'lifecycle: 4000-character description retains complete damage notes, excludes VIN and reports omitted equipment')
  const damageInOptions=fitDescription('Ford Super Duty F-350\nაღჭურვილობა: Frame Damage; '+ 'Original option; '.repeat(100),200,vehicle.vin)
  check(damageInOptions.criticalOmitted && damageInOptions.omissions.length>0,'lifecycle: damage words in original equipment trigger a critical omission warning, never a silent optional drop')
  const critical=fitDescription('Ford Super Duty F-350\nაუქციონის შენიშვნები: '+ 'მნიშვნელოვანი დაზიანება '.repeat(100),200,vehicle.vin)
  check(critical.criticalOmitted && critical.omissions.length>0 && critical.text.length<=200 && critical.text.includes('წყაროს განცხადება'),'lifecycle: oversized critical notes require review rather than silent truncation')
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(myauto);doc.close()
  try{
    const textarea=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!;textarea.maxLength=4000
    const described={...vehicle,equipment:Array.from({length:300},(_,n)=>`Original package ${n}`)}
    const result=await fillMyautoForm(doc,described,{onlyFields:['description'],dropdownTimeoutMs:30})
    check(result[0].status==='filled' && !!result[0].omissions?.length && textarea.value.length<=4000 && verifyMyautoFields(doc,described,result)[0].status==='filled','lifecycle: live textarea limit is fitted before writing; fresh verification agrees with concise description')
    textarea.value='მომხმარებლის აღწერა'
    const manual=await fillMyautoForm(doc,described,{onlyFields:['description']})
    check(manual[0].code==='protected' && textarea.value==='მომხმარებლის აღწერა','lifecycle: manual description edits are never overwritten by fitting or retry')

    const owner=doc.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.manufacturer"]')!,trigger=owner.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
    let wrongId=false
    trigger.setAttribute('aria-controls','metadata-options');trigger.tabIndex=0
    trigger.onclick=()=>{
      if(doc.getElementById('metadata-options'))return
      const list=doc.createElement('div');list.id='metadata-options'
      const option=doc.createElement('button');option.type='button';option.dataset.value='verified-ford';option.textContent='Ford'
      option.onclick=()=>{owner.querySelector('[data-testid^="single-select-value-"]')!.textContent='Ford';owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=wrongId?'wrong-id':'verified-ford';list.remove()}
      list.append(option);doc.body.append(list)
    }
    check(!await selectDropdown(doc,'manufacturer',{candidates:['Ford']},150),'lifecycle: explicit value metadata in a linked portal is selected without requiring invented option classes or role attributes')
    owner.querySelector('[data-testid^="single-select-value-"]')!.textContent=''
    owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=''
    wrongId=true
    let verified=false
    const mismatch=await selectDropdown(doc,'manufacturer',{candidates:['Ford'],onSelected:()=>{verified=true}},150)
    check(!!mismatch && !verified,'lifecycle: matching visible label with a different metadata option ID is never verified')
    owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=''
    const partial=await fillMyautoForm(doc,vehicle,{onlyFields:['transmission'],dropdownTimeoutMs:30})
    check(partial[0].status==='unverified' && partial[0].code==='unverified','lifecycle: a clicked choice without observable committed state is unverified, not falsely failed or successful')
    doc.body.innerHTML=new DOMParser().parseFromString(myauto,'text/html').body.innerHTML
    for(const [key,label] of [['manufacturer','Ford'],['model','Super Duty F-350']]){
      doc.querySelector(`[data-testid="single-select-primaryFeatures.${key}"]`)!.remove()
      const control=doc.createElement('select');control.name=`primaryFeatures.${key}`
      control.append(new doc.defaultView!.Option('',''),new doc.defaultView!.Option(label,'id-'+key));doc.body.append(control)
      if(key==='manufacturer')control.onchange=()=>{for(const selector of ['[name="primaryFeatures.mileage"]','[name="primaryFeatures.customModel"]','[data-testid="description-textarea"]'])doc.querySelector<HTMLInputElement>(selector)!.value=''}
    }
    const filled=await fillMyautoForm(doc,vehicle,{onlyFields:['vin','trim','mileageKm','description','make','model'],dropdownTimeoutMs:100})
    check(filled.some(field=>field.key==='model' && field.optionLabel==='Super Duty F-350' && field.persisted),'lifecycle: Ford selects its verified source Model option rather than title/cab/bed/trim text')
    const reset=filled.filter(field=>field.resetAfter==='make').map(field=>field.key!)
    check(['trim','mileageKm','description'].every(key=>reset.includes(key)),'lifecycle: dependency operation reports exactly which earlier text fields reset')
    const repaired=await fillMyautoForm(doc,vehicle,{onlyFields:reset,recoveringFields:reset,previousResults:filled,dropdownTimeoutMs:100})
    check(reset.every(key=>repaired.some(field=>field.key===key && field.persisted)) && doc.querySelector<HTMLSelectElement>('select[name="primaryFeatures.model"]')!.value==='id-model','lifecycle: targeted text repair after stable dependencies preserves Model without restarting the form')

  }finally{frame.remove()}
}
