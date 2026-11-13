export const dropdownKeys = new Set(['manufacturer','model','issueYear','fuelType','engineVolume','cylinders','vehicleCategory','mileageType'])
export const dropdownSelector = (key:string, part='') => `[data-testid="single-select${part ? '-'+part : ''}-primaryFeatures.${key}"]`
export function shown(element: HTMLElement): boolean {
  let current: Element | null = element
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current)
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden')==='true' || style?.display==='none' || style?.visibility==='hidden' || style?.opacity==='0' || style?.pointerEvents==='none') return false
    current=current.parentElement
  }
  return true
}
export function interactive(doc:Document,key:string): HTMLElement | undefined {
  const trigger=doc.querySelector<HTMLElement>(dropdownSelector(key,'trigger'))
  if(!trigger || !shown(trigger))return
  const children=[...trigger.querySelectorAll<HTMLElement>('[role="combobox"],button,[aria-haspopup="listbox"]')].filter(shown)
  return children.length===1?children[0]:trigger
}
export function enabled(control:HTMLElement):boolean {
  return !control.closest('[aria-disabled="true"], [inert]') && !control.hasAttribute('disabled') && control.getAttribute('aria-busy')!=='true'
}
function controls(owner:HTMLElement,trigger:HTMLElement): HTMLElement[] {
  return [owner,trigger,...owner.querySelectorAll<HTMLElement>('[aria-controls],[aria-owns],[role="combobox"]')]
}
export function discoverLists(doc:Document,owner:HTMLElement,trigger:HTMLElement,before:Set<Element>):Element[] {
  const scopes=new Set<Element>([owner])
  const linked=controls(owner,trigger)
  for(const control of linked)for(const attribute of ['aria-controls','aria-owns']) {
    for(const id of (control.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)) {
      const element=doc.getElementById(id)
      // Relationships may point at a portal wrapper, not directly at its listbox.
      if(element && shown(element))scopes.add(element)
    }
  }
  for(const list of doc.querySelectorAll<HTMLElement>('[role="listbox"]')) {
    const labels=(list.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
    if(shown(list) && labels.some(id=>linked.some(control=>control.id===id || !!control.querySelector(`[id="${CSS.escape(id)}"]`))))scopes.add(list)
  }
  if(scopes.size===1 && (owner.contains(doc.activeElement) || trigger.getAttribute('aria-expanded')==='true')) {
    const fresh=[...doc.querySelectorAll<HTMLElement>('[role="listbox"]')].filter(list=>shown(list) && !before.has(list) && !owner.contains(list))
    // Only a single newly opened semantic list, with no relationship to another field.
    if(fresh.length===1) {
      const list=fresh[0]
      const otherOwner=[...doc.querySelectorAll<HTMLElement>('[data-testid^="single-select-primaryFeatures."]')].filter(el=>el!==owner)
      const hasForeignLabel=(list.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).some(id=>!linked.some(control=>control.id===id || !!control.querySelector(`[id="${CSS.escape(id)}"]`)))
      const foreign=otherOwner.some(other=>[other,...other.querySelectorAll('[aria-controls],[aria-owns]')].some(el=>['aria-controls','aria-owns'].some(attr=>(el.getAttribute(attr) ?? '').split(/\s+/).includes(list.id) && !!list.id)))
      if(!foreign && !hasForeignLabel)scopes.add(list)
    }
  }
  return [...scopes]
}
function readableOption(element:HTMLElement):boolean {
  let node:Element | null=element
  while(node){const style=node.ownerDocument.defaultView?.getComputedStyle(node);if(node.hasAttribute('hidden') || node.getAttribute('aria-hidden')==='true' || style?.display==='none' || style?.visibility==='hidden' || style?.opacity==='0')return false;node=node.parentElement}
  return true
}
export function selectableOption(option:HTMLElement):boolean {
  return shown(option) && !option.closest('[aria-disabled="true"],[disabled],[inert]')
}
export function visibleOptions(scopes:Element[]):HTMLElement[] {
  return [...new Set(scopes.flatMap(scope=>[...(scope.matches('[role="option"]')?[scope as HTMLElement]:[]),...scope.querySelectorAll<HTMLElement>('[role="option"]')]))]
    .filter(readableOption)
}
export function availableOptions(scopes:Element[]):HTMLElement[] {
  return visibleOptions(scopes).filter(selectableOption)
}
export function searchInput(doc:Document,key:string,scopes:Element[]):HTMLInputElement | undefined {
  const candidates=[doc.querySelector<HTMLInputElement>(dropdownSelector(key,'search')),...scopes.flatMap(scope=>[...scope.querySelectorAll<HTMLInputElement>('input[role="combobox"],input[role="searchbox"],input[type="search"]')])]
  const eligible=[...new Set(candidates)].filter((input):input is HTMLInputElement=>!!input && ['text','search'].includes(input.type) && !input.disabled && !input.readOnly && shown(input))
  return eligible.length===1?eligible[0]:undefined
}
export function search(input:HTMLInputElement,query:string) {
  const view=input.ownerDocument.defaultView!
  input.focus({preventScroll:true})
  Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype,'value')!.set!.call(input,query)
  input.dispatchEvent(new view.Event('input',{bubbles:true}))
  input.dispatchEvent(new view.Event('change',{bubbles:true}))
}
export function advance(scopes:Element[],doc:Document):boolean {
  const candidates=[...new Set(scopes.flatMap(scope=>[scope as HTMLElement,...scope.querySelectorAll<HTMLElement>('*')]))]
    .filter(element=>element.scrollHeight>element.clientHeight+1 && element.clientHeight>0 && /auto|scroll/.test(doc.defaultView!.getComputedStyle(element).overflowY))
  // Multiple independent scroll panes provide no safe traversal order.
  if(candidates.length!==1)return false
  const pane=candidates[0],previous=pane.scrollTop
  pane.scrollTop=Math.min(pane.scrollTop+Math.max(1,pane.clientHeight*.8),pane.scrollHeight-pane.clientHeight)
  if(pane.scrollTop===previous)return false
  pane.dispatchEvent(new doc.defaultView!.Event('scroll',{bubbles:true}))
  return true
}
export function waitForDropdownChange(doc:Document,ms:number,signal?:AbortSignal):Promise<void> {
  return new Promise(resolve=>{
    const observer=new doc.defaultView!.MutationObserver(done)
    const timer=setTimeout(done,Math.max(0,Math.min(ms,25)))
    function done(){clearTimeout(timer);observer.disconnect();signal?.removeEventListener('abort',done);resolve()}
    observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true})
    signal?.addEventListener('abort',done,{once:true})
    if(signal?.aborted)done()
  })
}

export function restoreScroll(scopes:Element[],position:number,doc:Document) {
  const panes=[...new Set(scopes.flatMap(scope=>[scope as HTMLElement,...scope.querySelectorAll<HTMLElement>('*')]))].filter(element=>element.clientHeight>0 && element.scrollHeight>element.clientHeight && /auto|scroll/.test(doc.defaultView!.getComputedStyle(element).overflowY))
  if(panes.length!==1)return
  panes[0].scrollTop=position;panes[0].dispatchEvent(new doc.defaultView!.Event('scroll',{bubbles:true}))
}
export async function settleField(doc:Document,valid:()=>boolean,signal?:AbortSignal,timeoutMs=500):Promise<boolean> {
  const deadline=performance.now()+timeoutMs;let stable:number | undefined
  while(performance.now()<deadline){signal?.throwIfAborted();if(valid()){stable ??=performance.now();if(performance.now()-stable>=32)return true}else stable=undefined;await waitForDropdownChange(doc,Math.min(16,deadline-performance.now()),signal)}
  return false
}
