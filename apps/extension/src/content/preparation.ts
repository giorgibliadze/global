import { waitForDomReady } from '../services/domReady'
import { inspectManheim24Selection, parseManheim24 } from '@auto-importer/parsers'
import type { NormalizedVehicle, PreparationStatus } from '@auto-importer/shared'
import type { ExtensionApi } from '../services/extensionApi'

export const PREPARATION_TTL=120000
interface Ready {id:string;key:string;vehicle:NormalizedVehicle;at:number;root:Element}
export class VehiclePreparation {
  private observedAt=Date.now()
  private hasPrepared=false
  private generation=0
  private ready?:Ready
  private task?:Promise<void>
  private scheduled=false
  private disposed=false
  private route:string
  private blocked?:{key:string;root:Element}
  private observer:MutationObserver
  private lastKey?:{key:string;root:Element}
  private listeners=new Set<(status:PreparationStatus)=>void>()
  status:PreparationStatus='preparing'
  private doc:Document
  private api:ExtensionApi
  private url:()=>string
  private lifetime=new AbortController()
  constructor(doc:Document,api:ExtensionApi,url=()=>doc.location.href) {
    this.doc=doc;this.api=api;this.url=url
    this.route=url()
    try{this.lastKey=inspectManheim24Selection(doc)}catch{ /* Details may render later. */ }
    this.observer=new doc.defaultView!.MutationObserver(records=>this.changed(records))
    this.observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','style','class','src']})
    doc.defaultView?.addEventListener('hashchange',this.navigation)
    doc.defaultView?.addEventListener('popstate',this.navigation)
    this.schedule()
  }
  subscribe(listener:(status:PreparationStatus)=>void){this.listeners.add(listener);listener(this.status);return()=>{this.listeners.delete(listener)}}
  private setStatus(status:PreparationStatus){this.status=status;for(const listener of this.listeners)listener(status)}
  private async send<T>(message:unknown):Promise<T>{const result=await this.api.runtime.sendMessage(message) as {ok:boolean;value:T};if(!result?.ok)throw new Error('მონაცემები ვერ მომზადდა');return result.value}
  private navigation=()=>{
    if(this.route===this.url())return
    this.route=this.url();this.observedAt=Date.now();this.blocked=this.lastKey;this.invalidate();this.schedule()
  }
  private relevant(records:MutationRecord[]){
    return records.some(record=>{
      const element=record.target.nodeType===1?record.target as Element:record.target.parentElement
      if(record.type==='attributes' && ['class','style'].includes(record.attributeName ?? '') && !element?.matches('.VehicleDetails__container') && !element?.contains(this.lastKey?.root ?? null) && !element?.querySelector('.VehicleDetails__container'))return false
      if(element?.closest('.VehicleDetails__container'))return true
      if(record.type==='attributes' && ((this.lastKey?.root && element?.contains(this.lastKey.root)) || element?.querySelector('.VehicleDetails__container')))return true
      return [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1 && ((node as Element).matches('.VehicleDetails__container') || !!(node as Element).querySelector('.VehicleDetails__container')))
    })
  }
  private changed(records:MutationRecord[]){
    this.navigation()
    if(this.relevant(records)){
      if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1 && ((node as Element).matches('.VehicleDetails__container') || !!(node as Element).querySelector('.VehicleDetails__container')))))this.observedAt=Date.now()
      this.invalidate();this.schedule()
    }
  }
  private flush(){this.changed(this.observer.takeRecords())}
  private invalidate(){if(this.ready)this.observedAt=Date.now();this.generation++;this.ready=undefined;this.setStatus(this.hasPrepared?'updating':'preparing')}
  private selection(){
    const selected=inspectManheim24Selection(this.doc)
    if(this.blocked && selected.key===this.blocked.key)throw new Error('ავტომობილის გვერდი ჯერ ახლდება.')
    this.blocked=undefined;this.lastKey=selected;return selected
  }
  private schedule(){
    if(this.scheduled || this.disposed)return
    this.scheduled=true
    queueMicrotask(()=>{this.scheduled=false;if(!this.disposed)void this.prepare()})
  }
  private prepare():Promise<void>{
    if(this.disposed)return Promise.resolve()
    this.flush()
    if(this.task)return this.task
    this.setStatus(this.hasPrepared?'updating':'preparing')
    // A page may sit without a detail panel for a long time. Start a fresh
    // observation window rather than submitting an expired prefetch timestamp.
    if(Date.now()-this.observedAt>=PREPARATION_TTL/2)this.observedAt=Date.now()
    const generation=this.generation,id=crypto.randomUUID(),observedAt=this.observedAt
    const operation=(async()=>{
      try{
        // Invalidation and publication are ordered per source document. Never
        // send raw DOM/JSON, tokens, cookies or full-resolution photo bytes.
        await this.send({type:'PREFETCH_INVALIDATE',preparationId:id})
        this.flush();if(generation!==this.generation)return
        const selected=this.selection(),vehicle=parseManheim24(this.doc)
        if(!await this.send<boolean>({type:'PREFETCH_PREPARE',preparationId:id,vehicle,observedAt}))throw new Error('მომზადება ჩანაცვლებულია.')
        this.flush();if(this.disposed || generation!==this.generation)return
        const current=this.selection()
        if(current.key!==selected.key || current.root!==selected.root)return
        this.ready={id,key:selected.key,vehicle,root:selected.root,at:Date.now()};this.hasPrepared=true;this.setStatus('ready')
      }catch{if(generation===this.generation && !this.disposed)this.setStatus('error')}
    })()
    this.task=operation
    void operation.finally(()=>{if(this.task===operation)this.task=undefined;if(!this.disposed && generation!==this.generation)this.schedule()})
    return operation
  }
  async resolve():Promise<{vehicle:NormalizedVehicle;preparationId:string}>{
    this.flush()
    await waitForDomReady(this.doc,()=>{this.flush();try{this.selection();return true}catch{return false}},this.lifetime.signal,3000)
    for(let attempt=0;attempt<3;attempt++){
      this.lifetime.signal.throwIfAborted()
      const selected=this.selection()
      if(this.ready && Date.now()-this.ready.at<PREPARATION_TTL && this.ready.key===selected.key && this.ready.root===selected.root)return {vehicle:structuredClone(this.ready.vehicle),preparationId:this.ready.id}
      if(this.ready)this.invalidate()
      await this.prepare();this.flush()
      if(this.ready)return {vehicle:structuredClone(this.ready.vehicle),preparationId:this.ready.id}
    }
    throw new Error('მონაცემები ვერ მომზადდა. დაელოდეთ ავტომობილის დეტალების ჩატვირთვას და ხელახლა სცადეთ.')
  }
  verify(id:unknown):boolean {
    try{this.flush();const selected=this.selection();return !!this.ready && this.ready.id===id && Date.now()-this.ready.at<PREPARATION_TTL && selected.key===this.ready.key && selected.root===this.ready.root}catch{return false}
  }
  dispose(){this.lifetime.abort();this.disposed=true;this.generation++;this.ready=undefined;this.observer.disconnect();this.doc.defaultView?.removeEventListener('hashchange',this.navigation);this.doc.defaultView?.removeEventListener('popstate',this.navigation);this.listeners.clear()}
}
