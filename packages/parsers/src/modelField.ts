import { dropdownKeys, settleField, waitForDropdownChange } from './dropdownDom'
import { reportDropdown, safeExpected } from './dropdownDiagnostics'
import type { DropdownDiagnostic } from './dropdownDiagnostics'
import { optionRank } from './dropdowns'
import type { DropdownValue, DropdownSelection } from './dropdowns'
export interface ModelInput { element: HTMLInputElement | HTMLTextAreaElement }
function visible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current)
    if (current.hidden || current.getAttribute('aria-hidden')==='true' || style?.display==='none' || style?.visibility==='hidden' || style?.opacity==='0' || style?.pointerEvents==='none') return false
    current=current.parentElement
  }
  return true
}
export function editableModelInput(doc: Document): ModelInput | undefined {
  const root=doc.querySelector('[data-testid="single-select-primaryFeatures.model"]')
  const candidates=[...doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name="primaryFeatures.model"],textarea[name="primaryFeatures.model"]')]
  const tracker=root?.querySelector<HTMLInputElement>('[data-testid="single-select-input-primaryFeatures.model"]')
  // The snapshot tracker is hidden, not a custom text field. Require actual textbox semantics.
  if (tracker?.getAttribute('role')==='textbox' && ['მოდელი','Model'].includes(tracker.getAttribute('aria-label') ?? '') && !candidates.includes(tracker)) candidates.push(tracker)
  const eligible=candidates.filter(input=> !input.disabled && !input.readOnly && (input.tagName==='TEXTAREA' || input.type==='text') && visible(input) && !input.dataset.testid?.startsWith('single-select-search-') && !input.hasAttribute('list') && !input.hasAttribute('aria-autocomplete') && input.getAttribute('role')!=='combobox')
  return eligible.length===1 ? {element:eligible[0]} : undefined
}
export async function fillEditableModel(doc: Document, model: string, allowReplace = false): Promise<string | undefined> {
  const control=editableModelInput(doc)
  if (!control) return 'მოდელის თავისუფალი ტექსტის კონტროლი არ დადასტურდა.'
  const input=control.element
  if (input.value && input.value!==model && !allowReplace) return 'მოდელის არსებული მნიშვნელობა არ გადაგვიწერია.'
  if (input.maxLength>0 && model.length>input.maxLength) return 'სრული მოდელი ველის სიგრძეში არ ეტევა. მოდელი არ შემოკლებულა.'
  const view=doc.defaultView!
  const prototype=input.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,model)
  input.dispatchEvent(new view.Event('input',{bubbles:true}));input.dispatchEvent(new view.Event('change',{bubbles:true}));input.dispatchEvent(new view.FocusEvent('blur',{bubbles:true}));input.dispatchEvent(new view.FocusEvent('focusout',{bubbles:true}))
  const confirmed=await settleField(doc,()=>{const current=editableModelInput(doc)?.element;return current?.value===model && current.getAttribute('aria-invalid')!=='true'})
  return confirmed ? undefined : 'ფორმამ სრული მოდელის სახელი არ შეინარჩუნა ან მნიშვნელობა არ მიიღო.'
}
export function nativeDropdown(doc: Document,key:string): HTMLSelectElement | undefined {
  const controls=[...doc.querySelectorAll<HTMLSelectElement>(`select[name="primaryFeatures.${key}"]`)].filter(input=>visible(input))
  return controls.length===1 ? controls[0] : undefined
}
export async function selectNativeDropdown(doc:Document,key:string,source:string,allowReplace=false,descriptor?:DropdownValue,timeoutMs=3000,signal?:AbortSignal):Promise<{error?:string;selection?:DropdownSelection}> {
  if(!dropdownKeys.has(key))return {error:'ველის სელექტორი დადასტურებული არ არის.'}
  const expected=descriptor ?? {candidates:[source],exactText:key==='model'},deadline=Date.now()+timeoutMs
  const diagnostic:DropdownDiagnostic={field:key,selector:`select[name="primaryFeatures.${key}"]`,controlType:'native',opened:false,optionCount:0,expected:safeExpected(expected.candidates),matched:false,verified:false,outcome:'unavailable'}
  const finish=(outcome:DropdownDiagnostic['outcome'],error?:string,selection?:DropdownSelection)=>{
    diagnostic.outcome=outcome;diagnostic.verified=outcome==='selected'
    ;(expected.onDiagnostic ?? reportDropdown)({...diagnostic})
    return {error,selection}
  }
  let chosen:DropdownSelection | undefined,verifiedSince:number | undefined
  try {
    while(Date.now()<deadline) {
      signal?.throwIfAborted()
      const select=nativeDropdown(doc,key)
      if(!select || select.disabled || select.getAttribute('aria-busy')==='true'){await waitForDropdownChange(doc,Math.min(deadline-Date.now(),Math.max(1,timeoutMs/4)),signal);continue}
      const eligible=[...select.options].filter(option=>!option.disabled && !!option.value)
      diagnostic.optionCount=Math.max(diagnostic.optionCount,eligible.length)
      const best=Math.min(...eligible.map(option=>optionRank(option.text,expected)))
      const matches=Number.isFinite(best)?eligible.filter(option=>optionRank(option.text,expected)===best):[]
      if(matches.length>1)return finish('ambiguous','ერთზე მეტი შესაბამისი ვარიანტია. არჩევანი არ შესრულდა.')
      if(chosen) {
        const valid=select.value===chosen.optionId && select.selectedOptions[0]?.text.trim()===chosen.optionLabel && select.getAttribute('aria-invalid')!=='true'
        if(valid){verifiedSince ??=Date.now();if(Date.now()-verifiedSince>=Math.min(32,timeoutMs/5))return finish('selected',undefined,chosen)}else verifiedSince=undefined
      } else if(matches.length===1) {
        diagnostic.matched=true
        const option=matches[0],selection:DropdownSelection={optionId:option.value,optionLabel:option.text.trim(),match:best===0?'exact':'equivalent'}
        if(select.value===option.value)return finish('selected',undefined,selection)
        if(select.value && !allowReplace)return finish('protected','არსებული ჩამოსაშლელი არჩევანი არ გადაგვიწერია.')
        Object.getOwnPropertyDescriptor(doc.defaultView!.HTMLSelectElement.prototype,'value')!.set!.call(select,option.value)
        select.dispatchEvent(new doc.defaultView!.Event('input',{bubbles:true}));select.dispatchEvent(new doc.defaultView!.Event('change',{bubbles:true}))
        chosen=selection
        if(select.value===option.value && select.selectedOptions[0]?.text.trim()===selection.optionLabel)verifiedSince=Date.now()
      }
      await waitForDropdownChange(doc,Math.min(deadline-Date.now(),Math.max(1,timeoutMs/4)),signal)
    }
    return chosen?finish('not-verified','არჩეული მნიშვნელობა ფორმამ საბოლოოდ არ დაადასტურა.'):diagnostic.optionCount?finish('not-matched','ზუსტი ან დადასტურებული შესაბამისობა ვერ მოიძებნა. სხვა ვარიანტი არ არჩეულა.'):finish('unavailable','ჩამოსაშლელი ველი ან მისი ვარიანტები დროულად არ ჩაიტვირთა.')
  } catch {
    signal?.throwIfAborted()
    return finish('interaction-error','ჩამოსაშლელ ველთან მოქმედება ვერ შესრულდა. დანარჩენი ველების შევსება გაგრძელდება.')
  }
}
