import {pipelineLog} from '../services/diagnostics'
import type {VehicleAdapter} from './sourceAdapters'

// Domain-wide DOM initialization, but no parser registration, runtime traffic,
// launcher or page modification until a known vehicle component is verified.
export function watchSiteManheim(doc:Document,adapter:VehicleAdapter,activate:()=>()=>void,url=()=>doc.location.href){
  let stop:(()=>void)|undefined,root:Element|undefined,queued=false,disposed=false
  const containsRoot=(node:Node)=>node.nodeType===1&&((node as Element).matches(adapter.rootSelector)||!!(node as Element).querySelector(adapter.rootSelector))
  const schedule=()=>{
    if(queued||disposed)return
    queued=true;queueMicrotask(()=>{queued=false;check()})
  }
  const deactivate=()=>{const cleanup=stop;stop=undefined;try{cleanup?.()}catch{pipelineLog(undefined,'cleanup','failed')}}
  function check(){
    if(disposed)return
    let selected:ReturnType<VehicleAdapter['selection']>|undefined
    try{if(doc.querySelector(adapter.rootSelector))selected=adapter.selection(doc,url())}catch{/* Ordinary/incomplete/login page. */}
    root=selected?.root
    if(!selected){deactivate();return}
    if(!stop)try{stop=activate()}catch{stop=undefined;pipelineLog(undefined,'detecting','failed')}
  }
  const observer=new doc.defaultView!.MutationObserver(records=>{
    if(records.some(record=>{
      const target=record.target.nodeType===1?record.target as Element:record.target.parentElement
      return !!target?.closest(adapter.rootSelector)||record.type==='attributes'&&!!root&&!!target?.contains(root)||[...record.addedNodes,...record.removedNodes].some(containsRoot)
    }))schedule()
  })
  observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-key','data-vin','hidden','aria-hidden','style','class']})
  const view=doc.defaultView!
  view.addEventListener('hashchange',schedule);view.addEventListener('popstate',schedule)
  const dispose=()=>{disposed=true;observer.disconnect();view.removeEventListener('hashchange',schedule);view.removeEventListener('popstate',schedule);view.removeEventListener('pagehide',dispose);deactivate()}
  view.addEventListener('pagehide',dispose,{once:true});check()
  return dispose
}
