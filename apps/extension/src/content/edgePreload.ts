import type {NormalizedVehicle} from '@auto-importer/shared'
import type {ExtensionApi} from '../services/extensionApi'
import {inspectEdgeSelection,inspectEdgePhotos,parseEdgePipelineText} from '@auto-importer/parsers/edge'
// Event-driven source discovery. No destination navigation, image decoding or
// download wait occurs in this content script or its text-ready path.
export class EdgePreload {
  private observer:MutationObserver
  private queued=false
  private running=false
  private dirty=false
  private disposed=false
  private id=crypto.randomUUID()
  private generation=crypto.randomUUID()
  private selection?:{key:string;root:Element}
  private signature=''
  private prepared?:{id:string;vehicle:NormalizedVehicle;at:number;observedAt:number}
  private pageAt=Date.now()
  private doc:Document
  private api:ExtensionApi
  private url:()=>string
  constructor(doc:Document,api:ExtensionApi,url:()=>string){
    this.doc=doc;this.api=api;this.url=url
    this.observer=new doc.defaultView!.MutationObserver(records=>{if(records.some(record=>{const element=record.target.nodeType===1?record.target as Element:record.target.parentElement;return !!element?.closest('#vdp .gallery,[id^="auto-importer-edge-gallery-"]')||element?.matches('meta[property="og:url"]')||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&((node as Element).matches('#vdp,.gallery')||!!(node as Element).querySelector('#vdp,.gallery')))}))this.schedule()})
    this.observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','data-src','data-full','data-img','data-thumb','href','content']})
    doc.addEventListener('visibilitychange',this.visible);doc.defaultView?.addEventListener('popstate',this.schedule);doc.defaultView?.addEventListener('hashchange',this.schedule)
    this.schedule()
  }
  textReady(id:string,vehicle:NormalizedVehicle,observedAt=Date.now()){this.prepared={id,vehicle:structuredClone(vehicle),at:Date.now(),observedAt};this.schedule()}
  private visible=()=>{this.signature='';this.schedule()}
  private schedule=()=>{if(this.disposed)return;this.dirty=true;if(this.running||this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;void this.update()})}
  private async send(message:unknown){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([this.api.runtime.sendMessage(message),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('EDGE preload response timeout')),2000)})])}finally{clearTimeout(timer)}}
  private async update(){
    if(this.disposed||this.running)return;this.running=true;this.dirty=false
    try{
      const selected=inspectEdgeSelection(this.doc,this.url())
      if(this.selection&&(selected.key!==this.selection.key||selected.root!==this.selection.root)){
        const old=this.id;this.id=crypto.randomUUID();this.generation=crypto.randomUUID();this.pageAt=this.prepared&&this.prepared.vehicle.listingId===new URL(this.url()).pathname.split('/').filter(Boolean).pop()?this.prepared.observedAt:Date.now();this.signature=''
        void this.send({type:'EDGE_PRELOAD_DROP',id:old}).catch(()=>{})
      }
      this.selection=selected
      const vehicle=this.prepared&&this.prepared.vehicle.listingId===new URL(this.url()).pathname.split('/').filter(Boolean).pop()?structuredClone(this.prepared.vehicle):parseEdgePipelineText(this.doc,this.url())
      const photos=inspectEdgePhotos(this.doc,this.url())
      this.observer.takeRecords() // Bridge writes from this synchronous inspection are already consumed.
      if(photos.vin!==vehicle.vin||photos.listingId!==vehicle.listingId)return
      vehicle.images=photos.images;vehicle.availableImageCount=photos.availableImageCount
      const prepared=this.prepared?.vehicle.listingId===vehicle.listingId&&this.prepared.vehicle.vin===vehicle.vin?this.prepared:undefined
      const signature=JSON.stringify([this.generation,prepared?.id,vehicle,!!this.doc.hidden])
      if(signature===this.signature)return
      const result=await this.send({type:'EDGE_PRELOAD_UPDATE',id:this.id,generation:this.generation,vehicle,complete:photos.galleryReady,visible:!this.doc.hidden,pageAt:this.pageAt,preparationId:prepared?.id,textReadyAt:prepared?.at}) as {ok?:boolean}
      if(result?.ok)this.signature=signature
    }catch{if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE preload]',{stage:'SOURCE_PRELOAD_UNAVAILABLE',timestamp:new Date().toISOString()})}
    finally{this.running=false;if(this.dirty&&!this.disposed)this.schedule()}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.observer.disconnect();this.doc.removeEventListener('visibilitychange',this.visible);this.doc.defaultView?.removeEventListener('popstate',this.schedule);this.doc.defaultView?.removeEventListener('hashchange',this.schedule);void this.send({type:'EDGE_PRELOAD_DROP',id:this.id}).catch(()=>{})}
}
