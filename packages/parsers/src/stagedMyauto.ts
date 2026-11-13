import {TextInputAdapter} from './TextInputAdapter'
import {DropdownAdapter} from './DropdownAdapter'
import {commitTurn} from './inputInteraction'
import {selectedChoice,selectedOption} from './myautoContract'
import {fitDescription} from './descriptionFit'
import type {FillOptions,FormField} from './myauto'
import type {FieldResult,NormalizedVehicle} from '@auto-importer/shared'

export function readStagedFields(doc:Document,vehicle:NormalizedVehicle,results:FieldResult[],plan:FormField[],only?:string[]):FieldResult[]{
  const fields=new Map(plan.map(field=>[field.field,field]))
  return results.map(result=>{
    const field=fields.get(result.key??'')
    if(!field || !result.evidence || only && !only.includes(field.field))return result
    let valid=false
    if(result.evidence==='react-value' && field.field==='description' && doc.querySelector('[data-testid="description-locale-tab-ka"]')?.getAttribute('aria-pressed')!=='true')return {...result,status:'unverified',persisted:false,code:'protected',retryable:false,reason:'ქართული აღწერა სხვა ენის ჩანართიდან ვერ გადამოწმდა.'}
    if(result.evidence==='react-value'){
      const input=doc.querySelector<HTMLInputElement|HTMLTextAreaElement>(field.selector!)
      const expected=field.field==='description'?fitDescription(field.value??'',input?.maxLength??-1,vehicle.vin).text:field.value
      valid=!!input && input.value===expected && input.defaultValue===expected && input.getAttribute('aria-invalid')!=='true'
    }else if(result.evidence==='myauto-option')valid=selectedOption(doc,field.dropdownKey!,result)
    else if(result.evidence==='myauto-choice')valid=selectedChoice(doc.querySelector(field.selector!))
    return valid?{...result,status:'filled',persisted:true,code:undefined,reason:'შევსებულია და შენარჩუნებულია'}:(result.persisted || result.resetAfter)?{...result,resetAfter:result.resetAfter??'stagedCommit',status:'unfilled',persisted:false,code:'verification',retryable:true,reason:'შენახული მნიშვნელობა შეიცვალა; საჭიროა მხოლოდ ამ ველის გადამოწმება.'}:{...result,status:'unverified',persisted:false,code:'unverified',retryable:false,reason:'კონტროლერის შენახული მნიშვნელობა ვერ გადამოწმდა.'}
  })
}

