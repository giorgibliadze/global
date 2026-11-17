import {validStoredTransfer,transferExpired,readyToClaim,stateSchemaKey,isFieldResult} from './transferState'
import {TRANSFER_PROTOCOL,READY_WINDOW_MS} from '../services/transferActivation'
import {vehicleSource,vehicleDetailUrl} from '../services/sourceRegistry'
import {photoTrace} from '../photos/checkpoints'
import {transferLifecycle} from '../services/transferLifecycle'
import {resolveListingLocation,exactLocation} from '@auto-importer/parsers/location'
import {getLocationPreference,setLocationPreference} from '../services/locationPreferences'
import {deduplicatePhotos} from '@auto-importer/parsers/photos'
import {myautoFields,applyAutofillPolicy} from '@auto-importer/parsers/myauto'
import { PreparedVehicles } from './preparation'
import type { PreparedVehicle } from './preparation'
import { MODEL_TRIM_WARNING } from '@auto-importer/parsers/identity'
import { pipelineLog } from '../services/diagnostics'
import { timingStages,PHOTO_DOWNLOAD_CONCURRENCY } from '@auto-importer/shared'
import type { TransferTimings } from '@auto-importer/shared'
import { assertNormalizedVehicle } from '@auto-importer/parsers/validation'
import type { NormalizedVehicle, TransferRecord, TransferStage } from '@auto-importer/shared'
import { downloadPhoto, PHOTO_CHUNK_BYTES, MAX_TRANSFER_BYTES, base64Bytes } from '../photos/download'
import type { PhotoStore } from '../photos/store'
import type { ExtensionApi, Sender, Tab } from '../services/extensionApi'

