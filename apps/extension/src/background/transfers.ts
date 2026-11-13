import {deduplicatePhotos} from '@auto-importer/parsers'
import {applyAutofillPolicy} from '@auto-importer/parsers/myauto'
import { PreparedVehicles } from './preparation'
import type { PreparedVehicle } from './preparation'
import { MODEL_TRIM_WARNING } from '@auto-importer/parsers'
import { pipelineLog } from '../services/diagnostics'
import { timingStages } from '@auto-importer/shared'
import type { TransferTimings } from '@auto-importer/shared'
import { assertNormalizedVehicle } from '@auto-importer/parsers/validation'
import type { FieldResult, NormalizedVehicle, TransferRecord, TransferStage } from '@auto-importer/shared'
import { downloadPhoto, PHOTO_CHUNK_BYTES, MAX_TRANSFER_BYTES, base64Bytes } from '../photos/download'
import type { PhotoStore } from '../photos/store'
import type { ExtensionApi, Sender, Tab } from '../services/extensionApi'

export const TRANSFER_TTL = 30 * 60 * 1000
const uuid = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)
export function isManheimSource(url?: string) {
  try { const u = new URL(url!); return u.protocol === 'https:' && (u.hostname === 'manheim24.com' || u.hostname.endsWith('.manheim24.com')) } catch { return false }
}
export function isMyautoDestination(url?: string) {
  try { const u = new URL(url!); return u.protocol === 'https:' && (u.hostname === 'myauto.ge' || u.hostname.endsWith('.myauto.ge')) && /^\/ka\/add\/?$/.test(u.pathname) } catch { return false }
}
// Chrome storage may reorder object keys. Compare data, not insertion order; array order
// remains significant and every reviewed specification/identity value stays unchanged.
export const vehicleSnapshot = (v: NormalizedVehicle) => JSON.stringify(
  {...v, images:undefined,raw:undefined,warnings:undefined,availableImageCount:undefined},
  (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) : value,
)
// Confirmation binds the selected vehicle, not optional decoding metadata. Keep the
// reviewed details frozen if those change; never switch VIN/make/full model/listing.
const selectedIdentity=(vehicle:NormalizedVehicle)=>JSON.stringify([vehicle.source,vehicle.listingId,vehicle.vin,vehicle.make,vehicle.fullModelName ?? vehicle.model])
interface VehicleReview { reviewId: string; sourceTabId: number; vehicle: NormalizedVehicle; createdAt: number }
const REVIEW_TTL = 5 * 60 * 1000
export class TransferManager {
  private preparations=new PreparedVehicles()
  private beginnings=new Map<string,Promise<TransferRecord>>()
  private activeDownloads=0
  private downloadQueue:Array<()=>void>=[]
  private locks = new Map<string, Promise<unknown>>()
  private api: ExtensionApi
  private photos: PhotoStore
  private download: typeof downloadPhoto
  constructor(api: ExtensionApi, photos: PhotoStore, download = downloadPhoto) { this.api = api; this.photos = photos; this.download = download }
  private async lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    this.locks.set(key, next)
    try { return await next } finally { if (this.locks.get(key) === next) this.locks.delete(key) }
  }
  private async limitedDownload<T>(fn:()=>Promise<T>):Promise<T> {
    if(this.activeDownloads>=3)await new Promise<void>(resolve=>this.downloadQueue.push(resolve))
    else this.activeDownloads++
    try{return await fn()}finally{const next=this.downloadQueue.shift();if(next)next();else this.activeDownloads--}
  }
  private async read(id: unknown): Promise<TransferRecord> {
    if (!uuid(id)) throw new Error('გადატანის ნომერი არასწორია.')
    const record = (await this.api.storage.session.get(`job:${id}`))[`job:${id}`] as TransferRecord | undefined
    if (!record || Date.now() - record.createdAt > TRANSFER_TTL) {
      if (record) await this.remove(record)
      throw new Error('გადატანის ვადა ამოიწურა. დაიწყეთ ახალი გადატანა წყაროს გვერდიდან.')
    }
    return structuredClone(record)
  }
  private async save(record: TransferRecord) {
    record.updatedAt = Date.now()
    await this.api.storage.session.set({ [`job:${record.id}`]: record })
  }
  private async remove(record: TransferRecord) {
    try { await this.photos.remove(record.id) } catch { pipelineLog(record.id,'cleanup','failed') }
    await this.api.storage.session.remove(`job:${record.id}`)
    if ((await this.api.storage.session.get(`active:${record.sourceTabId}`))[`active:${record.sourceTabId}`] === record.id) await this.api.storage.session.remove(`active:${record.sourceTabId}`)
    if (record.destinationTabId !== undefined) await this.api.storage.session.remove(`destination:${record.destinationTabId}`)
  }
  async prune(cleanPhotos = true) {
    const snapshotAt = Date.now()
    const entries = await this.api.storage.session.get(null)
    const valid = new Set<string>()
    for (const [key, value] of Object.entries(entries)) {
      if (key.startsWith('review:')) { if (Date.now() - (value as VehicleReview).createdAt > REVIEW_TTL) await this.api.storage.session.remove(key); continue }
      if (key.startsWith('preview:') || key.startsWith('transfer:')) { await this.api.storage.session.remove(key); continue }
      if (!key.startsWith('job:')) continue
      const record = value as TransferRecord
      if (Date.now() - record.createdAt > TRANSFER_TTL) await this.lock(`job:${record.id}`, () => this.remove(record))
      else valid.add(record.id)
    }
    if (cleanPhotos) {
      try { await this.photos.prune(valid, snapshotAt) } catch { pipelineLog(undefined,'cleanup','failed') }
    }
    return valid.size
  }
  async tabClosed(tabId: number) {
    this.preparations.remove(tabId)
    const entries = await this.api.storage.session.get(null)
    for (const [key, value] of Object.entries(entries)) {
      if (!key.startsWith('job:')) continue
      const record = value as TransferRecord
      if (record.destinationTabId === tabId) await this.lock(`job:${record.id}`, () => this.remove(record))
      // Closing the source must not cancel an already approved destination job.
    }
  }
  private destination(record: TransferRecord, sender: Sender) {
    if (!isMyautoDestination(sender.tab?.url) || sender.tab?.id !== record.destinationTabId || !record.claimed || (record.documentId && record.documentId !== sender.documentId)) throw new Error('გადატანა ამ ჩანართს ან დოკუმენტს არ ეკუთვნის.')
  }
  private async extract(tabId: number, id: string): Promise<NormalizedVehicle> {
    let stage: 'extracting' | 'validating' = 'extracting'
    pipelineLog(id,stage,'started')
    try {
      const response = await this.api.tabs.sendMessage(tabId,{type:'MANHEIM_PARSE', transferId:id}) as {ok?:boolean;vehicle?:NormalizedVehicle;error?:string} | undefined
      if (!response?.ok || !response.vehicle) throw new Error(response?.error ?? 'მონაცემები ვერ წაიკითხა. გახსენით არჩეული ავტომობილის დეტალები და ხელახლა სცადეთ.')
      stage = 'validating'; pipelineLog(id,stage,'started')
      assertNormalizedVehicle(response.vehicle)
      pipelineLog(id,stage,'completed')
      return response.vehicle
    } catch (error) {
      pipelineLog(id,stage,'failed')
      if (error instanceof Error && /[\u10A0-\u10FF]/.test(error.message)) throw error
      throw new Error('მონაცემები ვერ წაიკითხა. გადატვირთეთ Manheim24-ის გვერდი გაფართოების განახლების შემდეგ და ხელახლა სცადეთ.',{cause:error})
    }
  }
  async review(sender: Sender): Promise<VehicleReview> {
    const tab = sender.tab ?? (await this.api.tabs.query({active:true,currentWindow:true}))[0]
    if (tab?.id === undefined || !isManheimSource(tab.url)) throw new Error('გახსენით ავტომობილის დეტალები Manheim24-ზე.')
    await this.prune(false)
    const reviewId = crypto.randomUUID()
    const vehicle = await this.extract(tab.id,reviewId)
    const review: VehicleReview = {reviewId,sourceTabId:tab.id,vehicle:structuredClone(vehicle),createdAt:Date.now()}
    const old = Object.entries(await this.api.storage.session.get(null)).filter(([k]) => k.startsWith('review:')).sort((a,b) => (a[1] as VehicleReview).createdAt-(b[1] as VehicleReview).createdAt)
    for (const [key] of old.slice(0,Math.max(0,old.length-19))) await this.api.storage.session.remove(key)
    await this.api.storage.session.set({[`review:${review.reviewId}`]:review})
    return review
  }
  async begin(sender:Sender):Promise<TransferRecord> {
    const tab=sender.tab ?? (await this.api.tabs.query({active:true,currentWindow:true}))[0]
    if(tab?.id===undefined || !isManheimSource(tab.url))throw new Error('გახსენით ავტომობილის დეტალები Manheim24-ზე.')
    const bound={...sender,tab}
    for(let attempt=0;attempt<3;attempt++) {
      const resolved=await this.api.tabs.sendMessage(tab.id,{type:'MANHEIM_RESOLVE'}) as {ok?:boolean;vehicle?:NormalizedVehicle;preparationId?:string}
      if(!resolved?.ok)throw new Error('მონაცემები ვერ მომზადდა. დაელოდეთ ავტომობილის დეტალების ჩატვირთვას.')
      let prepared:PreparedVehicle|undefined
      if(resolved?.ok && resolved.vehicle && uuid(resolved.preparationId)){
        assertNormalizedVehicle(resolved.vehicle)
        prepared=this.preparations.get(tab.id,resolved.preparationId)
        if(prepared && (selectedIdentity(prepared.vehicle)!==selectedIdentity(resolved.vehicle) || vehicleSnapshot(prepared.vehicle)!==vehicleSnapshot(resolved.vehicle)))prepared=undefined
        if(!prepared){this.preparations.invalidate(tab.id,resolved.preparationId);prepared=this.preparations.prepare(tab.id,resolved.preparationId,resolved.vehicle,Date.now())}
      }
      const review=prepared?{reviewId:crypto.randomUUID(),sourceTabId:tab.id,vehicle:prepared.vehicle,createdAt:Date.now()}:await this.review(bound)
      if(prepared)await this.api.storage.session.set({[`review:${review.reviewId}`]:review})
      const key=`${tab.id}:${selectedIdentity(review.vehicle)}`
      const pending=this.beginnings.get(key)
      if(pending){await this.api.storage.session.remove(`review:${review.reviewId}`);return pending}
      const operation=this.start(bound,review.reviewId,prepared)
      this.beginnings.set(key,operation)
      try{return await operation}catch(error){if(!(error instanceof Error) || error.message!=='PREPARATION_SUPERSEDED')throw error}
      finally{if(this.beginnings.get(key)===operation)this.beginnings.delete(key)}
    }
    throw new Error('ავტომობილის მონაცემები ჯერ ახლდება. დაელოდეთ დეტალების ჩატვირთვას და ხელახლა სცადეთ.')
  }
  async start(sender: Sender, reviewId?: unknown, prepared?:PreparedVehicle): Promise<TransferRecord> {
    const tab = sender.tab ?? (await this.api.tabs.query({ active: true, currentWindow: true }))[0]
    if (tab?.id === undefined || !isManheimSource(tab.url)) throw new Error('გახსენით ავტომობილის დეტალები Manheim24-ზე.')
    return this.lock(`source:${tab.id}`, async () => {
      await this.prune(false)
      if (!uuid(reviewId)) throw new Error('ჯერ გადაამოწმეთ ორიგინალი და ქართული მონაცემები.')
      const reviewed = (await this.api.storage.session.get(`review:${reviewId}`))[`review:${reviewId}`] as VehicleReview | undefined
      if (!reviewed || reviewed.sourceTabId !== tab.id || Date.now()-reviewed.createdAt > REVIEW_TTL) throw new Error('წინასწარი შემოწმება მოძველდა ან სხვა ჩანართს ეკუთვნის. ხელახლა გადაამოწმეთ მონაცემები.')
      const extractionStarted=performance.now()
      if(prepared){
        const verified=await this.api.tabs.sendMessage(tab.id!,{type:'MANHEIM_VERIFY',preparationId:prepared.summary.id}) as {ok?:boolean;verified?:boolean}
        if(!verified?.ok || !verified.verified){await this.api.storage.session.remove(`review:${reviewId}`);throw new Error('PREPARATION_SUPERSEDED')}
      }
      const fresh = prepared?prepared.vehicle:await this.extract(tab.id!,reviewId)
      const sourceExtraction=performance.now()-extractionStarted
      if (selectedIdentity(reviewed.vehicle) !== selectedIdentity(fresh)) throw new Error('არჩეული ავტომობილი ან მისი მონაცემები შეიცვალა. ხელახლა გადაამოწმეთ ორიგინალი და ქართული მონაცემები.')
      const vehicle = structuredClone(reviewed.vehicle)
      delete vehicle.description; delete vehicle.raw.description
      if((vehicle.trim ?? null)!==(fresh.trim ?? null)) {
        vehicle.trim=null;vehicle.original.trim=null;delete vehicle.raw.trim
        if(!vehicle.warnings.includes(MODEL_TRIM_WARNING))vehicle.warnings.push(MODEL_TRIM_WARNING)
      }
      if(vehicleSnapshot(reviewed.vehicle)!==vehicleSnapshot(fresh) && !vehicle.warnings.includes(MODEL_TRIM_WARNING))vehicle.warnings.push('წყაროს დამატებითი მონაცემები შეიცვალა. გადადის თქვენ მიერ გადამოწმებული ინფორმაცია; გადაამოწმეთ შესაბამისი ველები.')
      vehicle.images=[...new Set(vehicle.images)]
      await this.api.storage.session.remove(`review:${reviewId}`)
      const active = (await this.api.storage.session.get(`active:${tab.id}`))[`active:${tab.id}`]
      if (uuid(active)) {
        try {
          const old = await this.read(active)
          if (vehicleSnapshot(old.vehicle) === vehicleSnapshot(vehicle) && (old.status === 'running' || Date.now()-old.updatedAt<3000)) return old
        } catch { /* Expired jobs do not prevent a fresh user-initiated transfer. */ }
      }
      const entries = await this.api.storage.session.get(null)
      if (Object.entries(entries).filter(([k,v]) => k.startsWith('job:') && (v as TransferRecord).status === 'running').length >= 4) throw new Error('ერთდროულად მაქსიმუმ ოთხი გადატანაა შესაძლებელი. დაელოდეთ მიმდინარე ოპერაციებს.')
      const record: TransferRecord = {
        preparedFields:prepared?applyAutofillPolicy(prepared.fields):undefined,preparation:prepared?.summary,
        timings:{sourceExtraction,...(prepared?{prefetch:prepared.summary.durationMs,prefetchNormalization:prepared.summary.normalizationMs}:{})}, id: reviewed.reviewId, sourceTabId: tab.id!, vehicle,
        createdAt: Date.now(), updatedAt: Date.now(), stage: 'preparing', status: 'running', claimed: false,
        photos: { total: vehicle.images.length, prepared: 0, uploaded: 0, failed: 0 }, fields: [], errors: [],
      }
      pipelineLog(record.id,'storing','started')
      await this.save(record)
      pipelineLog(record.id,'storing','completed')
      await this.api.storage.session.set({ [`active:${tab.id}`]: record.id })
      try {
        record.stage = 'opening'; await this.save(record)
        pipelineLog(record.id,'opening','started')
        if(prepared){const final=await this.api.tabs.sendMessage(tab.id!,{type:'MANHEIM_VERIFY',preparationId:prepared.summary.id}) as {ok?:boolean;verified?:boolean};if(!final?.ok || !final.verified)throw new Error('PREPARATION_SUPERSEDED')}
        const target: Tab = await this.api.tabs.create({ url: 'https://myauto.ge/ka/add' })
        if (target.id === undefined) throw new Error('MyAuto-ს გახსნა ვერ მოხერხდა.')
        record.destinationTabId = target.id
        await this.save(record)
        await this.api.storage.session.set({ [`destination:${target.id}`]: record.id })
        await this.api.alarms?.create('auto-importer-cleanup', { delayInMinutes: 30 })
        pipelineLog(record.id,'opening','completed')
        return record
      } catch (error) {
        if(error instanceof Error && error.message==='PREPARATION_SUPERSEDED'){await this.remove(record);throw error}
        pipelineLog(record.id,'opening','failed')
        record.status = 'error'; record.errors = ['MyAuto-ს ახალი ჩანართის გახსნა ვერ დასრულდა.']; await this.save(record)
        throw new Error(record.errors[0],{cause:error})
      }
    })
  }
  async handle(message: Record<string, unknown>, sender: Sender): Promise<unknown> {
    if(message.type==='PREFETCH_INVALIDATE' || message.type==='PREFETCH_PREPARE'){
      const tab=sender.tab?.id
      if(tab===undefined || !isManheimSource(sender.tab?.url) || !uuid(message.preparationId))throw new Error('მომზადების წყარო არასწორია.')
      if(message.type==='PREFETCH_INVALIDATE'){this.preparations.invalidate(tab,message.preparationId);return true}
      if(typeof message.observedAt!=='number' || Math.abs(Date.now()-message.observedAt)>120000)throw new Error('მომზადების დრო არასწორია.')
      assertNormalizedVehicle(message.vehicle)
      return !!this.preparations.prepare(tab,message.preparationId,message.vehicle,message.observedAt)
    }
    if(message.type==='TRANSFER_BEGIN')return this.begin(sender)
    if (message.type === 'TRANSFER_REVIEW') return this.review(sender)
    if (message.type === 'TRANSFER_START') return this.start(sender,message.reviewId)
    if (message.type === 'TRANSFER_CLAIM') {
      if (!isMyautoDestination(sender.tab?.url) || sender.tab?.id === undefined) throw new Error('მიმღები გვერდი არასწორია.')
      return this.lock(`claim:${sender.tab.id}`, async () => {
        const id = (await this.api.storage.session.get(`destination:${sender.tab!.id}`))[`destination:${sender.tab!.id}`]
        if (!id) return null
        const record = await this.read(id)
        if (record.destinationTabId !== sender.tab!.id || record.claimed) return null
        pipelineLog(record.id,'claiming','completed')
        record.claimed = true; record.documentId = sender.documentId; record.stage = 'preparing'
        await this.save(record)
        return record
      })
    }
    const record = await this.read(message.id)
    if (message.type === 'TRANSFER_STATUS') {
      if (sender.tab && sender.tab.id !== record.sourceTabId && sender.tab.id !== record.destinationTabId) throw new Error('ჩანართზე წვდომა უარყოფილია.')
      return record
    }
    this.destination(record, sender)
    if(message.type==='TRANSFER_RETRY_FIELDS')return this.lock(`job:${record.id}`,async()=>{
      const latest=await this.read(record.id)
      if(latest.status==='running')throw new Error('გადატანა უკვე მიმდინარეობს.')
      if(!latest.fields.some(field=>field.status==='unfilled' && field.retryable))throw new Error('დროებითი შეცდომით შეუვსებელი ველები არ არის. მოუგვარებელი შესაბამისობები ხელით გადაამოწმეთ.')
      latest.status='running';latest.stage='filling';await this.save(latest);return latest
    })
    if(message.type==='PHOTO_REFRESH')return this.lock(`job:${record.id}`,async()=>{
      const latest=await this.read(record.id)
      if(latest.status!=='running')throw new Error('ეს გადატანა აღარ მუშავდება.')
      if(latest.photos.total || latest.photos.prepared || latest.photos.uploaded)return latest.photos
      let response:{ok?:boolean;error?:string;value?:{vin:string;listingId?:string;images:string[];availableImageCount:number}}
      try{response=await this.api.tabs.sendMessage(latest.sourceTabId,{type:'MANHEIM_PHOTOS',expected:{vin:latest.vehicle.vin,listingId:latest.vehicle.listingId}}) as typeof response}
      catch{throw new Error('ფოტოების წყაროსთან დაკავშირება ვერ მოხერხდა. Manheim24-ის დეტალური გვერდი გახსნილი დატოვეთ.')}
      if(!response?.ok || !response.value)throw new Error(response?.error ?? 'წყაროს ფოტოგალერეა ვერ წაიკითხა.')
      const value=response.value
      if(value.vin!==latest.vehicle.vin || latest.vehicle.listingId && value.listingId!==latest.vehicle.listingId)throw new Error('ფოტოების ავტომობილი არ ემთხვევა გადატანის ავტომობილს.')
      const images=deduplicatePhotos(Array.isArray(value.images)?value.images:[])
      if(!images.length)throw new Error('არჩეული ავტომობილის გალერეაში ფოტოები ვერ მოიძებნა.')
      latest.vehicle.images=images;latest.vehicle.availableImageCount=images.length;latest.photos.total=images.length
      await this.save(latest);return latest.photos
    })
    if (message.type === 'PHOTO_PREPARE') {
      return this.lock(`photo:${record.id}:${String(message.index)}`, async () => {
        const fresh = await this.read(record.id)
        if (fresh.status !== 'running') throw new Error('ეს გადატანა აღარ მუშავდება.')
        const index = message.index
        if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= record.photos.total) throw new Error('ფოტოს ნომერი არასწორია.')
        const cached = await this.photos.get(record.id, index as number)
        if (cached) return cached.metadata
        const prepared = await this.limitedDownload(async()=>{const current=await this.read(record.id);if(current.status!=='running')throw new Error('ეს გადატანა აღარ მუშავდება.');return this.download(current.vehicle.images[index as number], index as number)})
        return this.lock(`job:${record.id}`,async()=>{
        const writable=await this.read(record.id)
        if(writable.status!=='running')throw new Error('ეს გადატანა აღარ მუშავდება.')
        if ((await this.photos.bytes(record.id)) + prepared.blob.size > MAX_TRANSFER_BYTES) throw new Error('ფოტოების საერთო ზომა აღემატება 15 ფაილისთვის დაშვებულ საერთო ზომას. ფაილები არ შეკუმშულა ან შეცვლილა.')
        // Recheck after network/IDB work; an expired or closed destination cannot leave an orphan cache.
        await this.read(record.id)
        prepared.metadata.name = `vehicle-${record.id.slice(0, 8)}-${index as number + 1}.${prepared.metadata.mime === 'image/jpeg' ? 'jpg' : prepared.metadata.mime === 'image/png' ? 'png' : 'webp'}`
        await this.photos.put(record.id, prepared.blob, prepared.metadata)
        let latest: TransferRecord
        try { latest = await this.read(record.id) }
        catch (error) { await this.photos.remove(record.id); throw error }
        latest.photos.prepared = this.photos.count ? await this.photos.count(record.id) : (await Promise.all(record.vehicle.images.map((_, i) => this.photos.get(record.id, i)))).filter(Boolean).length
        await this.save(latest)
        return prepared.metadata
        })
      })
    }
    if (message.type === 'PHOTO_CHUNK') {
      const index = message.index, offset = message.offset
      if (!Number.isInteger(index) || !Number.isInteger(offset) || (offset as number) < 0) throw new Error('ფოტოს ნაწილის მოთხოვნა არასწორია.')
      const stored = await this.photos.get(record.id, index as number)
      if (!stored || (offset as number) >= stored.blob.size) throw new Error('ფოტოს ნაწილი მიუწვდომელია.')
      return base64Bytes(new Uint8Array(await stored.blob.slice(offset as number, (offset as number) + PHOTO_CHUNK_BYTES).arrayBuffer()))
    }
    if (message.type === 'TRANSFER_PROGRESS') return this.lock(`job:${record.id}`, async () => {
      const latest = await this.read(record.id)
      const allowed: TransferStage[] = ['preparing', 'matching', 'filling', 'uploading', 'verifying']
      if (!allowed.includes(message.stage as TransferStage) || latest.status !== 'running') throw new Error('გადატანის ეტაპი არასწორია.')
      const order = ['preparing','matching','filling','uploading','verifying']
      if (order.includes(latest.stage) && order.indexOf(message.stage as string) < order.indexOf(latest.stage)) throw new Error('გადატანის ეტაპი უკან ვერ დაბრუნდება.')
      if(message.formTotal!==undefined){if(!Number.isInteger(message.formTotal) || (message.formTotal as number)<0 || (message.formTotal as number)>80)throw new Error('ველების რაოდენობა არასწორია.');latest.formTotal=message.formTotal as number}
      if(message.stage==='uploading')latest.textComplete=true
      if(message.submitted!==undefined){if(!Number.isInteger(message.submitted)||(message.submitted as number)<0||(message.submitted as number)>latest.photos.prepared)throw new Error('ატვირთვისთვის გადაცემული ფოტოების რაოდენობა არასწორია.');latest.photos.submitted=message.submitted as number}
      if(message.uploaded!==undefined){if(!Number.isInteger(message.uploaded) || (message.uploaded as number)<latest.photos.uploaded || (message.uploaded as number)>latest.photos.prepared)throw new Error('ფოტოების პროგრესი არასწორია.');latest.photos.uploaded=message.uploaded as number}
      if(message.fields!==undefined){if(!Array.isArray(message.fields) || message.fields.length>80 || !message.fields.every(isFieldResult))throw new Error('ველების პროგრესის ფორმატი არასწორია.');latest.fields=message.fields}
      if(message.currentField!==undefined){if(typeof message.currentField!=='string' || message.currentField.length>120)throw new Error('ველის პროგრესის ფორმატი არასწორია.');latest.currentField=message.currentField || undefined}
      latest.stage = message.stage as TransferStage; await this.save(latest); return true
    })
    if (message.type === 'TRANSFER_FINISH') return this.lock(`job:${record.id}`, async () => {
      const latest = await this.read(record.id)
      if (latest.status !== 'running') return latest
      const fields = message.fields
      const errors = message.errors
      if (!Array.isArray(fields) || fields.length > 80 || !fields.every(isFieldResult) || !Array.isArray(errors) || errors.length > 20 || !errors.every(v => typeof v === 'string' && v.length <= 500)) throw new Error('შედეგების ფორმატი არასწორია.')
      if (!Number.isInteger(message.uploaded) || (message.uploaded as number) < 0 || (message.uploaded as number) > latest.photos.prepared) throw new Error('ატვირთვის რაოდენობა არასწორია.')
      if(message.timings!==undefined){if(!validTimings(message.timings))throw new Error('დროის გაზომვის ფორმატი არასწორია.');latest.timings=message.timings}
      latest.currentField=undefined;latest.fields = fields; latest.errors = errors; latest.photos.uploaded = message.uploaded as number
      latest.photos.failed = latest.photos.total - latest.photos.uploaded
      latest.status = errors.length || fields.some(f => f.status !== 'filled' || f.reviewRequired) || latest.photos.failed > 0 ? 'error' : 'review'
      latest.stage = latest.status === 'review' ? 'review' : 'verifying'
      await this.save(latest); await this.photos.remove(record.id); return latest
    })
    throw new Error('უცნობი მოთხოვნა.')
  }
}
function isFieldResult(value: unknown): value is FieldResult {
  if (!value || typeof value !== 'object') return false
  const f = value as FieldResult
  return (f.evidence===undefined || ['react-value','myauto-option','myauto-choice','negotiable'].includes(f.evidence)) && (f.resetAfter===undefined || (typeof f.resetAfter==='string' && /^[a-zA-Z]{1,30}$/.test(f.resetAfter))) && (f.reviewRequired===undefined || typeof f.reviewRequired==='boolean') && (f.omissions===undefined || (Array.isArray(f.omissions) && f.omissions.length<=10 && f.omissions.every(item=>typeof item==='string' && item.length<=500))) && (f.persisted===undefined || typeof f.persisted==='boolean') && (f.retryable===undefined || typeof f.retryable==='boolean') && (f.key===undefined || (typeof f.key==='string' && /^[a-zA-Z]{1,30}$/.test(f.key))) && (f.code===undefined || ['missing','unavailable','dependency','unresolved','verification','protected','privacy','manual','unverified'].includes(f.code)) && (f.optionId === undefined || (typeof f.optionId === 'string' && f.optionId.length<=200)) && (f.optionLabel === undefined || (typeof f.optionLabel === 'string' && f.optionLabel.length<=500)) && (f.match === undefined || ['exact','equivalent','custom'].includes(f.match)) && typeof f.field === 'string' && f.field.length <= 120 && ['filled','unfilled','unverified'].includes(f.status) && typeof f.reason === 'string' && f.reason.length <= 500
}

function validTimings(value:unknown): value is TransferTimings {
  return !!value && typeof value==='object' && !Array.isArray(value) && Object.entries(value).every(([key,ms])=>timingStages.includes(key as typeof timingStages[number]) && typeof ms==='number' && Number.isFinite(ms) && ms>=0 && ms<=TRANSFER_TTL*4)
}
