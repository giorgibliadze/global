import {assertNormalizedVehicle} from '@auto-importer/parsers/validation'
import {edgePhotoIdentity,edgeDetailId,edgePhotoRank} from '@auto-importer/parsers/edge-urls'
import type {TransferRecord} from '@auto-importer/shared'
import type {ExtensionApi,Sender} from '../services/extensionApi'
import {downloadEdgePhoto} from './edgeDownloads'
import {downloadPhoto,MAX_PHOTO_BYTES} from '../photos/download'
import {EdgePreloadStore} from './edgePreloadStore'
import type {EdgePreloadMeta,EdgePreloadPhoto,EdgePreloadBinding} from './edgePreloadStore'
import {isPhotoErrorCode} from '../photos/checkpoints'
export const EDGE_PRELOAD_TTL=120000
export const EDGE_PRELOAD_BYTES=128*1024*1024
const perTab=64*1024*1024,maxContexts=34,maxMetadata=256*1024,uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)
type Context={meta:EdgePreloadMeta;controller:AbortController;pending:Map<string,Promise<void>>;ready:Map<string,number>;bytes:number;reserved:number;last:number;claims:Set<string>;preparing:Set<string>}
export class EdgePreloads {
  private contexts=new Map<string,Context>()
  private bindings=new Map<string,EdgePreloadBinding>()
  private writes=new Map<string,Promise<unknown>>()
  private updates=new Map<number,Promise<unknown>>()
  private init?:Promise<void>
  private active=0
  private reserved=0
  private bytes=0
  private pumping=false
  private clock=0
  private download:typeof downloadPhoto=downloadEdgePhoto
  constructor(privateApi:ExtensionApi,store=new EdgePreloadStore()){this.api=privateApi;this.store=store}
  private api:ExtensionApi
  private store:EdgePreloadStore
  setDownloader(download:typeof downloadPhoto){this.download=download}
  private context(meta:EdgePreloadMeta):Context{return {meta,controller:new AbortController(),pending:new Map(),ready:new Map(),bytes:0,reserved:0,last:0,claims:new Set(),preparing:new Set()}}
  private async ensure(){if(!this.init)this.init=(async()=>{
    const jobs=await this.api.storage?.session.get(null)
    for(const meta of await this.store.contexts())try{assertNormalizedVehicle(meta.vehicle);if(!uuid(meta.id)||!uuid(meta.generation)||meta.vehicle.source!=='EdgePipeline'||(!meta.bound&&Date.now()-meta.updatedAt>EDGE_PRELOAD_TTL)||(meta.bound&&jobs&&(jobs['job:'+meta.bound] as TransferRecord|undefined)?.status!=='running')||this.contexts.size>=maxContexts)throw Error('Expired');this.contexts.set(meta.id,this.context(meta))}catch{await this.store.deleteContext(meta.id)}
    for(const binding of await this.store.bindings()){this.bindings.set(binding.id,binding);const ctx=this.contexts.get(binding.owner);if(ctx)for(const identity of binding.claimed??[])ctx.claims.add(identity)}
    for(const row of await this.store.photos()){
      const ctx=this.contexts.get(row.owner)
      if(!ctx||!(row.blob instanceof Blob)||row.blob.size!==row.metadata.size||row.blob.size>MAX_PHOTO_BYTES||this.bytes+row.blob.size>EDGE_PRELOAD_BYTES){await this.store.deletePhoto(row.key);continue}
      ctx.ready.set(row.identity,row.blob.size);ctx.bytes+=row.blob.size;this.bytes+=row.blob.size
    }
  })();await this.init}
  private save(ctx:Context){const snapshot=structuredClone(ctx.meta),previous=this.writes.get(ctx.meta.id)??Promise.resolve();const task=previous.catch(()=>{}).then(()=>{if(this.contexts.get(ctx.meta.id)===ctx)return this.store.save(snapshot)});this.writes.set(ctx.meta.id,task);return task}
  private current(ctx:Context){return this.contexts.get(ctx.meta.id)===ctx&&!ctx.controller.signal.aborted}
  private log(ctx:Context,stage:string,extra:Record<string,string|number>={}){if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE preload]',{preloadId:ctx.meta.id,sourceTab:ctx.meta.sourceTab,generation:ctx.meta.generation,stage,timestamp:new Date().toISOString(),...extra})}
  update(message:Record<string,unknown>,sender:Sender){
    const tab=sender.tab?.id
    if(tab===undefined)return Promise.reject(new Error('EDGE-ის წყაროს ჩანართი მიუწვდომელია.'))
    const previous=this.updates.get(tab)??Promise.resolve()
    const task=previous.catch(()=>{}).then(()=>this.updateNow(message,sender))
    this.updates.set(tab,task)
    void task.finally(()=>{if(this.updates.get(tab)===task)this.updates.delete(tab)}).catch(()=>{})
    return task
  }
  private async updateNow(message:Record<string,unknown>,sender:Sender){
    await this.ensure()
    const vehicle=message.vehicle;assertNormalizedVehicle(vehicle)
    if(vehicle.source!=='EdgePipeline'||sender.tab?.id===undefined||edgeDetailId(sender.tab.url??'')!==vehicle.listingId||!uuid(message.generation)||!uuid(message.id)||typeof sender.documentId!=='string')throw Error('EDGE-ის preload-ის წყარო ვერ დადასტურდა.')
    if(new TextEncoder().encode(JSON.stringify(vehicle)).length>maxMetadata)throw Error('EDGE-ის preload-ის მეტამონაცემები სცდება დამცავ ზღვარს.')
    if([...this.contexts.values()].some(old=>old.meta.sourceTab===sender.tab!.id&&old.meta.id!==message.id&&typeof message.pageAt==='number'&&old.meta.pageAt>message.pageAt))throw Error('EDGE-ის preload-ის ძველი თაობა უარყოფილია.')
    for(const old of [...this.contexts.values()])if(old.meta.sourceTab===sender.tab.id&&old.meta.id!==message.id){if(!old.meta.bound)await this.drop(old);else{old.meta.visible=false;await this.save(old)}}
    let ctx=this.contexts.get(message.id)
    if(!ctx){
      if(this.contexts.size>=maxContexts){const victim=[...this.contexts.values()].filter(c=>!c.meta.bound&&!c.meta.visible).sort((a,b)=>a.meta.updatedAt-b.meta.updatedAt)[0];if(!victim)throw Error('EDGE-ის preload cache დროებით სავსეა. გადატანა cache-ის გარეშეც შესაძლებელია.');await this.drop(victim)}
      const copy=structuredClone(vehicle);delete copy.description;delete copy.raw.description
      ctx=this.context({id:message.id,generation:message.generation,sourceTab:sender.tab.id,documentId:sender.documentId,vehicle:copy,visible:message.visible===true,createdAt:Date.now(),updatedAt:Date.now(),pageAt:typeof message.pageAt==='number'&&Number.isFinite(message.pageAt)&&message.pageAt<=Date.now()?message.pageAt:Date.now(),errors:{},downloads:0,reused:0});this.contexts.set(ctx.meta.id,ctx);this.log(ctx,'EDGE_PRELOAD_STARTED',{photos:vehicle.images.length})
    }
    if(ctx.meta.sourceTab!==sender.tab.id||ctx.meta.generation!==message.generation||ctx.meta.documentId!==sender.documentId||ctx.meta.vehicle.vin!==vehicle.vin||ctx.meta.vehicle.listingId!==vehicle.listingId)throw Error('EDGE-ის preload-ის თაობა ან ავტომობილი შეიცვალა.')
    const previousImages=ctx.meta.vehicle.images,normalized=structuredClone(vehicle),images=new Map<string,string>()
    if(message.complete!==true)for(const url of previousImages)images.set(edgePhotoIdentity(url),url)
    for(const url of normalized.images){const identity=edgePhotoIdentity(url),old=images.get(identity);if(!old||edgePhotoRank(url)>=edgePhotoRank(old))images.set(identity,url)}
    normalized.images=[...images.values()];if(normalized.images.length>1000||new TextEncoder().encode(JSON.stringify(normalized)).length>maxMetadata)throw Error('EDGE-ის preload-ის მეტამონაცემების დამცავი ზღვარი ამოიწურა.');normalized.availableImageCount=Math.max(normalized.availableImageCount??0,normalized.images.length)
    if(JSON.stringify(ctx.meta.vehicle.images)!==JSON.stringify(normalized.images)||message.complete!==true)ctx.meta.completedAt=undefined
    ctx.meta.galleryComplete=message.complete===true
    ctx.meta.vehicle=normalized;delete ctx.meta.vehicle.description;delete ctx.meta.vehicle.raw.description
    if(message.visible===true&&!ctx.meta.visible)ctx.meta.paused=false
    ctx.meta.visible=message.visible===true;ctx.meta.updatedAt=Date.now()
    if(uuid(message.preparationId))ctx.meta.preparationId=message.preparationId
    if(typeof message.textReadyAt==='number'&&Number.isFinite(message.textReadyAt)){if(ctx.meta.textReadyAt!==message.textReadyAt)this.log(ctx,'EDGE_TEXT_READY',{durationMs:Math.max(0,message.textReadyAt-ctx.meta.pageAt)});ctx.meta.textReadyAt=message.textReadyAt}
    await this.save(ctx);this.log(ctx,'EDGE_GALLERY_DETECTED',{photos:vehicle.images.length});this.log(ctx,'EDGE_GALLERY_EXPECTED_COUNT',{photos:ctx.meta.vehicle.availableImageCount??0});void this.api.alarms?.create('auto-importer-edge-preload-cleanup',{delayInMinutes:1})
    this.log(ctx,'EDGE_GALLERY_DISCOVERED_COUNT',{photos:vehicle.images.length,expected:ctx.meta.vehicle.availableImageCount??vehicle.images.length});await this.completed(ctx);this.kick();return this.summary(ctx)
  }
  private states(ctx:Context){return ctx.meta.vehicle.images.map((url,index)=>{const identity=edgePhotoIdentity(url);return {index,state:ctx.ready.has(identity)||ctx.meta.forwarded?.includes(identity)?'READY':ctx.preparing.has(identity)?'PREPARING':ctx.pending.has(identity)?'DOWNLOADING':ctx.meta.errors[identity]?'FAILED':'DISCOVERED',errorCode:ctx.meta.errors[identity]}})}
  private async completed(ctx:Context){if(!ctx.meta.completedAt&&ctx.meta.galleryComplete&&ctx.meta.vehicle.images.length&&ctx.meta.vehicle.images.every(url=>ctx.ready.has(edgePhotoIdentity(url))||ctx.meta.forwarded?.includes(edgePhotoIdentity(url))||ctx.meta.errors[edgePhotoIdentity(url)])){ctx.meta.completedAt=Date.now();await this.save(ctx);this.log(ctx,'EDGE_PHOTO_PRELOAD_COMPLETED',{photos:ctx.ready.size,failed:Object.keys(ctx.meta.errors).length,durationMs:ctx.meta.completedAt-ctx.meta.pageAt})}}
  private summary(ctx:Context){return {states:this.states(ctx),galleryComplete:!!ctx.meta.galleryComplete,completedAt:ctx.meta.completedAt,id:ctx.meta.id,sourceTab:ctx.meta.sourceTab,generation:ctx.meta.generation,known:ctx.meta.vehicle.images.length,available:ctx.meta.vehicle.availableImageCount??ctx.meta.vehicle.images.length,prepared:ctx.ready.size,pending:ctx.pending.size,errors:Object.keys(ctx.meta.errors).length,bytes:ctx.bytes,downloads:ctx.meta.downloads,reused:ctx.meta.reused,paused:!!ctx.meta.paused,consumed:!!ctx.meta.consumed,pageAt:ctx.meta.pageAt,textReadyAt:ctx.meta.textReadyAt,firstPhotoAt:ctx.meta.firstPhotoAt,lastPhotoAt:ctx.meta.lastPhotoAt}}
  async status(){await this.ensure();return {active:this.active,bytes:this.bytes,reserved:this.reserved,contexts:[...this.contexts.values()].map(ctx=>this.summary(ctx)),jobs:(await this.store.bindings()).map(({claimed,...binding})=>({...binding,claimedCount:claimed?.length??0}))}}
  private kick(){if(this.pumping)return;this.pumping=true;void this.pump().catch(()=>{}).finally(()=>{this.pumping=false})}
  private async evictFor(target:Context){const victim=[...this.contexts.values()].filter(ctx=>ctx!==target&&!ctx.meta.bound&&!ctx.meta.visible&&ctx.bytes>0).sort((a,b)=>a.meta.updatedAt-b.meta.updatedAt)[0];if(!victim)return false;victim.meta.paused=true;for(const identity of [...victim.ready.keys()])await this.removePhoto(victim,identity);await this.save(victim);return true}
  private async pump(){
    await this.ensure()
    while(this.active<4){
      const ordered=[...this.contexts.values()].filter(ctx=>this.current(ctx)&&!ctx.meta.consumed&&!ctx.meta.paused&&Date.now()-ctx.meta.updatedAt<EDGE_PRELOAD_TTL&&ctx.pending.size<(ctx.meta.visible||ctx.meta.bound?4:1)&&ctx.bytes+ctx.reserved+MAX_PHOTO_BYTES<=perTab).sort((a,b)=>Number(b.meta.visible)-Number(a.meta.visible)||a.last-b.last)
      let chosen:Context|undefined,url:string|undefined
      for(const ctx of ordered){const candidate=ctx.meta.vehicle.images.find(value=>{const id=edgePhotoIdentity(value);return !ctx.ready.has(id)&&!ctx.pending.has(id)&&!ctx.claims.has(id)&&!ctx.meta.errors[id]});if(candidate){chosen=ctx;url=candidate;break}}
      if(!chosen||!url)return
      if(this.bytes+this.reserved+MAX_PHOTO_BYTES>EDGE_PRELOAD_BYTES){if(chosen.meta.visible&&await this.evictFor(chosen))continue;return}
      const ctx=chosen,identity=edgePhotoIdentity(url),index=ctx.meta.vehicle.images.findIndex(value=>edgePhotoIdentity(value)===identity)
      ctx.last=++this.clock;this.active++;this.reserved+=MAX_PHOTO_BYTES;ctx.reserved+=MAX_PHOTO_BYTES;ctx.meta.downloads++
      const task=(async()=>{try{
        this.log(ctx,'EDGE_PHOTO_DOWNLOAD_STARTED',{index})
        const result=await this.download(url!,index,undefined,undefined,ctx.controller.signal)
        if(!this.current(ctx))return
        const row:EdgePreloadPhoto={key:ctx.meta.id+'|'+identity,owner:ctx.meta.id,identity,...result}
        ctx.preparing.add(identity);this.log(ctx,'EDGE_PHOTO_DOWNLOAD_SUCCESS',{index,bytes:result.blob.size})
        await this.store.put(row)
        if(!this.current(ctx)){await this.store.deletePhoto(row.key);return}
        ctx.ready.set(identity,result.blob.size);ctx.bytes+=result.blob.size;this.bytes+=result.blob.size;ctx.meta.firstPhotoAt??=Date.now();ctx.meta.lastPhotoAt=Date.now();await this.save(ctx)
        this.log(ctx,'EDGE_PHOTO_PREPARED',{index,bytes:result.blob.size})
      }catch(error){if(this.current(ctx)){const code=error&&typeof error==='object'&&'photoErrorCode' in error&&isPhotoErrorCode(error.photoErrorCode)?error.photoErrorCode:'CACHE_OR_NETWORK_FAILED';ctx.meta.errors[identity]=code;await this.save(ctx).catch(()=>{});this.log(ctx,'EDGE_PHOTO_PREPARE_FAILED',{index,errorCode:code})}}
      finally{ctx.preparing.delete(identity);ctx.pending.delete(identity);await this.completed(ctx).catch(()=>{});this.active--;this.reserved-=MAX_PHOTO_BYTES;ctx.reserved-=MAX_PHOTO_BYTES;queueMicrotask(()=>this.kick())}})()
      ctx.pending.set(identity,task)
    }
  }
  async bind(record:TransferRecord){
    // Source text-ready publication may arrive immediately before the click.
    // Join only its metadata commit, never the photo download queue.
    await this.updates.get(record.sourceTabId)?.catch(()=>{});await this.ensure();if(this.bindings.has(record.id)&&!this.bindings.get(record.id)?.finished)return true;if(record.vehicle.source!=='EdgePipeline'||!record.preparation)return false
    const ctx=[...this.contexts.values()].find(c=>!c.meta.consumed&&c.meta.sourceTab===record.sourceTabId&&c.meta.preparationId===record.preparation!.id&&c.meta.vehicle.listingId===record.vehicle.listingId&&c.meta.vehicle.vin===record.vehicle.vin&&Date.now()-c.meta.updatedAt<EDGE_PRELOAD_TTL)
    if(!ctx)return false
    const incoming=new Set(ctx.meta.vehicle.images.map(edgePhotoIdentity)),old=new Set(record.vehicle.images.map(edgePhotoIdentity))
    if(!record.photos.prepared&&ctx.meta.vehicle.images.length>=record.vehicle.images.length&&record.vehicle.images.every(url=>incoming.has(edgePhotoIdentity(url))))record.vehicle.images=[...ctx.meta.vehicle.images]
    else for(const url of ctx.meta.vehicle.images)if(!old.has(edgePhotoIdentity(url))){record.vehicle.images.push(url);old.add(edgePhotoIdentity(url))}
    record.photos.total=record.vehicle.images.length;record.vehicle.availableImageCount=Math.max(record.vehicle.availableImageCount??0,ctx.meta.vehicle.availableImageCount??0,record.photos.total)
    ctx.meta.bound=record.id;const binding:EdgePreloadBinding={id:record.id,owner:ctx.meta.id,at:Date.now(),served:0,joined:0,pageAt:ctx.meta.pageAt,textReadyAt:ctx.meta.textReadyAt,firstPhotoAt:ctx.meta.firstPhotoAt,lastPhotoAt:ctx.meta.lastPhotoAt};this.bindings.set(record.id,binding);await this.save(ctx)
    await this.store.bind(binding);this.kick();return true
  }
  async has(record:TransferRecord){await this.ensure();const binding=this.bindings.get(record.id);return !!binding&&!binding.finished&&this.contexts.has(binding.owner)}
  async get(record:TransferRecord,index:number,signal:AbortSignal){
    await this.ensure();let binding=this.bindings.get(record.id)
    if(!binding&&!await this.bind(record))return
    binding=this.bindings.get(record.id);const ctx=binding?this.contexts.get(binding.owner):undefined
    if(!ctx||ctx.meta.sourceTab!==record.sourceTabId||binding?.finished||ctx.meta.vehicle.vin!==record.vehicle.vin||ctx.meta.vehicle.listingId!==record.vehicle.listingId)return
    const identity=edgePhotoIdentity(record.vehicle.images[index]);ctx.claims.add(identity);binding!.claimed=[...new Set([...(binding!.claimed??[]),identity])];await this.store.bind(binding!)
    const pending=ctx.pending.get(identity)
    if(pending){
      binding!.joined++;await this.store.bind(binding!)
      await new Promise<void>((resolve,reject)=>{
        const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason)}
        signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}
        pending.then(()=>{signal.removeEventListener('abort',abort);resolve()},error=>{signal.removeEventListener('abort',abort);reject(error)})
      })
    }
    signal.throwIfAborted();const row=await this.store.get(ctx.meta.id,identity)
    if(!row)return
    if(row.blob.size!==row.metadata.size||!row.blob.size||row.metadata.size>MAX_PHOTO_BYTES)return
    binding!.served++;ctx.meta.reused++;await this.store.bind(binding!);await this.save(ctx)
    return {blob:row.blob,metadata:{...row.metadata,index,name:`vehicle-${record.id.slice(0,8)}-${index+1}.${row.metadata.mime==='image/jpeg'?'jpg':row.metadata.mime==='image/png'?'png':'webp'}`}}
  }
  async consumed(record:TransferRecord,index:number){const binding=this.bindings.get(record.id),ctx=binding?this.contexts.get(binding.owner):undefined;if(ctx){const identity=edgePhotoIdentity(record.vehicle.images[index]);ctx.meta.forwarded=[...new Set([...(ctx.meta.forwarded??[]),identity])];await this.removePhoto(ctx,identity);await this.completed(ctx);await this.save(ctx)}this.kick()}
  private async removePhoto(ctx:Context,identity:string){const size=ctx.ready.get(identity);if(size===undefined)return;await this.store.deletePhoto(ctx.meta.id+'|'+identity);if(!ctx.ready.has(identity))return;ctx.ready.delete(identity);ctx.bytes=Math.max(0,ctx.bytes-size);this.bytes=Math.max(0,this.bytes-size)}
  async finish(id:string){await this.ensure();const binding=this.bindings.get(id),ctx=binding?this.contexts.get(binding.owner):undefined;if(!binding)return;if(ctx){ctx.controller.abort();for(const identity of [...ctx.ready.keys()])await this.removePhoto(ctx,identity);ctx.meta.consumed=true;ctx.meta.bound=undefined;ctx.meta.updatedAt=Date.now();await this.save(ctx)}binding.finished=true;binding.at=Date.now();binding.downloads=ctx?.meta.downloads;binding.firstPhotoAt=ctx?.meta.firstPhotoAt;binding.lastPhotoAt=ctx?.meta.lastPhotoAt;await this.store.bind(binding);this.kick()}
  async invalidate(sender:Sender,id:unknown){await this.ensure();if(!uuid(id))return false;const ctx=this.contexts.get(id);if(ctx&&ctx.meta.sourceTab===sender.tab?.id&&ctx.meta.documentId===sender.documentId&&!ctx.meta.bound)await this.drop(ctx);return true}
  async closeTab(tab:number){await this.ensure();for(const ctx of [...this.contexts.values()])if(ctx.meta.sourceTab===tab&&!ctx.meta.bound)await this.drop(ctx)}
  private async drop(ctx:Context){ctx.controller.abort();this.contexts.delete(ctx.meta.id);for(const identity of [...ctx.ready.keys()])await this.removePhoto(ctx,identity);await this.writes.get(ctx.meta.id)?.catch(()=>{});await this.store.deleteContext(ctx.meta.id);this.writes.delete(ctx.meta.id)}
  async sweep(){await this.ensure();const jobs=await this.api.storage?.session.get(null);for(const ctx of [...this.contexts.values()])if(ctx.meta.bound&&jobs&&(jobs['job:'+ctx.meta.bound] as TransferRecord|undefined)?.status!=='running'||!ctx.meta.bound&&Date.now()-ctx.meta.updatedAt>=EDGE_PRELOAD_TTL)await this.drop(ctx);for(const binding of await this.store.bindings())if(binding.finished&&Date.now()-binding.at>=EDGE_PRELOAD_TTL){await this.store.deleteBinding(binding.id);this.bindings.delete(binding.id)};if(this.contexts.size)void this.api.alarms?.create('auto-importer-edge-preload-cleanup',{delayInMinutes:1});this.kick()}
  async clear(){await this.ensure();for(const ctx of [...this.contexts.values()])await this.drop(ctx);for(const binding of await this.store.bindings())await this.store.deleteBinding(binding.id);this.bindings.clear()}
}
