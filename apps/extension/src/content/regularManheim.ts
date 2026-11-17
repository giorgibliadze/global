import {pipelineLog} from '../services/diagnostics'
import type {VehicleAdapter} from './sourceAdapters'

// One observer and one activation per document, independently of Manheim24.
const watchers=new WeakMap<Document,()=>void>()
export function watchRegularManheim(doc:Document,adapter:VehicleAdapter,activate:()=>()=>void,url=()=>doc.location.href){
  if(adapter.id!=='ManheimSite'&&adapter.id!=='ManheimSearch')throw new Error('Manheim-ის ადაპტერი არასწორია.')
  const existing=watchers.get(doc);if(existing)return existing
  const view=doc.defaultView!
  const nav=(view as unknown as {navigation?:EventTarget}).navigation
  let stop:(()=>void)|undefined,selected:ReturnType<VehicleAdapter['selection']>|undefined
  let blocked:typeof selected,route=url(),queued=false,disposed=false,suspended=false
  const deactivate=()=>{const cleanup=stop;stop=undefined;try{cleanup?.()}catch{pipelineLog(undefined,'cleanup','failed')}}
  const check=()=>{
    if(disposed||suspended)return
    const currentUrl=url()
    if(currentUrl!==route){
      // Do not keep the previous parser/launcher alive across a route change.
      // VIN hash routes independently validate the new DOM; unstructured Site
      // paths additionally require replacement identity/root before activation.
      let sameView=false
      try{const previous=new URL(route),current=new URL(currentUrl);sameView=previous.pathname===current.pathname&&previous.hash===current.hash}catch{/* Invalid URL stays ineligible. */}
      blocked=sameView||/#\/details\/[A-HJ-NPR-Z0-9]{17}\//i.test(currentUrl)?undefined:selected
      route=currentUrl;deactivate()
    }
    let next:typeof selected
    try{if(doc.querySelector(adapter.rootSelector))next=adapter.selection(doc,currentUrl)}catch{/* Results, login or incomplete vehicle DOM. */}
    if(blocked&&next?.key===blocked.key&&next.root===blocked.root)next=undefined
    if(!next){deactivate();return}
    blocked=undefined;selected=next
    if(!stop)try{stop=activate()}catch{pipelineLog(undefined,'detecting','failed')}
  }
  const schedule=()=>{if(queued||disposed||suspended)return;queued=true;queueMicrotask(()=>{queued=false;check()})}
  const containsRoot=(node:Node)=>node.nodeType===1&&((node as Element).matches(adapter.rootSelector)||!!(node as Element).querySelector(adapter.rootSelector))
  const observer=new view.MutationObserver(records=>{
    if(records.some(record=>{
      const target=record.target.nodeType===1?record.target as Element:record.target.parentElement
      return record.type==='attributes'&&record.attributeName==='data-test-id'&&containsRoot(record.target)||!!target?.closest(adapter.rootSelector)||record.type==='attributes'&&!!selected&&!!target?.contains(selected.root)||[...record.addedNodes,...record.removedNodes].some(containsRoot)
    }))schedule()
  })
  const observe=()=>observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-test-id','data-testid','data-key','data-vin','hidden','aria-hidden','style','class']})
  const pagehide=(event:PageTransitionEvent)=>{
    if(!event.persisted){dispose();return}
    suspended=true;observer.disconnect();deactivate()
  }
  const pageshow=(event:PageTransitionEvent)=>{if(event.persisted&&!disposed){suspended=false;observe();schedule()}}
  function dispose(){
    if(disposed)return
    disposed=true;observer.disconnect();deactivate()
    view.removeEventListener('hashchange',schedule);view.removeEventListener('popstate',schedule)
    view.removeEventListener('pagehide',pagehide);view.removeEventListener('pageshow',pageshow)
    nav?.removeEventListener('currententrychange',schedule)
    if(watchers.get(doc)===dispose)watchers.delete(doc)
  }
  watchers.set(doc,dispose);observe()
  view.addEventListener('hashchange',schedule);view.addEventListener('popstate',schedule)
  view.addEventListener('pagehide',pagehide);view.addEventListener('pageshow',pageshow)
  nav?.addEventListener('currententrychange',schedule)
  check();return dispose
}
