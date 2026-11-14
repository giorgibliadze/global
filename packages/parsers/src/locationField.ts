import {DropdownAdapter} from './DropdownAdapter'
import {selectedOption} from './myautoContract'
import type {FieldResult,ListingLocation} from '@auto-importer/shared'
import type {FormField} from './myauto'
export function locationField(location:ListingLocation):FormField{
  return {field:'location',label:'მდებარეობა',mode:'dropdown',dropdownKey:'location.location',selector:'[data-testid="single-select-trigger-location.location"]',value:location.label,sourceValue:(location.original??location.label)?.slice(0,500),optionValue:{exactText:true,candidates:location.label?[location.label]:[]}}
}
export async function fillLocation(doc:Document,field:FormField,signal?:AbortSignal):Promise<FieldResult>{
  if(!field.value)return {key:'location',field:'მდებარეობა',status:'unfilled',code:'manual',retryable:false,sourceValue:field.sourceValue,reason:'ხელით შესავსები'}
  try{
    const result=await new DropdownAdapter(doc).select(field,signal,900)
    return {...result,sourceValue:field.sourceValue,retryable:false,reason:result.persisted?'შევსებულია':'ხელით შესავსები'}
  }catch(error){
    signal?.throwIfAborted()
    return {key:'location',field:'მდებარეობა',status:'unfilled',code:'manual',retryable:false,sourceValue:field.sourceValue,reason:error instanceof Error && /[\u10A0-\u10FF]/.test(error.message)?error.message:'ხელით შესავსები'}
  }
}
export function readLocation(doc:Document,result:FieldResult):FieldResult{
  if(!result.evidence)return result
  return selectedOption(doc,'location.location',result)?{...result,status:'filled',persisted:true}:{...result,status:'unfilled',persisted:false,retryable:false,code:'verification',reason:'ხელით შესავსები'}
}
