import {shown} from './dropdownDom'
import type {FieldResult} from '@auto-importer/shared'

// Confirmed in main.f81b0e156752.js: Controller refs have no value binding;
// selected object values render a label and clear control instead.
export function isMyautoControllerForm(doc:Document):boolean {
  return !!doc.querySelector('[data-testid="single-select-input-primaryFeatures.manufacturer"].opacity-0') && !!doc.querySelector('[data-testid="description-locale-tab-ka"]')
}
export function textInteractive(doc:Document):boolean {
  const controls=[...doc.querySelectorAll<HTMLElement>('input[name="primaryFeatures.mileage"]')]
  return controls.length>0 && controls.every(shown)
}
export function selectedOption(doc:Document,key:string,result:FieldResult):boolean {
  const name=key.includes('.')?key:`primaryFeatures.${key}`
  const label=doc.querySelector<HTMLElement>(`[data-testid="single-select-value-${name}"]`)
  const closed=!doc.querySelector(`[data-testid="single-select-dropdown-${name}"]`)
  return !!label && !!result.optionId && label.textContent?.trim()===result.optionLabel && closed && (!!doc.querySelector(`[data-testid="single-select-clear-${name}"]`) || (result.optionId==='0'||key==='mileageType'&&!!doc.querySelector(`[data-testid="single-select-dropdown-arrow-${name}"]`)) && label.classList.contains('pt-[6px]'))
}
export function selectedChoice(element:Element|null):boolean {
  // Exact state classes from the public SingleCheckbox component's value comparison.
  return !!element?.classList.contains('border-[#02cc59]') && element.classList.contains('bg-[#02cc59]/10')
}
