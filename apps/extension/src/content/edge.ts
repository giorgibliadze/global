import {edgePipelineAdapter} from './sourceAdapters'
const watchers=new WeakMap<Document,()=>void>()
// Bounded work on relevant mutations only; SPA roots are validated by the adapter.
export function watchEdge(doc:Document,activate:()=>()=>void){
  const previous=watchers.get(doc);if(previous)return previous
  let suspended=false
  const navigation=(doc.defaultView as unknown as {navigation?:EventTarget})?.navigation
  let stop:(()=>void)|undefined,queued=false,disposed=false
  const check=()=>{if(disposed||suspended)return;let valid=false;try{valid=!!edgePipelineAdapter.selection(doc,doc.URL)}catch{/* Unrelated or incomplete page. */}if(valid&&!stop)stop=activate();if(!valid&&stop){stop();stop=undefined}}
  const schedule=()=>{if(queued||disposed||suspended)return;queued=true;queueMicrotask(()=>{queued=false;check()})}
  let revision=0
  const observer=new doc.defaultView!.MutationObserver(records=>{
    // Generic photo waits watch src/DOM changes. EDGE lazy loaders may update
    // only data-src, so emit one inert scoped revision per relevant batch.
    if(records.some(record=>record.type==='attributes'&&['data-src','data-full','data-img','data-thumb'].includes(record.attributeName??'')&&(record.target as Element).closest('#vdp .gallery'))){
      const root=doc.querySelector('#vdp')
      if(root){let marker=root.querySelector('#auto-importer-edge-gallery-revision');if(!marker){marker=doc.createElement('script');marker.id='auto-importer-edge-gallery-revision';marker.setAttribute('type','application/json');root.append(marker)}marker.textContent=String(++revision)}
    }
if(records.some(r=>{const el=r.target.nodeType===1?r.target as Element:r.target.parentElement;return !!el?.closest('#vdp')||el?.matches('meta[property="og:url"]')||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&((n as Element).matches('#vdp')||!!(n as Element).querySelector('#vdp')))}))schedule()})
  const observe=()=>observer.observe(doc.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['content','data-src','data-full','data-img','data-thumb']})
  const pagehide=(event:PageTransitionEvent)=>{if(!event.persisted){dispose();return}suspended=true;observer.disconnect();stop?.();stop=undefined}
  const pageshow=(event:PageTransitionEvent)=>{if(event.persisted&&!disposed){suspended=false;observe();schedule()}}
  const dispose=()=>{if(disposed)return;disposed=true;observer.disconnect();stop?.();stop=undefined;doc.defaultView?.removeEventListener('popstate',schedule);doc.defaultView?.removeEventListener('hashchange',schedule);doc.defaultView?.removeEventListener('pagehide',pagehide);doc.defaultView?.removeEventListener('pageshow',pageshow);navigation?.removeEventListener('currententrychange',schedule);if(watchers.get(doc)===dispose)watchers.delete(doc)}
  doc.defaultView?.addEventListener('popstate',schedule);doc.defaultView?.addEventListener('hashchange',schedule);doc.defaultView?.addEventListener('pagehide',pagehide);doc.defaultView?.addEventListener('pageshow',pageshow);navigation?.addEventListener('currententrychange',schedule);watchers.set(doc,dispose);observe();check();return dispose
}
