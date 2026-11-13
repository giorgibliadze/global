import { dropdownKeys, dropdownSelector } from './dropdownDom'
import { safeExpected } from './dropdownDiagnostics'
export interface DiscoveredOption { label:string;value?:string;valueSource?:'native'|'attribute'|'selected';disabled:boolean;scrollTop?:number }
export const OPTION_CACHE_TTL_MS=120000
interface Entry { options:DiscoveredOption[];expires:number;complete:boolean }
const stores=new WeakMap<Document,Map<string,Entry>>()
const tokens=new WeakMap<Element,number>();let nextToken=0
const token=(element:Element)=>{let id=tokens.get(element);if(id===undefined){id=++nextToken;tokens.set(element,id)}return id}
function safe(value:string){return safeExpected([value])[0]===value}
export function dropdownCacheKey(doc:Document,key:string):string | undefined {
  const owner=doc.querySelector(dropdownSelector(key)) ?? doc.querySelector(`select[name="primaryFeatures.${key}"]`)
  if(!owner || !dropdownKeys.has(key))return
  const root=owner.closest('form') ?? doc.body
  const locale=doc.documentElement.lang || 'und'
  if(!/^[a-z-]{1,20}$/i.test(locale))return
  // Conservatively include all other dropdown selections, since live dependencies may
  // exceed manufacturer → model. No VIN, listing data, query strings or session state.
  const dependencies=[...dropdownKeys].filter(field=>field!==key).map(field=>{
    const value=doc.querySelector<HTMLInputElement>(dropdownSelector(field,'input'))?.value || doc.querySelector(dropdownSelector(field,'value'))?.textContent?.trim() || doc.querySelector<HTMLSelectElement>(`select[name="primaryFeatures.${field}"]`)?.value || ''
    return safe(value)?`${field}:${value}`:undefined
  })
  if(dependencies.some(value=>value===undefined))return
  const version=root.getAttribute('data-form-version') ?? root.getAttribute('data-version') ?? ''
  let versionHash=0;for(const character of version.slice(0,200))versionHash=(versionHash*31+character.charCodeAt(0))|0
  const location=doc.location
  return JSON.stringify([location?.hostname ?? 'fixture',location?.pathname?.match(/^\/ka\/add\/?$/)?.[0] ?? 'other',locale,versionHash,token(root),token(owner),key,...dependencies])
}
export function readDropdownCache(doc:Document,key:string,now=performance.now()):Entry | undefined {
  const store=stores.get(doc),cacheKey=dropdownCacheKey(doc,key)
  if(!store || !cacheKey)return
  for(const [id,entry] of store)if(entry.expires<now)store.delete(id)
  const entry=store.get(cacheKey)
  return entry?structuredClone(entry):undefined
}
export function writeDropdownCache(doc:Document,key:string,options:DiscoveredOption[],complete=false,context=dropdownCacheKey(doc,key)) {
  if(!context || context!==dropdownCacheKey(doc,key))return
  const store=stores.get(doc) ?? new Map<string,Entry>();stores.set(doc,store)
  const clean=options.filter(option=>safe(option.label) && (!option.value || safe(option.value))).slice(0,1000)
  store.set(context,{options:structuredClone(clean),complete,expires:performance.now()+OPTION_CACHE_TTL_MS})
  while(store.size>64)store.delete(store.keys().next().value!)
}
export function invalidateDropdownCache(doc:Document){stores.delete(doc)}
export function optionData(option:HTMLElement,disabled?:boolean):DiscoveredOption {
  const native=option.tagName==='OPTION'
  const value=native?(option as HTMLOptionElement).value:option.getAttribute('data-value') ?? option.getAttribute('value') ?? undefined
  return {label:option.getAttribute('aria-label') ?? option.textContent?.trim() ?? '',value:value && /^[a-z0-9._-]{1,80}$/i.test(value) && safe(value)?value:undefined,valueSource:value?(native?'native':'attribute'):undefined,disabled:disabled ?? (option.hasAttribute('disabled') || option.getAttribute('aria-disabled')==='true')}
}
