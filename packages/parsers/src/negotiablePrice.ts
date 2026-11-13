import {commitTurn} from './inputInteraction'
import type {FieldResult} from '@auto-importer/shared'

export const negotiableSelector='input[type="checkbox"][name="sale.isNegotiablePrice"]'
export function negotiableSelected(doc:Document):boolean {
  return doc.querySelector<HTMLInputElement>(negotiableSelector)?.checked===true
}
export async function enableNegotiablePrice(doc:Document,signal?:AbortSignal):Promise<FieldResult>{
  const result:FieldResult={key:'price',field:'ფასი',status:'unfilled',code:'manual',retryable:false,reason:'ხელით შესავსები'}
  const input=doc.querySelector<HTMLInputElement>(negotiableSelector)
  if(!input || input.disabled)return result
  // MyAuto registers this native checkbox with RHF. A real click runs the
  // registered change handler; setting checked alone would bypass form state.
  if(!input.checked)input.click()
  await commitTurn(doc,signal)
  return negotiableSelected(doc)?{...result,status:'filled',code:undefined,persisted:true,evidence:'negotiable',reason:'შეთანხმებით'}:{...result,code:'verification',reason:'ვერ შენარჩუნდა'}
}
