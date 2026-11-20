import type {NormalizedVehicle,PhotoMetadata} from '@auto-importer/shared'
export interface EdgePreloadMeta {id:string;generation:string;sourceTab:number;documentId:string;vehicle:NormalizedVehicle;preparationId?:string;visible:boolean;createdAt:number;updatedAt:number;pageAt:number;textReadyAt?:number;firstPhotoAt?:number;lastPhotoAt?:number;forwarded?:string[];galleryComplete?:boolean;completedAt?:number;consumed?:boolean;paused?:boolean;bound?:string;errors:Record<string,string>;downloads:number;reused:number}
export interface EdgePreloadPhoto {key:string;owner:string;identity:string;blob:Blob;metadata:PhotoMetadata}
export interface EdgePreloadBinding {id:string;owner:string;at:number;served:number;joined:number;claimed?:string[];finished?:boolean;downloads?:number;pageAt?:number;textReadyAt?:number;firstPhotoAt?:number;lastPhotoAt?:number}
export class EdgePreloadStore {
  private async db(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('auto-importer-edge-preload-v1',1);request.onupgradeneeded=()=>{for(const name of ['contexts','photos','bindings'])request.result.createObjectStore(name,{keyPath:name==='photos'?'key':'id'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('EDGE-ის დროებითი საცავი მიუწვდომელია.'))})}
  private async run<T>(name:string,mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>){const db=await this.db();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(name,mode),request=action(tx.objectStore(name));tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(new Error('EDGE-ის დროებითი საცავის ოპერაცია ვერ შესრულდა.'))})}finally{db.close()}}
  contexts(){return this.run<EdgePreloadMeta[]>('contexts','readonly',store=>store.getAll())}
  save(meta:EdgePreloadMeta){return this.run('contexts','readwrite',store=>store.put(meta))}
  deleteContext(id:string){return this.run('contexts','readwrite',store=>store.delete(id))}
  photos(){return this.run<EdgePreloadPhoto[]>('photos','readonly',store=>store.getAll())}
  get(owner:string,identity:string){return this.run<EdgePreloadPhoto|undefined>('photos','readonly',store=>store.get(owner+'|'+identity))}
  put(photo:EdgePreloadPhoto){return this.run('photos','readwrite',store=>store.put(photo))}
  deletePhoto(key:string){return this.run('photos','readwrite',store=>store.delete(key))}
  binding(id:string){return this.run<EdgePreloadBinding|undefined>('bindings','readonly',store=>store.get(id))}
  bind(value:EdgePreloadBinding){return this.run('bindings','readwrite',store=>store.put(value))}
  bindings(){return this.run<EdgePreloadBinding[]>('bindings','readonly',store=>store.getAll())}
  deleteBinding(id:string){return this.run('bindings','readwrite',store=>store.delete(id))}
}
