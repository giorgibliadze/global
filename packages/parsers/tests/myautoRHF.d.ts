declare module 'virtual:myauto-rhf' {
  import type {ComponentType,PropsWithChildren} from 'react'
  interface Field {name:string;value:unknown;onChange:(event:unknown)=>void;onBlur:()=>void;ref:(node:HTMLElement|null)=>void}
  interface Methods extends Record<string,unknown> {getValues:()=>Record<string,unknown>;setValue:(name:string,value:unknown,options?:Record<string,boolean>)=>void}
  export function useForm(options:Record<string,unknown>):Methods
  export function useController(options:Record<string,unknown>):{field:Field}
  export function useWatch(options?:Record<string,unknown>):unknown
  export const FormProvider:ComponentType<PropsWithChildren<Record<string,unknown>>>
}
