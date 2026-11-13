import { activateOption } from './inputInteraction'
import { readDropdownCache, writeDropdownCache, dropdownCacheKey, optionData } from './dropdownCache'
import type { DiscoveredOption } from './dropdownCache'
import { dropdownKeys, dropdownSelector, shown, interactive, enabled, discoverLists, availableOptions, visibleOptions, selectableOption, restoreScroll, searchInput, search, advance, waitForDropdownChange } from './dropdownDom'
import { reportDropdown, safeExpected } from './dropdownDiagnostics'
import type { DropdownDiagnostic } from './dropdownDiagnostics'
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
export interface DropdownSelection { optionId: string; optionLabel: string; match: 'exact' | 'equivalent' }
export interface DropdownValue { exactText?: boolean; allowReplaceSelection?: boolean; candidates: string[]; equivalents?: string[]; engineCc?: number; engineUnit?: 'liters'; onSelected?: (selection: DropdownSelection) => void; onDiagnostic?: (diagnostic: DropdownDiagnostic) => void; onPhase?:(stage:'discovery'|'matching'|'selection')=>void; interaction?:'click'|'pointer';inspectOnly?:boolean; onOptions?:(options:DiscoveredOption[],complete:boolean)=>void }
export function optionRank(label: string, value: DropdownValue): number {
  if (value.engineCc !== undefined) {
    const match = label.trim().match(/^(\d+(?:[.,]\d+)?)\s*(ლ|l|ლიტრი|სმ³|სმ3|cc|cm3|cm³)$/i)
    // This specific MyAuto control's 0.05–13 range was confirmed by the user.
    // Bare labels are liters only when the form adapter supplies that unit contract.
    const bare = value.engineUnit==='liters' && /^\d+(?:[.,]\d+)?$/.test(label.trim()) ? Number(label.trim().replace(',','.')) : undefined
    const cc = match ? Number(match[1].replace(',', '.')) * (/^(ლ|l|ლიტრი)$/i.test(match[2]) ? 1000 : 1)
      : bare!==undefined && bare>=0.05 && bare<=13 ? bare*1000 : undefined
    if(cc===undefined)return Infinity
    if (Math.abs(cc-value.engineCc) >= 0.01) return Infinity
    return value.candidates.some(candidate => normalize(candidate) === normalize(label)) ? 0 : 1
  }
  if (value.exactText) return value.candidates.some(candidate=>label.trim()===candidate) ? 0 : Infinity
  if (value.candidates.some(candidate => normalize(candidate) === normalize(label))) return 0
  return value.equivalents?.some(candidate => normalize(candidate) === normalize(label)) ? 1 : Infinity
}
export function matchesOption(label: string, value: DropdownValue): boolean { return Number.isFinite(optionRank(label,value)) }
export async function selectDropdown(doc: Document, key: string, value: DropdownValue, timeoutMs = 3000, signal?: AbortSignal): Promise<string | undefined> {
  if(!dropdownKeys.has(key))return 'ჩამოსაშლელი ველის სელექტორი დადასტურებული არ არის.'
  let phase=''
  const announce=(stage:'discovery'|'matching'|'selection')=>{if(phase!==stage){phase=stage;value.onPhase?.(stage)}}
  announce('discovery')
  const context=dropdownCacheKey(doc,key),cached=readDropdownCache(doc,key),collected=new Map<string,DiscoveredOption>()
  let complete=false,restored=false
  const started=performance.now();let clickedAt=started,matchingMs=0
  const selector=dropdownSelector(key,'trigger'),deadline=Date.now()+timeoutMs
  const diagnostic:DropdownDiagnostic={field:key,selector,controlType:'unavailable',opened:false,optionCount:0,expected:safeExpected(value.candidates),matched:false,verified:false,outcome:'unavailable'}
  let trigger:HTMLElement | undefined,owner:HTMLElement | null=null,clicked=false,chosen=false,verifiedSince:number | undefined
  let lastSelection:DropdownSelection | undefined
  const before=new Set<Element>([...doc.querySelectorAll<HTMLElement>('[role="listbox"]')].filter(shown))
  const finish=(outcome:DropdownDiagnostic['outcome'],error?:string)=>{
    if(outcome==='selected' && lastSelection){const item=[...collected.values()].find(option=>option.label===lastSelection!.optionLabel);if(item){item.value=lastSelection.optionId;item.valueSource='selected'}}
    if(collected.size)writeDropdownCache(doc,key,[...collected.values()],complete,context)
    value.onOptions?.([...collected.values()],complete)
    diagnostic.cacheHit=!!cached
    diagnostic.discoveryMs=chosen?clickedAt-started:performance.now()-started;diagnostic.selectionMs=chosen?performance.now()-clickedAt:0;diagnostic.matchingMs=matchingMs;diagnostic.verificationMs=diagnostic.selectionMs
    diagnostic.outcome=outcome
    diagnostic.verified=outcome==='selected'
    if(diagnostic.verified && lastSelection)value.onSelected?.(lastSelection)
    ;(value.onDiagnostic ?? reportDropdown)({...diagnostic})
    return error
  }
  function confirm():boolean {
    const label=doc.querySelector(dropdownSelector(key,'value'))?.textContent?.trim() ?? ''
    const optionId=doc.querySelector<HTMLInputElement>(dropdownSelector(key,'input'))?.value
    const rank=optionRank(label,value)
    if(!optionId || optionId.length>200 || !Number.isFinite(rank))return false
    if(owner?.querySelector('[aria-busy="true"]') || owner?.getAttribute('aria-busy')==='true')return false
    lastSelection={optionId,optionLabel:label,match:rank===0?'exact':'equivalent'}
    return true
  }
  try {
    signal?.throwIfAborted()
    // Dependencies can replace/enable the control after the previous selection settles.
    while(Date.now()<deadline) {
      signal?.throwIfAborted()
      owner=doc.querySelector<HTMLElement>(dropdownSelector(key))
      trigger=interactive(doc,key)
      if(owner && trigger && enabled(trigger) && enabled(owner))break
      await waitForDropdownChange(doc,deadline-Date.now(),signal)
    }
    if(!owner || !trigger || !enabled(trigger) || !enabled(owner))return finish('unavailable','ჩამოსაშლელი ველი დროულად არ გახდა ხელმისაწვდომი. გადაამოწმეთ წინა არჩევანი.')
    diagnostic.controlType=trigger.getAttribute('role')==='combobox'?'combobox':'custom'
    if(!value.inspectOnly && confirm()){diagnostic.matched=true;return finish('selected')}
    const selected=doc.querySelector(dropdownSelector(key,'value'))?.textContent?.trim()
    if(!value.inspectOnly && selected && !value.allowReplaceSelection)return finish('protected','არსებული ჩამოსაშლელი არჩევანი არ გადაგვიწერია.')
    trigger.focus({preventScroll:true})
    if(trigger.getAttribute('aria-expanded')!=='true')activateOption(trigger,value.interaction,signal)
    clicked=true
    let searchedInput:HTMLInputElement | undefined,queryIndex=0,lastScan='',unchangedSince=Date.now(),reopened=false
    while(Date.now()<deadline) {
      signal?.throwIfAborted()
      owner=doc.querySelector<HTMLElement>(dropdownSelector(key))
      const current=interactive(doc,key)
      if(!owner || !current){await waitForDropdownChange(doc,deadline-Date.now(),signal);continue}
      trigger=current
      if(!value.inspectOnly && confirm()) {
        verifiedSince ??=Date.now()
        if(Date.now()-verifiedSince>=Math.min(32,timeoutMs/5))return finish('selected')
        // Once the selected label/ID are present, only verify stability. Do not
        // rediscover portals, rescan options or refocus search after selection.
        await waitForDropdownChange(doc,deadline-Date.now(),signal);continue
      }else verifiedSince=undefined
      // The observed search input starts hidden; use it only after the site reveals it.
      const ownSearch=searchInput(doc,key,[owner])
      if(ownSearch && doc.activeElement!==ownSearch && !chosen)ownSearch.focus({preventScroll:true})
      const scopes=discoverLists(doc,owner,trigger,before),nodes=visibleOptions(scopes),options=nodes.filter(selectableOption),enabledOptions=new Set(options)
      const scroll=scopes.map(scope=>(scope as HTMLElement).scrollTop).find(position=>position>0) ?? 0
      for(const node of nodes){const data={...optionData(node,!enabledOptions.has(node)),scrollTop:scroll};collected.set(data.label+'|'+(data.value ?? ''),data)}
      const cachedMatch=cached?.options.find(option=>!option.disabled && Number.isFinite(optionRank(option.label,value)))
      if(!restored && cachedMatch?.scrollTop){restoreScroll(scopes,cachedMatch.scrollTop,doc);restored=true}
      diagnostic.opened ||= trigger.getAttribute('aria-expanded')==='true' || scopes.length>1 || options.length>0 || !!ownSearch
      diagnostic.optionCount=Math.max(diagnostic.optionCount,options.length)
      if(!chosen && options.length)announce('matching')
      const matchingStarted=performance.now()
      const best=Math.min(...options.map(option=>optionRank(option.getAttribute('aria-label') ?? option.textContent ?? '',value)))
      const matches=Number.isFinite(best)?options.filter(option=>optionRank(option.getAttribute('aria-label') ?? option.textContent ?? '',value)===best):[]
      matchingMs+=performance.now()-matchingStarted
      if(!value.inspectOnly && !chosen && matches.length>1)return finish('ambiguous','ერთზე მეტი შესაბამისი ვარიანტია. არჩევანი არ შესრულდა.')
      if(!value.inspectOnly && !chosen && matches.length===1){diagnostic.matched=true;announce('selection');clickedAt=performance.now();activateOption(matches[0],value.interaction,signal);chosen=true;continue}
      if(!chosen) {
        const input=searchInput(doc,key,scopes)
        const queries=value.inspectOnly?[]:[...new Set([...(cachedMatch?[cachedMatch.label]:[]),...value.candidates,...(value.equivalents ?? [])])]
        if(input && searchedInput!==input && queries.length){search(input,queries[queryIndex]);searchedInput=input;lastScan='';unchangedSince=Date.now()}
        const signature=options.map(option=>option.textContent).join('|')
        if(signature!==lastScan){lastScan=signature;unchangedSince=Date.now()}
        const busy=scopes.some(scope=>scope.matches('[aria-busy="true"]') || !!scope.querySelector('[aria-busy="true"],[role="progressbar"]'))
        if(!busy && Date.now()-unchangedSince>=Math.min(150,timeoutMs/4)) {
          if(advance(scopes,doc)){unchangedSince=Date.now();lastScan=''}
          else if(value.inspectOnly && collected.size){const expectedCount=Math.max(0,...scopes.flatMap(scope=>[...scope.querySelectorAll('[aria-setsize]')]).map(node=>Number(node.getAttribute('aria-setsize'))||0));complete=expectedCount<=collected.size;return finish('inspected')}
          else if(input && queryIndex+1<queries.length){queryIndex++;search(input,queries[queryIndex]);unchangedSince=Date.now();lastScan=''}
          // A closed control gets one bounded retry. Never re-click a chosen option.
          else if(!diagnostic.opened && !reopened && Date.now()+100<deadline){trigger.click();reopened=true;unchangedSince=Date.now()}
        }
      }
      await waitForDropdownChange(doc,deadline-Date.now(),signal)
    }
    return chosen?finish('not-verified','ვარიანტი დაჭერილია, მაგრამ არჩეული სახელი და მნიშვნელობა ფორმამ არ დაადასტურა.'):diagnostic.optionCount?finish('not-matched','ვარიანტები ჩაიტვირთა, მაგრამ ზუსტი ან დადასტურებული შესაბამისობა ვერ მოიძებნა.'):finish('not-discovered','ველის ვარიანტები ვერ წაიკითხა. საჭიროა გახსნილი ჩამოსაშლელი სიის სტრუქტურის შემოწმება.')
  } catch {
    signal?.throwIfAborted()
    return finish('interaction-error','ჩამოსაშლელ ველთან მოქმედება ვერ შესრულდა. დანარჩენი ველების შევსება გაგრძელდება.')
  } finally {
    const stillOpen=owner && trigger && (trigger.getAttribute('aria-expanded')==='true' || !!owner.querySelector('[aria-expanded="true"]') || !!searchInput(doc,key,[owner]) || availableOptions(discoverLists(doc,owner,trigger,before)).length>0)
    if(clicked && trigger?.isConnected && stillOpen) {
      const escapeTarget=owner?.contains(doc.activeElement)?doc.activeElement:trigger
      escapeTarget?.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
      if(trigger.getAttribute('aria-expanded')==='true')trigger.click()
    }
  }
}

export async function discoverDropdownOptions(doc:Document,key:string,timeoutMs=3000,signal?:AbortSignal):Promise<{options:DiscoveredOption[];complete:boolean;error?:string}> {
  let options:DiscoveredOption[]=[],complete=false
  const error=await selectDropdown(doc,key,{candidates:[],inspectOnly:true,onOptions:(data,done)=>{options=data;complete=done}},timeoutMs,signal)
  return {options,complete,error}
}
