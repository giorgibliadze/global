import type { PhotoMetadata } from '@auto-importer/shared'
interface StoredPhoto { key: string; transferId: string; createdAt: number; blob: Blob; metadata: PhotoMetadata }
export interface PhotoStore {
  get(transferId: string, index: number): Promise<StoredPhoto | undefined>
  put(transferId: string, blob: Blob, metadata: PhotoMetadata): Promise<void>
  count?(transferId:string):Promise<number>
  bytes(transferId: string): Promise<number>
  remove(transferId: string): Promise<void>
  prune(validIds: Set<string>, snapshotAt?: number): Promise<void>
}
export class IndexedPhotoStore implements PhotoStore {
  private async db(): Promise<IDBDatabase> {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open('auto-importer-temporary-photos', 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('photos', { keyPath: 'key' }) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('ფოტოების დროებითი საცავი მიუწვდომელია.'))
    })
  }
  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db()
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction('photos', mode)
        const request = action(tx.objectStore('photos'))
        tx.oncomplete = () => resolve(request.result)
        tx.onerror = tx.onabort = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'ფოტოების დროებითი საცავის კვოტა ამოიწურა.' : 'ფოტოების დროებით საცავში ოპერაცია ვერ შესრულდა.'))
      })
    } finally { db.close() }
  }
  get(id: string, index: number) { return this.run<StoredPhoto | undefined>('readonly', store => store.get(`${id}:${index}`)) }
  async put(id: string, blob: Blob, metadata: PhotoMetadata) {
    await this.run('readwrite', store => store.put({ key: `${id}:${metadata.index}`, transferId: id, createdAt: Date.now(), blob, metadata } satisfies StoredPhoto))
  }
  private range(id:string){return IDBKeyRange.bound(id+':',id+':\uffff')}
  private all(id?:string) { return this.run<StoredPhoto[]>('readonly', store => store.getAll(id?this.range(id):undefined)) }
  count(id:string){return this.run('readonly',store=>store.count(this.range(id)))}
  async bytes(id: string) { return (await this.all(id)).reduce((sum, p) => sum + p.blob.size, 0) }
  async remove(id: string) {
    await this.run('readwrite',store=>{const request=store.getAll(this.range(id));request.onsuccess=()=>{for(const photo of request.result)store.delete(photo.key)};return request})
  }
  async prune(validIds: Set<string>, snapshotAt = Date.now()) {
    await this.run('readwrite',store=>{const request=store.getAll();request.onsuccess=()=>{for(const photo of request.result as StoredPhoto[])if((!validIds.has(photo.transferId) && photo.createdAt<snapshotAt) || Date.now()-photo.createdAt>30*60*1000)store.delete(photo.key)};return request})
  }
}
