import {commitTurn} from './inputInteraction'
import {optionRank} from './dropdowns'
import {shown} from './dropdownDom'
import {readDropdownCache,writeDropdownCache,optionData} from './dropdownCache'
import {selectedOption} from './myautoContract'
import type {FormField} from './myauto'
import type {FieldResult} from '@auto-importer/shared'

function ready(doc:Document,test:()=>boolean,timeout:number,signal?:AbortSignal):Promise<boolean>{
  if(test())return Promise.resolve(true)
  return new Promise((resolve,reject)=>{
    const observer=new doc.defaultView!.MutationObserver(check)
    const timer=setTimeout(()=>finish(false),timeout)
    const abort=()=>{clean();reject(signal?.reason)}
    function clean(){clearTimeout(timer);observer.disconnect();signal?.removeEventListener('abort',abort)}
    function finish(value:boolean){clean();resolve(value)}
    function check(){if(signal?.aborted)abort();else if(test())finish(true)}
    observer.observe(doc.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});signal?.addEventListener('abort',abort,{once:true});check()
  })
}
export class DropdownAdapter {
  private doc:Document
  private processed=new Set<string>()
  constructor(doc:Document){this.doc=doc}
  async select(field:FormField,signal?:AbortSignal,timeout=1500):Promise<FieldResult>{
    const key=field.dropdownKey!,doc=this.doc
    const result:FieldResult={key:field.field,field:field.label,status:'unfilled',code:'unresolved',reason:'შესაბამისი ვარიანტი ვერ მოიძებნა.'}
    if(doc.defaultView!.innerWidth<768){Object.assign(result,{status:'unverified',code:'unverified',reason:'MyAuto-ს მობილური მოდალის არჩევანი ამ ადაპტერით არ შემოწმებულა; სია არ გახსნილა.'});return result}
    if(this.processed.has(key)){result.reason='ეს ველი უკვე დამუშავდა; განმეორებითი სია არ გახსნილა.';return result}this.processed.add(key)
    const owner=()=>doc.querySelector<HTMLElement>(`[data-testid="single-select-primaryFeatures.${key}"]`)
    const trigger=()=>doc.querySelector<HTMLElement>(`[data-testid="single-select-trigger-primaryFeatures.${key}"]`)
    const usable=()=>!!owner() && !!trigger() && shown(owner()!) && shown(trigger()!)
    if(!usable() && (key!=='model' || !await ready(doc,usable,timeout,signal))){Object.assign(result,{code:'unavailable',retryable:true,reason:'ველი გამორთულია ან მისი დამოკიდებული მონაცემები არ ჩაიტვირთა.'});return result}
    const label=doc.querySelector(`[data-testid="single-select-value-primaryFeatures.${key}"]`)?.textContent?.trim()
    if(label){Object.assign(result,{code:'protected',reason:'არსებული არჩევანი არ გადაგვიწერია.'});return result}
    const menu=()=>owner()?.querySelector<HTMLElement>(`[data-testid="single-select-dropdown-primaryFeatures.${key}"]`)
    const prefix=`single-select-option-primaryFeatures.${key}-`,child=`single-select-child-option-primaryFeatures.${key}-`
    const options=()=>[...menu()?.querySelectorAll<HTMLElement>('[data-testid]') ?? []].filter(node=>{const id=node.dataset.testid??'';return(id.startsWith(prefix)||id.startsWith(child)) && !node.classList.contains('opacity-40') && shown(node)})
    const noData=()=>!!menu()?.querySelector(`[data-testid="single-select-no-data-primaryFeatures.${key}"]`)
    signal?.throwIfAborted();trigger()!.click();await commitTurn(doc,signal)
    try{
      if(!await ready(doc,()=>options().length>0 || noData(),timeout,signal)){Object.assign(result,{code:'unverified',status:'unverified',reason:'გახსნილი სიის რეალური კონტრაქტი ვერ წაიკითხა; დამატებითი მცდელობა არ შესრულდა.'});return result}
      const initial=options();writeDropdownCache(doc,key,initial.map(node=>({...optionData(node),value:(node.dataset.testid??'').slice((node.dataset.testid??'').startsWith(child)?child.length:prefix.length),valueSource:'attribute'})))
      const cached=readDropdownCache(doc,key)?.options.find(option=>!option.disabled&&Number.isFinite(optionRank(option.label,field.optionValue!)))
      const queries=[undefined,...new Set([...(cached?[cached.label]:[]),...(field.optionValue?.candidates??[]),...(field.optionValue?.equivalents??[])])]
      for(const query of queries){
        if(query!==undefined){
          const search=owner()?.querySelector<HTMLInputElement>(`[data-testid="single-select-search-primaryFeatures.${key}"]`)
          if(!search || search.type==='hidden')break
          Object.getOwnPropertyDescriptor(doc.defaultView!.HTMLInputElement.prototype,'value')!.set!.call(search,query)
          search.dispatchEvent(new doc.defaultView!.Event('input',{bubbles:true}));await commitTurn(doc,signal)
        }
        const candidates=options(),best=Math.min(...candidates.map(node=>optionRank(node.textContent??'',field.optionValue!)))
        const matches=candidates.filter(node=>Number.isFinite(best)&&optionRank(node.textContent??'',field.optionValue!)===best)
        if(matches.length>1){result.reason='ერთზე მეტი ზუსტი ვარიანტია; არჩევანი არ შესრულდა.';return result}
        if(matches.length===1){
          const option=matches[0],id=option.dataset.testid!,optionId=id.slice(id.startsWith(child)?child.length:prefix.length)
          Object.assign(result,{optionId,optionLabel:option.textContent!.trim(),match:best===0?'exact':'equivalent',evidence:'myauto-option'})
          option.click();await commitTurn(doc,signal)
          if(selectedOption(doc,key,result))Object.assign(result,{status:'filled',persisted:true,code:undefined,reason:'შევსებულია და შენარჩუნებულია'})
          else Object.assign(result,{status:'unverified',code:'unverified',reason:'კონტროლერის შენახული არჩევანი ვერ გადამოწმდა.'})
          return result
        }
      }
      return result
    }finally{
      // Actual desktop component toggles on its trigger, not Escape. Close once.
      if(menu())trigger()?.click()
      await commitTurn(doc,signal)
    }
  }
}
