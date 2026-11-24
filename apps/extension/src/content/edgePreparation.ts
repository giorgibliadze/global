import {EdgePreload} from './edgePreload'
import type {NormalizedVehicle,PreparationStatus} from '@auto-importer/shared'
import type {ExtensionApi} from '../services/extensionApi'
import {waitForDomReady} from '../services/domReady'
import {parseEdgePipelineText,inspectEdgeSelection} from '@auto-importer/parsers/edge'
const ttl=120000
export function edgeTextStage(id:string,stage:'DETECTING'|'EXTRACTING_TEXT'|'STARTING_TRANSFER'|'FAILED',started:number,errorCode?:string){
  if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE lifecycle]',{preparationId:id,stage:stage==='STARTING_TRANSFER'?'EDGE_IMPORT_CLICKED':stage,lane:'text',timestamp:new Date().toISOString(),durationMs:Math.round(performance.now()-started),...(errorCode?{errorCode}:{})})
}
// Independent from the photo observer: gallery/bridge mutations cannot invalidate
// verified text or prevent a click from creating its destination transfer.
export class EdgePreparation {
  status:PreparationStatus='preparing'
  private ready?:{id:string;key:string;root:Element;vehicle:NormalizedVehicle;at:number}
  private task?:Promise<void>
  private identity?:{key:string;root:Element}
  private revision=0
  private disposed=false
  private queued=false
  private listeners=new Set<(status:PreparationStatus)=>void>()
  private lifetime=new AbortController()
  private observer:MutationObserver
  private preload:EdgePreload
  private doc:Document
  private api:ExtensionApi
  private url:()=>string
  constructor(doc:Document,api:ExtensionApi,url=()=>doc.location.href){
    this.doc=doc;this.api=api;this.url=url;this.preload=new EdgePreload(doc,api,url)
    this.observer=new doc.defaultView!.MutationObserver(records=>this.changed(records))
    this.observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['content','hidden']})
    doc.defaultView?.addEventListener('popstate',this.navigation);doc.defaultView?.addEventListener('hashchange',this.navigation);doc.addEventListener('visibilitychange',this.visible)
    this.schedule()
  }
  subscribe(listener:(status:PreparationStatus)=>void){this.listeners.add(listener);listener(this.status);return()=>{this.listeners.delete(listener)}}
  private set(status:PreparationStatus){this.status=status;for(const listener of this.listeners)listener(status)}
  private irrelevant(node:Node){const element=node.nodeType===1?node as Element:node.parentElement;return !!element?.matches('.gallery,[id^="auto-importer-edge-gallery-"]')||!!element?.closest('#vdp .gallery,[id^="auto-importer-edge-gallery-"]')}
  private changed(records:MutationRecord[]){
    if(!records.some(record=>{
      if(this.irrelevant(record.target))return false
      if(record.type==='childList'&&record.addedNodes.length+record.removedNodes.length>0&&[...record.addedNodes,...record.removedNodes].every(node=>this.irrelevant(node)))return false
      const element=record.target.nodeType===1?record.target as Element:record.target.parentElement
      const field=element?.closest('.section.details .field'),label=field?.querySelector(':scope > label')?.textContent?.trim()
      if(label&&!['Manufacturer','Make','Model','Model Year','Year','Trim','Body Style','Body Type','Vehicle Category','Odometer','Odometer Reading','Vehicle Mileage','Mileage','Miles','Fuel Type','Transmission','Drive Train','Cylinders','Displacement','Color','Interior Color / Material','Doors'].includes(label))return false
      const text='h1.description,.section.details,.section.options,.overview .odometer,.overview .vin'
      return !!element?.closest('#vdp h1.description,#vdp .section.details,#vdp .section.options,#vdp .overview .odometer,#vdp .overview .vin')||element?.matches('meta[property="og:url"]')||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&((node as Element).matches('#vdp,'+text)||!!(node as Element).querySelector('#vdp,'+text)))
    }))return
    this.invalidate();this.schedule()
  }
  private invalidate(){this.revision++;this.ready=undefined;this.set('updating')}
  private flush(){this.changed(this.observer.takeRecords())}
  private navigation=()=>{try{const current=inspectEdgeSelection(this.doc,this.url());if(this.identity?.key===current.key&&this.identity.root===current.root)return}catch{/* A different vehicle may still be rendering. */}this.invalidate();this.schedule()}
  private visible=()=>{if(!this.doc.hidden)this.schedule()}
  private schedule(){if(this.queued||this.disposed||this.doc.hidden)return;this.queued=true;queueMicrotask(()=>{this.queued=false;if(!this.disposed)void this.prepare()})}
  private async send(message:unknown){
    return new Promise<unknown>((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);this.lifetime.signal.removeEventListener('abort',abort)}
      const abort=()=>{cleanup();reject(new Error('EDGE-ის მომზადება შეჩერდა.'))}
      const timer=setTimeout(()=>{cleanup();reject(Object.assign(new Error('EDGE-ის მომზადების პასუხს ვადა ამოეწურა.'),{edgeErrorCode:'BACKGROUND_TIMEOUT'}))},1500)
      this.lifetime.signal.addEventListener('abort',abort,{once:true})
      Promise.resolve().then(()=>{this.lifetime.signal.throwIfAborted();return this.api.runtime.sendMessage(message)}).then(value=>{cleanup();const result=value as {ok?:boolean;value?:unknown};if(result?.ok)resolve(result.value);else reject(new Error('EDGE-ის მონაცემები ვერ მომზადდა.'))},error=>{cleanup();reject(error)})
    })
  }
  private prepare():Promise<void>{
    this.flush();if(this.task)return this.task;if(this.disposed)return Promise.resolve()
    if(this.ready&&Date.now()-this.ready.at<ttl){try{const selected=inspectEdgeSelection(this.doc,this.url());if(selected.key===this.ready.key&&selected.root===this.ready.root)return Promise.resolve()}catch{/* A real identity change must be re-extracted. */}}
    this.ready=undefined
    const revision=this.revision,id=crypto.randomUUID(),started=performance.now(),at=Date.now()
    this.set('preparing')
    const operation=(async()=>{try{
      edgeTextStage(id,'DETECTING',started)
      const selected=inspectEdgeSelection(this.doc,this.url());this.identity=selected
      edgeTextStage(id,'EXTRACTING_TEXT',started)
      const vehicle=parseEdgePipelineText(this.doc,this.url())
      this.ready={id,key:selected.key,root:selected.root,vehicle,at:Date.now()};this.preload.textReady(id,vehicle,at);this.set('ready')
      await this.send({type:'PREFETCH_INVALIDATE',preparationId:id})
      if(this.disposed||revision!==this.revision)return
      if(!await this.send({type:'PREFETCH_PREPARE',preparationId:id,vehicle,observedAt:at}))throw new Error('EDGE-ის მომზადება შეიცვალა.')
      this.flush();const current=inspectEdgeSelection(this.doc,this.url())
      if(this.disposed||revision!==this.revision||current.key!==selected.key||current.root!==selected.root)return
      this.ready={id,key:current.key,root:current.root,vehicle,at:Date.now()};this.set('ready')
    }catch(error){if(!this.disposed&&revision===this.revision){edgeTextStage(id,'FAILED',started,error&&typeof error==='object'&&'edgeErrorCode' in error&&error.edgeErrorCode==='BACKGROUND_TIMEOUT'?'BACKGROUND_TIMEOUT':'TEXT_OR_BACKGROUND_UNAVAILABLE');if(!this.ready)this.set('error')}}})()
    this.task=operation
    void operation.finally(()=>{if(this.task===operation)this.task=undefined;if(!this.disposed&&revision!==this.revision)this.schedule()})
    return operation
  }
  async resolve(){
    const started=performance.now();this.flush()
    await waitForDomReady(this.doc,()=>{try{inspectEdgeSelection(this.doc,this.url());return true}catch{return false}},this.lifetime.signal,2000)
    const current=inspectEdgeSelection(this.doc,this.url())
    if(this.ready&&(this.ready.key!==current.key||this.ready.root!==current.root))this.invalidate()
    if(!this.ready||Date.now()-this.ready.at>=ttl){
      this.revision++;const at=Date.now(),id=crypto.randomUUID(),vehicle=parseEdgePipelineText(this.doc,this.url());this.identity=current;this.ready={id,key:current.key,root:current.root,vehicle,at:Date.now()};this.preload.textReady(id,vehicle,at);this.set('ready')
    }
    this.flush();const selected=inspectEdgeSelection(this.doc,this.url()),ready=this.ready
    if(!ready||ready.key!==selected.key||ready.root!==selected.root)throw new Error('EDGE-ის ავტომობილის მონაცემები ვერ მომზადდა. ხელახლა სცადეთ.')
    edgeTextStage(ready.id,'STARTING_TRANSFER',started)
    return {vehicle:structuredClone(ready.vehicle),preparationId:ready.id}
  }
  hasSelection(){try{inspectEdgeSelection(this.doc,this.url());return true}catch{return false}}
  verify(id:unknown){try{if(this.disposed)return false;this.flush();const selected=inspectEdgeSelection(this.doc,this.url());return !!this.ready&&this.ready.id===id&&Date.now()-this.ready.at<ttl&&this.ready.key===selected.key&&this.ready.root===selected.root}catch{return false}}
  dispose(){this.preload.dispose();this.disposed=true;this.ready=undefined;this.lifetime.abort();this.observer.disconnect();this.listeners.clear();this.doc.defaultView?.removeEventListener('popstate',this.navigation);this.doc.defaultView?.removeEventListener('hashchange',this.navigation);this.doc.removeEventListener('visibilitychange',this.visible)}
}
