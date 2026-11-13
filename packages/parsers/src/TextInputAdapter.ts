import {commitTurn} from './inputInteraction'
import {shown} from './dropdownDom'
import {fitDescription} from './descriptionFit'
import type {FormField} from './myauto'
import type {FieldResult} from '@auto-importer/shared'
type Control=HTMLInputElement|HTMLTextAreaElement
export class TextInputAdapter {
  private doc:Document
  private controls=new Map<string,Control|null>()
  constructor(doc:Document,fields:FormField[]){this.doc=doc;for(const field of fields)this.controls.set(field.field,field.selector?doc.querySelector<Control>(field.selector):null)}
  resolve(field:FormField):Control|null {
    const cached=this.controls.get(field.field)
    if(cached?.isConnected)return cached
    const live=field.selector?this.doc.querySelector<Control>(field.selector):null;this.controls.set(field.field,live);return live
  }
  async populate(fields:FormField[],vin:string,options:{signal?:AbortSignal;guard?:()=>void;protected:(key:string)=>boolean;recovering?:string[]}):Promise<FieldResult[]> {
    const results:FieldResult[]=[],view=this.doc.defaultView!
    for(const field of fields){
      options.guard?.();options.signal?.throwIfAborted()
      const result:FieldResult={key:field.field,field:field.label,status:'unfilled',reason:'წყაროში მონაცემი არ არის.',code:'missing'};results.push(result)
      if(field.value===undefined || field.value==='')continue
      const input=this.resolve(field)
      if(!input || !shown(input) || input.disabled || input.readOnly){Object.assign(result,{code:'unavailable',reason:'რეალური ტექსტური ველი მიუწვდომელია.',retryable:false});continue}
      if(field.field==='description' && this.doc.querySelector('[data-testid="description-locale-tab-ka"]')?.getAttribute('aria-pressed')!=='true'){Object.assign(result,{code:'protected',reason:'აღწერის ქართული ჩანართი აქტიური არ არის; სხვა ენის ტექსტს არ გადაგვიწერია.'});continue}
      if(field.field==='description'){
        const fitted=fitDescription(field.value,input.maxLength,vin);field.value=fitted.text
        result.omissions=fitted.omissions;result.reviewRequired=fitted.criticalOmitted
      }
      if(!field.value || (input.maxLength>=0 && field.value.length>input.maxLength) || field.field==='mileageKm' && !/^\d{1,6}$/.test(field.value)){
        Object.assign(result,{code:'unresolved',reason:'მონაცემი ველის რეალურ ლიმიტს არ შეესაბამება. ორიგინალი არ შემოკლებულა.'});continue
      }
      if(options.protected(field.field) || input.value && input.value!==field.value && !options.recovering?.includes(field.field)){
        Object.assign(result,{code:'protected',reason:'მომხმარებლის მნიშვნელობა არ გადაგვიწერია.'});continue
      }
      if(input.value!==field.value){
        const prototype=input.tagName==='TEXTAREA'?view.HTMLTextAreaElement.prototype:view.HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(input,field.value)
        // MyAuto Be/Description commit through React onChange; no focus, blur,
        // keyboard fabrication or second change event is required by these handlers.
        input.dispatchEvent(new view.InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:field.value}))
      }
      Object.assign(result,{status:'unverified',code:'unverified',evidence:'react-value',reason:'ჩარჩოს განახლების დადასტურება მიმდინარეობს.'})
    }
    await commitTurn(this.doc,options.signal)
    for(const result of results)if(result.evidence==='react-value'){
      const field=fields.find(item=>item.field===result.key)!,input=this.resolve(field)
      // Be is controlled by Controller.value. A native value mutation alone does
      // not update defaultValue; React's completed controlled render does.
      if(input && input.value===field.value && input.defaultValue===field.value && input.getAttribute('aria-invalid')!=='true')Object.assign(result,{status:'filled',persisted:true,code:undefined,reason:'შევსებულია და შენარჩუნებულია'})
      else result.reason='React-ის შენახული მნიშვნელობა ვერ გადამოწმდა; არ შესრულდა განმეორებითი შეყვანა.'
    }
    return results
  }
}