export const TRANSFER_TTL = 30 * 60 * 1000
const uuid = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)
export function isManheimSource(url?: string) {
  return !!vehicleSource(url)
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
export const COMPLETED_TRANSFER_LIMIT=20
const REVIEW_TTL = 5 * 60 * 1000
export class TransferManager {
  private preparations=new PreparedVehicles()
  private beginnings=new Map<string,Promise<TransferRecord>>()
  private downloadControllers=new Map<string,AbortController>()
  private cancelDownloads(id:string){this.downloadControllers.get(id)?.abort();this.downloadControllers.delete(id)}
  private downloadSignal(id:string){let controller=this.downloadControllers.get(id);if(!controller){controller=new AbortController();this.downloadControllers.set(id,controller)}return controller.signal}
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
    if(this.activeDownloads>=PHOTO_DOWNLOAD_CONCURRENCY)await new Promise<void>(resolve=>this.downloadQueue.push(resolve))
    else this.activeDownloads++
    try{return await fn()}finally{const next=this.downloadQueue.shift();if(next)next();else this.activeDownloads--}
  }
  private async read(id: unknown): Promise<TransferRecord> {
    if (!uuid(id)) throw new Error('გადატანის ნომერი არასწორია.')
    const record = (await this.api.storage.session.get(`job:${id}`))[`job:${id}`] as TransferRecord | undefined
    if (!record || transferExpired(record)) {
      if (record) await this.remove(record)
      throw new Error('გადატანის ვადა ამოიწურა. დაიწყეთ ახალი გადატანა წყაროს გვერდიდან.')
    }
    return structuredClone(record)
  }
  private async save(record: TransferRecord) {
    record.lifecycle=transferLifecycle(record)
    if(record.activation&&record.status!=='running')record.activation.state=record.status==='review'?'COMPLETED':'FAILED'
    record.updatedAt = Date.now()
    await this.api.storage.session.set({ [`job:${record.id}`]: record })
  }
  private async remove(record: TransferRecord) {
    this.cancelDownloads(record.id)
    try { await this.photos.remove(record.id) } catch { pipelineLog(record.id,'cleanup','failed') }
    await this.api.storage.session.remove(`job:${record.id}`)
    if ((await this.api.storage.session.get(`active:${record.sourceTabId}`))[`active:${record.sourceTabId}`] === record.id) await this.api.storage.session.remove(`active:${record.sourceTabId}`)
    if (record.destinationTabId !== undefined){
      const destinationKey=`destination:${record.destinationTabId}`,receiverKey=`receiver:${record.destinationTabId}`
      const binding=(await this.api.storage.session.get(destinationKey))[destinationKey]
      if(binding===record.id)await this.api.storage.session.remove(destinationKey)
      const receiver=(await this.api.storage.session.get(receiverKey))[receiverKey] as {documentId?:string}|undefined
      if((!binding||binding===record.id)&&receiver?.documentId===record.documentId)await this.api.storage.session.remove(receiverKey)
    }
  }
  async validateState(options:{invalidateBefore?:number}={}){
    const entries=await this.api.storage.session.get(null),valid=new Set<string>(),activeDestinations=new Set<number>()
    for(const key of Object.keys(entries)){
      if(key.startsWith('review:')){
        const review=entries[key] as VehicleReview|null
        let validReview=!!review&&uuid(review.reviewId)&&key===`review:${review.reviewId}`&&Number.isInteger(review.sourceTabId)&&Number.isFinite(review.createdAt)&&review.createdAt<=Date.now()&&Date.now()-review.createdAt<REVIEW_TTL
        if(validReview)try{assertNormalizedVehicle(review!.vehicle)}catch{validReview=false}
        if(!validReview)await this.api.storage.session.remove(key)
        continue
      }
      if(!key.startsWith('job:'))continue
      await this.lock(key,async()=>{
        const current=(await this.api.storage.session.get(key))[key]
        if(!validStoredTransfer(current,key)){
          const id=key.slice(4)
          if(uuid(id))try{await this.photos.remove(id)}catch{pipelineLog(id,'cleanup','failed')}
          await this.api.storage.session.remove(key);return
        }
        const record=current
        const receiver=record.destinationTabId===undefined?undefined:(await this.api.storage.session.get(`receiver:${record.destinationTabId}`))[`receiver:${record.destinationTabId}`] as {at?:number}|undefined
        const cutoff=options.invalidateBefore
        const lostContext=cutoff!==undefined&&record.createdAt<cutoff&&record.status==='running'&&(record.claimed||!!receiver)&&(receiver?.at===undefined||receiver.at<cutoff)
        if(lostContext){
          // Chrome invalidates old content contexts on update. Preserve the
          // payload/progress for review, but never resume in a replacement page.
          record.status='error';record.stage='verifying'
          record.activation={schema:TRANSFER_PROTOCOL,state:'FAILED'}
          record.errors=[...record.errors.slice(0,19),'გაფართოება განახლდა. შევსებული მონაცემები თავად გადაამოწმეთ.']
          await this.save(record)
        }else if(!record.activation){
          // Compatible already-bound work may finish; legacy unclaimed jobs can
          // never be activated just by visiting/refreshing MyAuto after update.
          record.activation={schema:TRANSFER_PROTOCOL,state:record.claimed&&record.status==='running'?'TRANSFERRING':'FAILED'}
          if(!record.claimed&&record.status==='running'){record.status='error';record.errors=['გაფართოება განახლდა. ახალი გადატანა დაიწყეთ აუქციონის გვერდიდან.']}
          if(record.preparedFields)record.preparedFields=applyAutofillPolicy(myautoFields(record.vehicle))
          await this.save(record)
        }
        if(record.status==='running'){valid.add(record.id);if(record.destinationTabId!==undefined)activeDestinations.add(record.destinationTabId)}
      })
    }
    for(const [key,value] of Object.entries(entries)){
      if((key.startsWith('active:')||key.startsWith('destination:'))&&(!uuid(value)||!valid.has(value))&&(await this.api.storage.session.get(key))[key]===value)await this.api.storage.session.remove(key)
      if(key.startsWith('receiver:')){
        const r=value as {documentId?:unknown;at?:unknown}|null
        if(!r||typeof r.documentId!=='string'||typeof r.at!=='number'||Date.now()-r.at>TRANSFER_TTL&&!activeDestinations.has(Number(key.slice('receiver:'.length))))await this.api.storage.session.remove(key)
      }
    }
    await this.api.storage.session.set({[stateSchemaKey]:{schema:TRANSFER_PROTOCOL,version:this.api.runtime.getManifest?.().version??'development'}})
  }
  async prune(cleanPhotos = true) {
    const snapshotAt = Date.now()
    const entries = await this.api.storage.session.get(null)
    const valid = new Set<string>()
    const completed=Object.entries(entries).filter(([key])=>key.startsWith('job:')).map(([,value])=>value).filter((value):value is TransferRecord=>!!value&&typeof value==='object'&&'id' in value&&'status' in value&&'vehicle' in value&&value.status!=='running').sort((a,b)=>b.updatedAt-a.updatedAt)
    const excess=new Set(completed.slice(COMPLETED_TRANSFER_LIMIT).map(record=>record.id))
    for (const [key, value] of Object.entries(entries)) {
      if (key.startsWith('review:')) { if (Date.now() - (value as VehicleReview).createdAt > REVIEW_TTL) await this.api.storage.session.remove(key); continue }
      if (key.startsWith('preview:') || key.startsWith('transfer:')) { await this.api.storage.session.remove(key); continue }
      if (!key.startsWith('job:')) continue
      const record = value as TransferRecord
      if (transferExpired(record)||excess.has(record.id)) await this.lock(`job:${record.id}`,async()=>{const latest=(await this.api.storage.session.get(`job:${record.id}`))[`job:${record.id}`] as TransferRecord|undefined;if(latest && (transferExpired(latest)||latest.status!=='running'&&excess.has(latest.id)))await this.remove(latest);else if(latest)valid.add(latest.id)})
      else valid.add(record.id)
    }
    for(const [key,value] of Object.entries(entries))if(key.startsWith('receiver:')){
      const receiver=value as {at?:number}|undefined,tab=Number(key.slice('receiver:'.length))
      const owned=[...valid].some(id=>(entries[`job:${id}`] as TransferRecord|undefined)?.status==='running'&&(entries[`job:${id}`] as TransferRecord).destinationTabId===tab)
      if(!owned&&(!receiver||typeof receiver.at!=='number'||snapshotAt-receiver.at>TRANSFER_TTL))await this.api.storage.session.remove(key)
    }
    if (cleanPhotos) {
      try { await this.photos.prune(valid, snapshotAt) } catch { pipelineLog(undefined,'cleanup','failed') }
    }
    return valid.size
  }
  async tabClosed(tabId: number) {
    this.preparations.remove(tabId)
    await this.api.storage.session.remove(`receiver:${tabId}`)
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
      throw new Error('მონაცემები ვერ წაიკითხა. გადატვირთეთ აუქციონის გვერდი გაფართოების განახლების შემდეგ და ხელახლა სცადეთ.',{cause:error})
    }
  }
  async review(sender: Sender): Promise<VehicleReview> {
    const tab = sender.tab ?? (await this.api.tabs.query({active:true,currentWindow:true}))[0]
    if (tab?.id === undefined || !vehicleDetailUrl(tab.url)) throw new Error('გახსენით ავტომობილის დეტალები მხარდაჭერილ Manheim-ის გვერდზე.')
    await this.prune(false)
    const reviewId = crypto.randomUUID()
    const vehicle = await this.extract(tab.id,reviewId)
    if(vehicle.source!==vehicleSource(tab.url)?.id)throw new Error('ავტომობილის წყარო ჩანართს არ ემთხვევა.')
    const review: VehicleReview = {reviewId,sourceTabId:tab.id,vehicle:structuredClone(vehicle),createdAt:Date.now()}
    const old = Object.entries(await this.api.storage.session.get(null)).filter(([k]) => k.startsWith('review:')).sort((a,b) => (a[1] as VehicleReview).createdAt-(b[1] as VehicleReview).createdAt)
    for (const [key] of old.slice(0,Math.max(0,old.length-19))) await this.api.storage.session.remove(key)
    await this.api.storage.session.set({[`review:${review.reviewId}`]:review})
    return review
  }
  async begin(sender:Sender,override?:unknown):Promise<TransferRecord> {
    const tab=sender.tab ?? (await this.api.tabs.query({active:true,currentWindow:true}))[0]
    if(tab?.id===undefined || !vehicleDetailUrl(tab.url))throw new Error('გახსენით ავტომობილის დეტალები მხარდაჭერილ Manheim-ის გვერდზე.')
    if(vehicleSource(tab.url)?.id==='ManheimSite'){
      const status=await this.api.tabs.sendMessage(tab.id,{type:'VEHICLE_STATUS'}) as {ok?:boolean;value?:{source?:string;vehicle?:boolean}}
      if(!status?.ok||status.value?.source!=='ManheimSite'||!status.value.vehicle)throw new Error('გახსენით ავტომობილის დადასტურებული დეტალური გვერდი.')
    }
    if(override!==undefined && !exactLocation(override))throw new Error('მდებარეობის ვარიანტი არასწორია.')
    const bound={...sender,tab}
    for(let attempt=0;attempt<3;attempt++) {
      const resolved=await this.api.tabs.sendMessage(tab.id,{type:'MANHEIM_RESOLVE'}) as {ok?:boolean;vehicle?:NormalizedVehicle;preparationId?:string}
      if(!resolved?.ok)throw new Error('მონაცემები ვერ მომზადდა. დაელოდეთ ავტომობილის დეტალების ჩატვირთვას.')
      let prepared:PreparedVehicle|undefined
      if(resolved?.ok && resolved.vehicle && uuid(resolved.preparationId)){
        assertNormalizedVehicle(resolved.vehicle)
        if(resolved.vehicle.source!==vehicleSource(tab.url)?.id)throw new Error('ავტომობილის წყარო ჩანართს არ ემთხვევა.')
        prepared=this.preparations.get(tab.id,resolved.preparationId)
        if(prepared && (selectedIdentity(prepared.vehicle)!==selectedIdentity(resolved.vehicle) || vehicleSnapshot(prepared.vehicle)!==vehicleSnapshot(resolved.vehicle)))prepared=undefined
        if(!prepared){this.preparations.invalidate(tab.id,resolved.preparationId);prepared=this.preparations.prepare(tab.id,resolved.preparationId,resolved.vehicle,Date.now())}
      }
      const review=prepared?{reviewId:crypto.randomUUID(),sourceTabId:tab.id,vehicle:prepared.vehicle,createdAt:Date.now()}:await this.review(bound)
      if(prepared)await this.api.storage.session.set({[`review:${review.reviewId}`]:review})
      const key=`${tab.id}:${selectedIdentity(review.vehicle)}`
      const pending=this.beginnings.get(key)
      if(pending){await this.api.storage.session.remove(`review:${review.reviewId}`);return pending}
      const operation=this.start(bound,review.reviewId,prepared,override as string|undefined)
      this.beginnings.set(key,operation)
      try{return await operation}catch(error){if(!(error instanceof Error) || error.message!=='PREPARATION_SUPERSEDED')throw error}
      finally{if(this.beginnings.get(key)===operation)this.beginnings.delete(key)}
    }
    throw new Error('ავტომობილის მონაცემები ჯერ ახლდება. დაელოდეთ დეტალების ჩატვირთვას და ხელახლა სცადეთ.')
  }
  async start(sender: Sender, reviewId?: unknown, prepared?:PreparedVehicle,override?:string): Promise<TransferRecord> {
    const tab = sender.tab ?? (await this.api.tabs.query({ active: true, currentWindow: true }))[0]
    if (tab?.id === undefined || !vehicleDetailUrl(tab.url)) throw new Error('გახსენით ავტომობილის დეტალები მხარდაჭერილ Manheim-ის გვერდზე.')
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
      if(fresh.source!==vehicleSource(tab.url)?.id)throw new Error('ავტომობილის წყარო ჩანართს არ ემთხვევა.')
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
      let listingLocation
      try{listingLocation=resolveListingLocation(vehicle,override,override?undefined:await getLocationPreference(this.api))}
      catch{listingLocation={source:'unresolved' as const,original:'შენახული მდებარეობა ვერ წაიკითხა'}}
      const record: TransferRecord = {
        listingLocation,
        preparedFields:prepared?applyAutofillPolicy(prepared.fields):undefined,preparation:prepared?.summary,
        timings:{sourceExtraction,...(prepared?{prefetch:prepared.summary.durationMs,prefetchNormalization:prepared.summary.normalizationMs}:{})}, id: reviewed.reviewId, sourceTabId: tab.id!, vehicle,
        createdAt: Date.now(), updatedAt: Date.now(), stage: 'preparing', status: 'running', claimed: false,
        activation:{schema:TRANSFER_PROTOCOL,state:'PREPARING'},
        photos: { total: vehicle.images.length, prepared: 0, uploaded: 0, failed: 0 }, fields: [], errors: [],
      }
      const sourceTrace=await photoTrace(record.id,record.vehicle.vin,record.vehicle.source)
      sourceTrace.mark('PHOTO_SOURCE_READY',record.photos.total)
      sourceTrace.mark('PHOTO_URLS_EXTRACTED',record.photos.total,record.photos.total?{}:{errorCode:'NO_URLS'})
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
        record.activation!.state='READY'
        await this.save(record)
        await this.api.storage.session.set({ [`destination:${target.id}`]: record.id })
        // A READY event closes the creation/binding race without claim polling.
        // If the document is not loaded yet, its one initial probe finds READY.
        void this.api.tabs.sendMessage(target.id,{type:'TRANSFER_READY',id:record.id,protocol:TRANSFER_PROTOCOL}).catch(()=>{pipelineLog(record.id,'opening','retry')})
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
    if(message.protocol!==undefined&&message.protocol!==TRANSFER_PROTOCOL)throw new Error('გაფართოების შეტყობინების ვერსია მოძველებულია.')
    if(message.type==='TRANSFER_ACTIVE'){
      const tab=sender.tab??(await this.api.tabs.query({active:true,currentWindow:true}))[0]
      if(tab?.id===undefined || !vehicleDetailUrl(tab.url))return null
      const id=(await this.api.storage.session.get(`active:${tab.id}`))[`active:${tab.id}`]
      if(!uuid(id))return null
      try{const record=await this.read(id);return record.status==='running'?record:null}catch{return null}
    }
    if(message.type==='LOCATION_PREFERENCE_GET')return getLocationPreference(this.api)
    if(message.type==='LOCATION_PREFERENCE_SET')return setLocationPreference(this.api,message.label)
    if(message.type==='PREFETCH_INVALIDATE' || message.type==='PREFETCH_PREPARE'){
      const tab=sender.tab?.id
      if(tab===undefined || !isManheimSource(sender.tab?.url) || !uuid(message.preparationId))throw new Error('მომზადების წყარო არასწორია.')
      if(message.type==='PREFETCH_INVALIDATE'){this.preparations.invalidate(tab,message.preparationId);return true}
      if(typeof message.observedAt!=='number' || Math.abs(Date.now()-message.observedAt)>120000)throw new Error('მომზადების დრო არასწორია.')
      assertNormalizedVehicle(message.vehicle)
      if(message.vehicle.source!==vehicleSource(sender.tab?.url)?.id)throw new Error('ავტომობილის წყარო ჩანართს არ ემთხვევა.')
      return !!this.preparations.prepare(tab,message.preparationId,message.vehicle,message.observedAt)
    }
    if(message.type==='TRANSFER_BEGIN')return this.begin(sender,message.listingLocation)
    if (message.type === 'TRANSFER_REVIEW') return this.review(sender)
    if (message.type === 'TRANSFER_START') return this.start(sender,message.reviewId)
    if (message.type === 'TRANSFER_CLAIM') {
      if(message.protocol!==TRANSFER_PROTOCOL||!isMyautoDestination(sender.tab?.url)||sender.tab?.id===undefined||!sender.documentId)return null
      return this.lock(`claim:${sender.tab.id}`,async()=>{
        const receiverKey=`receiver:${sender.tab!.id}`
        const first=(await this.api.storage.session.get(receiverKey))[receiverKey] as {documentId?:string}|undefined
        if(first&&first.documentId!==sender.documentId)return null
        if(!first)await this.api.storage.session.set({[receiverKey]:{documentId:sender.documentId,at:Date.now()}})
        const id=(await this.api.storage.session.get(`destination:${sender.tab!.id}`))[`destination:${sender.tab!.id}`]
        if(!uuid(id)||(message.id!==undefined&&message.id!==id))return null
        let record:TransferRecord
        try{record=await this.read(id)}catch{return null}
        if(!validStoredTransfer(record,`job:${id}`)||record.destinationTabId!==sender.tab!.id)return null
        if(record.activation?.state==='READY'&&record.status==='running'&&!record.claimed&&Date.now()-record.createdAt>=READY_WINDOW_MS){
          record.status='error';record.stage='verifying';record.errors=['გადატანის გააქტიურების ვადა ამოიწურა. თავიდან დაიწყეთ აუქციონის გვერდიდან.'];await this.save(record);return null
        }
        if(!readyToClaim(record))return null
        pipelineLog(record.id,'claiming','completed')
        record.claimed=true;record.documentId=sender.documentId;record.stage='preparing';record.activation!.state='TRANSFERRING'
        await this.save(record);return record
      })
    }
    const record = await this.read(message.id)
    if (message.type === 'TRANSFER_STATUS') {
      if (sender.tab && sender.tab.id !== record.sourceTabId && sender.tab.id !== record.destinationTabId) throw new Error('ჩანართზე წვდომა უარყოფილია.')
      return record
    }
    if(message.type==='TRANSFER_ABORT'){
      if(message.protocol!==TRANSFER_PROTOCOL||!record.claimed||sender.tab?.id!==record.destinationTabId||sender.documentId!==record.documentId)throw new Error('გადატანის გაუქმების ნებართვა არასწორია.')
      return this.lock(`job:${record.id}`,async()=>{
        const latest=await this.read(record.id)
        if(latest.status!=='running')return false
        this.cancelDownloads(latest.id)
        latest.status='error';latest.stage='verifying';latest.errors=[...latest.errors.slice(0,19),'გაფართოების გადატანა შეჩერდა. შევსებული მონაცემები თავად გადაამოწმეთ.']
        await this.save(latest)
        try{await this.photos.remove(latest.id)}catch{pipelineLog(latest.id,'cleanup','failed')}
        if((await this.api.storage.session.get(`active:${latest.sourceTabId}`))[`active:${latest.sourceTabId}`]===latest.id)await this.api.storage.session.remove(`active:${latest.sourceTabId}`)
        if((await this.api.storage.session.get(`destination:${latest.destinationTabId}`))[`destination:${latest.destinationTabId}`]===latest.id)await this.api.storage.session.remove(`destination:${latest.destinationTabId}`)
        return true
      })
    }
    this.destination(record, sender)
    if(message.type==='TRANSFER_RETRY_FIELDS')return this.lock(`job:${record.id}`,async()=>{
      const latest=await this.read(record.id)
      if(latest.status==='running')throw new Error('გადატანა უკვე მიმდინარეობს.')
      if(!latest.fields.some(field=>field.status==='unfilled' && field.retryable))throw new Error('დროებითი შეცდომით შეუვსებელი ველები არ არის. მოუგვარებელი შესაბამისობები ხელით გადაამოწმეთ.')
      latest.status='running';latest.stage='filling';if(latest.activation)latest.activation.state='TRANSFERRING';await this.save(latest);return latest
    })
    if(message.type==='PHOTO_REFRESH')return this.lock(`job:${record.id}`,async()=>{
      const latest=await this.read(record.id)
      if(latest.status!=='running')throw new Error('ეს გადატანა აღარ მუშავდება.')
      if(latest.photos.total || latest.photos.prepared || latest.photos.uploaded)return latest.photos
      let response:{ok?:boolean;error?:string;value?:{vin:string;listingId?:string;images:string[];availableImageCount:number}}
      try{response=await this.api.tabs.sendMessage(latest.sourceTabId,{type:'MANHEIM_PHOTOS',transferId:latest.id,expected:{vin:latest.vehicle.vin,listingId:latest.vehicle.listingId}}) as typeof response}
      catch{throw new Error('ფოტოების წყაროსთან დაკავშირება ვერ მოხერხდა. აუქციონის დეტალური გვერდი გახსნილი დატოვეთ.')}
      if(!response?.ok || !response.value)throw new Error(response?.error ?? 'წყაროს ფოტოგალერეა ვერ წაიკითხა.')
      const value=response.value
      if(value.vin!==latest.vehicle.vin || latest.vehicle.listingId && value.listingId!==latest.vehicle.listingId)throw new Error('ფოტოების ავტომობილი არ ემთხვევა გადატანის ავტომობილს.')
      const images=deduplicatePhotos(Array.isArray(value.images)?value.images:[])
      if(!images.length)throw new Error('არჩეული ავტომობილის გალერეაში ფოტოები ვერ მოიძებნა.')
      latest.vehicle.images=images;latest.vehicle.availableImageCount=Number.isSafeInteger(value.availableImageCount)&&value.availableImageCount>=images.length&&value.availableImageCount<=10000?value.availableImageCount:images.length;latest.photos.total=images.length
      await this.save(latest);return {...latest.photos,availableImageCount:latest.vehicle.availableImageCount}
    })
    if (message.type === 'PHOTO_PREPARE') {
      return this.lock(`photo:${record.id}:${String(message.index)}`, async () => {
        const fresh = await this.read(record.id)
        if (fresh.status !== 'running') throw new Error('ეს გადატანა აღარ მუშავდება.')
        const index = message.index
        if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= record.photos.total) throw new Error('ფოტოს ნომერი არასწორია.')
        const trace=await photoTrace(record.id,record.vehicle.vin,record.vehicle.source)
        trace.mark('PHOTO_URLS_EXTRACTED',record.photos.total)
        const cached = await this.photos.get(record.id, index as number)
        if (cached) {trace.mark('PHOTO_DOWNLOAD_COMPLETED',1,{index:index as number});return cached.metadata}
        const prepared = await this.limitedDownload(async()=>{const current=await this.read(record.id);if(current.status!=='running')throw new Error('ეს გადატანა აღარ მუშავდება.');return this.download(current.vehicle.images[index as number], index as number,undefined,trace,this.downloadSignal(record.id))})
        return this.lock(`job:${record.id}`,async()=>{
        const writable=await this.read(record.id)
        if(writable.status!=='running')throw new Error('ეს გადატანა აღარ მუშავდება.')
        if ((await this.photos.bytes(record.id)) + prepared.blob.size > MAX_TRANSFER_BYTES) throw new Error('ფოტოების საერთო ზომა აღემატება 15 ფაილისთვის დაშვებულ საერთო ზომას. ფაილები არ შეკუმშულა ან შეცვლილა.')
        // Recheck after network/IDB work; an expired or closed destination cannot leave an orphan cache.
        await this.read(record.id)
        prepared.metadata.name = `vehicle-${record.id.slice(0, 8)}-${index as number + 1}.${prepared.metadata.mime === 'image/jpeg' ? 'jpg' : prepared.metadata.mime === 'image/png' ? 'png' : 'webp'}`
        try{await this.photos.put(record.id, prepared.blob, prepared.metadata)}catch(error){trace.mark('PHOTO_DOWNLOAD_COMPLETED',0,{index:index as number,errorCode:'STORAGE_FAILED'});throw error}
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
      this.cancelDownloads(record.id)
      await this.save(latest); await this.photos.remove(record.id);
      if((await this.api.storage.session.get(`active:${latest.sourceTabId}`))[`active:${latest.sourceTabId}`]===latest.id)await this.api.storage.session.remove(`active:${latest.sourceTabId}`)
      if(latest.destinationTabId!==undefined){await this.api.storage.session.remove(`destination:${latest.destinationTabId}`);await this.api.storage.session.remove(`receiver:${latest.destinationTabId}`)}
      return latest
    })
    throw new Error('უცნობი მოთხოვნა.')
  }
}

function validTimings(value:unknown): value is TransferTimings {
  return !!value && typeof value==='object' && !Array.isArray(value) && Object.entries(value).every(([key,ms])=>timingStages.includes(key as typeof timingStages[number]) && typeof ms==='number' && Number.isFinite(ms) && ms>=0 && ms<=TRANSFER_TTL*4)
}