export async function fillStagedMyauto(doc:Document,vehicle:NormalizedVehicle,plan:FormField[],options:FillOptions):Promise<FieldResult[]>{
  const selected=plan.filter(field=>!options.onlyFields || options.onlyFields.includes(field.field))
  const keys=new Set(selected.map(field=>field.field))
  const results=(options.previousResults??[]).filter(result=>!keys.has(result.key??plan.find(field=>field.label===result.field)?.field??'')).map(result=>({...result}))
  const text=new TextInputAdapter(doc,selected.filter(field=>field.mode==='text')),dropdown=new DropdownAdapter(doc)
  const edited=new Set<string>()
  const edit=(event:Event)=>{
    if(!event.isTrusted || !(event.target instanceof doc.defaultView!.Element))return
    const name=event.target.getAttribute('name')
    const field=name?plan.find(item=>item.selector===`input[name="${name}"]`):event.target.matches('[data-testid="description-textarea"]')?plan.find(item=>item.field==='description'):undefined
    if(field)edited.add(field.field)
  }
  doc.addEventListener('input',edit,true);doc.addEventListener('change',edit,true);doc.addEventListener('keydown',edit,true)
  const notify=()=>options.onResult?.(results.map(result=>({...result})))
  const populate=async(fields:FormField[])=>{
    if(!fields.length)return
    const started=performance.now()
    for(const field of fields)options.onField?.(field.label)
    results.push(...await text.populate(fields,vehicle.vin,{signal:options.signal,guard:options.beforeField,protected:key=>edited.has(key),recovering:options.recoveringFields}))
    options.onTiming?.('textPopulation',performance.now()-started);await notify()
  }
  const dropdowns=async()=>{
    const started=performance.now()
    for(const field of selected.filter(item=>item.mode==='dropdown')){
      options.signal?.throwIfAborted();options.beforeField?.();options.onField?.(field.label)
      if(field.value===undefined){results.push({key:field.field,field:field.label,status:'unfilled',code:'missing',reason:'წყაროში მონაცემი არ არის.'});continue}
      if(field.field==='model' && !results.some(result=>result.key==='make'&&result.status==='filled')){results.push({key:field.field,field:field.label,status:'unfilled',code:'dependency',reason:'მწარმოებლის დადასტურებული არჩევანი ჯერ არ არის.'});continue}
      results.push(await dropdown.select(field,options.signal,options.dropdownTimeoutMs))
    }
    options.onTiming?.('dropdownBatch',performance.now()-started);await notify()
  }
  const mileage=selected.find(field=>field.field==='mileageKm')
  const km=()=>doc.querySelector('[data-testid="single-select-value-primaryFeatures.mileageType"]')?.textContent?.trim()==='კმ'
  try{
    // Initial text is independent. Optional trim follows its real model dependency.
    if(!options.recoveringFields?.length)await populate(selected.filter(field=>field.mode==='text'&&field.field!=='trim'&&(field.field!=='mileageKm'||km())))
    await dropdowns()
    if(mileage && (!km() || options.recoveringFields?.includes('mileageKm'))){
      if(!km()){
        const unit=await dropdown.select({field:'mileageType',label:'გარბენის ერთეული',mode:'dropdown',value:'კმ',dropdownKey:'mileageType',optionValue:{candidates:['კმ']}},options.signal,options.dropdownTimeoutMs)
        if(unit.status!=='filled')results.push({...unit,key:'mileageKm',field:mileage.label,reason:'გარბენის ერთეული ვერ დადასტურდა.'})
      }
      if(km())await populate([mileage])
    }
    await populate(selected.filter(field=>field.mode==='text'&&(field.field==='trim'||!!options.recoveringFields?.includes(field.field))&&field.field!=='mileageKm'))
    for(const field of selected.filter(item=>item.mode==='choice')){
      options.beforeField?.();options.signal?.throwIfAborted()
      const element=field.selector?doc.querySelector<HTMLElement>(field.selector):null
      if(!field.value || !element){results.push({key:field.field,field:field.label,status:'unfilled',code:field.value?'unavailable':'missing',reason:'არჩევანი ან წყაროს მონაცემი მიუწვდომელია.'});continue}
      const group=element.dataset.testid!.slice('single-checkbox-'.length).replace(/-[^-]+$/,'')
      const other=[...doc.querySelectorAll(`[data-testid^="single-checkbox-${group}-"]`)].some(node=>node!==element&&selectedChoice(node))
      if(other){results.push({key:field.field,field:field.label,status:'unfilled',code:'protected',reason:'არსებული არჩევანი არ გადაგვიწერია.'});continue}
      if(!selectedChoice(element))element.click()
      results.push({key:field.field,field:field.label,status:'unverified',evidence:'myauto-choice',optionId:field.value,reason:'კონტროლერის განახლების მოლოდინი.'})
    }
    await commitTurn(doc,options.signal)
    // Commit just the choice batch. The controller performs the single full
    // Stage C read after both pipelines settle; no repeated text/dropdown probes.
    for(const result of results)if(result.evidence==='myauto-choice' && keys.has(result.key??'')){
      const field=selected.find(item=>item.field===result.key)!
      if(selectedChoice(doc.querySelector(field.selector!)))Object.assign(result,{status:'filled',persisted:true,code:undefined,reason:'შევსებულია და შენარჩუნებულია'})
    }
    for(const field of selected.filter(item=>item.mode==='manual'))results.push({key:field.field,field:field.label,status:'unfilled',code:'manual',reason:field.reason??'საჭიროა ხელით გადამოწმება.'})
    await notify();return results
  }finally{doc.removeEventListener('input',edit,true);doc.removeEventListener('change',edit,true);doc.removeEventListener('keydown',edit,true)}
}
