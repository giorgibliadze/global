import { shown, settleField } from './dropdownDom'
type TextControl=HTMLInputElement|HTMLTextAreaElement
const peers='input[name="primaryFeatures.mileage"],textarea[data-testid="description-textarea"],input[name="primaryFeatures.customModel"]'
function writable(element:HTMLElement):element is TextControl {
  const view=element.ownerDocument.defaultView!
  return (element instanceof view.HTMLInputElement || element instanceof view.HTMLTextAreaElement) && !element.disabled && !element.readOnly && shown(element)
}
// A native user event completes its browser task before the next focus event.
// Synthetic dispatch does not: React can still hold handlers from the previous
// render. Yield a task before blur and before focusing a different control.
export function commitTurn(doc:Document,signal?:AbortSignal):Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const channel=new doc.defaultView!.MessageChannel()
    const clean=()=>{channel.port1.close();channel.port2.close();signal?.removeEventListener('abort',abort)}
    const abort=()=>{clean();reject(signal?.reason)}
    channel.port1.onmessage=()=>{clean();resolve()}
    signal?.addEventListener('abort',abort,{once:true})
    channel.port2.postMessage(null)
  })
}
export async function probePersistence(doc:Document,resolve:()=>HTMLElement|null|undefined,valid:()=>boolean,signal?:AbortSignal):Promise<boolean> {
  await commitTurn(doc,signal)
  const control=resolve()
  if(!control?.isConnected)return false
  // Never dispatch focusout on an unfocused wrapper or focus a field again to
  // verify it. Doing so can reset a mask/draft or commit stale blur handlers.
  const active=doc.activeElement
  if(active instanceof doc.defaultView!.HTMLElement && (active===control || control.contains(active))){active.blur();await commitTurn(doc,signal)}
  const peer=[...doc.querySelectorAll<HTMLElement>(peers)].find(element=>element!==resolve() && element!==doc.activeElement && writable(element))
  if(peer){peer.focus({preventScroll:true});await commitTurn(doc,signal)}
  return settleField(doc,()=>{
    const current=resolve()
    return !!current?.isConnected && current.getAttribute('aria-invalid')!=='true' && !current.closest('[aria-busy="true"]') && valid()
  },signal,800)
}
export async function writeControlledInput(doc:Document,resolve:()=>TextControl|null|undefined,value:string,signal?:AbortSignal,mayRetry:()=>boolean=()=>true,allowReplace=false):Promise<boolean> {
  const view=doc.defaultView!
  for(let attempt=0;attempt<2;attempt++) {
    signal?.throwIfAborted()
    if(!mayRetry())return false
    const input=resolve()
    if(!input || !writable(input) || (!allowReplace && input.value!=='' && input.value!==value) || (input.maxLength>0 && value.length>input.maxLength))return false
    input.focus({preventScroll:true})
    signal?.throwIfAborted()
    const before=new view.InputEvent('beforeinput',{bubbles:true,cancelable:true,composed:true,inputType:attempt?'insertReplacementText':'insertText',data:value})
    if(!input.dispatchEvent(before))return false
    signal?.throwIfAborted()
    if(attempt && (input.tagName==='TEXTAREA' || ['text','search','tel','url'].includes((input as HTMLInputElement).type))) {
      input.setRangeText(value,0,input.value.length,'end')
    }else{
      const prototype=input.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype
      const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set
      if(!setter)return false
      setter.call(input,value)
    }
    input.dispatchEvent(new view.InputEvent('input',{bubbles:true,composed:true,inputType:attempt?'insertReplacementText':'insertText',data:value}))
    input.dispatchEvent(new view.Event('change',{bubbles:true,composed:true}))
    if(await probePersistence(doc,resolve,()=>resolve()?.value===value,signal))return true
    if(!mayRetry() || (resolve()?.value!=='' && resolve()?.value!==value))return false
  }
  return false
}
export function activateOption(option:HTMLElement,method:'click'|'pointer'='click',signal?:AbortSignal) {
  signal?.throwIfAborted()
  const view=option.ownerDocument.defaultView!
  if(method==='pointer'){
    option.dispatchEvent(new view.PointerEvent('pointerdown',{bubbles:true,composed:true,pointerType:'mouse',button:0}))
    signal?.throwIfAborted()
    if(!option.isConnected)return
    option.dispatchEvent(new view.MouseEvent('mousedown',{bubbles:true,composed:true,button:0}))
    option.focus({preventScroll:true})
    option.dispatchEvent(new view.PointerEvent('pointerup',{bubbles:true,composed:true,pointerType:'mouse',button:0}))
    option.dispatchEvent(new view.MouseEvent('mouseup',{bubbles:true,composed:true,button:0}))
  }
  signal?.throwIfAborted()
  if(option.isConnected)option.click()
}
