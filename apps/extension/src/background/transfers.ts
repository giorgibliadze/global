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
export const vehicleSnapshot = (v: NormalizedVehicle) => JSON.stringify({...v, images:undefined,raw:undefined,warnings:undefined,availableImageCount:undefined})
interface VehicleReview { reviewId: string; sourceTabId: number; vehicle: NormalizedVehicle; createdAt: number }
const REVIEW_TTL = 5 * 60 * 1000
export class TransferManager {
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
    await this.photos.remove(record.id)
    await this.api.storage.session.remove(`job:${record.id}`)
    if ((await this.api.storage.session.get(`active:${record.sourceTabId}`))[`active:${record.sourceTabId}`] === record.id) await this.api.storage.session.remove(`active:${record.sourceTabId}`)
    if (record.destinationTabId !== undefined) await this.api.storage.session.remove(`destination:${record.destinationTabId}`)
  }
  async prune() {
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
    await this.photos.prune(valid, snapshotAt)
    return valid.size
  }
  async tabClosed(tabId: number) {
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
  async review(sender: Sender): Promise<VehicleReview> {
    const tab = sender.tab ?? (await this.api.tabs.query({active:true,currentWindow:true}))[0]
    if (tab?.id === undefined || !isManheimSource(tab.url)) throw new Error('გახსენით ავტომობილის დეტალები Manheim24-ზე.')
    await this.prune()
    const response = await this.api.tabs.sendMessage(tab.id,{type:'MANHEIM_PARSE'}) as {ok:boolean;vehicle?:NormalizedVehicle;error?:string}
    if (!response.ok || !response.vehicle) throw new Error(response.error ?? 'ავტომობილის ამოცნობა ვერ მოხერხდა.')
    assertNormalizedVehicle(response.vehicle)
    const review: VehicleReview = {reviewId:crypto.randomUUID(),sourceTabId:tab.id,vehicle:structuredClone(response.vehicle),createdAt:Date.now()}
    const old = Object.entries(await this.api.storage.session.get(null)).filter(([k]) => k.startsWith('review:')).sort((a,b) => (a[1] as VehicleReview).createdAt-(b[1] as VehicleReview).createdAt)
    for (const [key] of old.slice(0,Math.max(0,old.length-19))) await this.api.storage.session.remove(key)
    await this.api.storage.session.set({[`review:${review.reviewId}`]:review})
    return review
  }
  async start(sender: Sender, reviewId?: unknown): Promise<TransferRecord> {
    const tab = sender.tab ?? (await this.api.tabs.query({ active: true, currentWindow: true }))[0]
    if (tab?.id === undefined || !isManheimSource(tab.url)) throw new Error('გახსენით ავტომობილის დეტალები Manheim24-ზე.')
    return this.lock(`source:${tab.id}`, async () => {
      await this.prune()
      if (!uuid(reviewId)) throw new Error('ჯერ გადაამოწმეთ ორიგინალი და ქართული მონაცემები.')
      const reviewed = (await this.api.storage.session.get(`review:${reviewId}`))[`review:${reviewId}`] as VehicleReview | undefined
      if (!reviewed || reviewed.sourceTabId !== tab.id || Date.now()-reviewed.createdAt > REVIEW_TTL) throw new Error('წინასწარი შემოწმება მოძველდა ან სხვა ჩანართს ეკუთვნის. ხელახლა გადაამოწმეთ მონაცემები.')
      const response = await this.api.tabs.sendMessage(tab.id!, { type: 'MANHEIM_PARSE' }) as { ok: boolean; vehicle?: NormalizedVehicle; error?: string }
      if (!response.ok || !response.vehicle) throw new Error(response.error ?? 'ავტომობილის ამოცნობა ვერ მოხერხდა.')
      assertNormalizedVehicle(response.vehicle)
      if (vehicleSnapshot(reviewed.vehicle) !== vehicleSnapshot(response.vehicle)) throw new Error('არჩეული ავტომობილი ან მისი მონაცემები შეიცვალა. ხელახლა გადაამოწმეთ ორიგინალი და ქართული მონაცემები.')
      const vehicle = structuredClone(reviewed.vehicle)
      await this.api.storage.session.remove(`review:${reviewId}`)
      const active = (await this.api.storage.session.get(`active:${tab.id}`))[`active:${tab.id}`]
      if (uuid(active)) {
        try {
          const old = await this.read(active)
          if (vehicleSnapshot(old.vehicle) === vehicleSnapshot(vehicle) && old.status === 'running') return old
        } catch { /* Expired jobs do not prevent a fresh user-initiated transfer. */ }
      }
      const entries = await this.api.storage.session.get(null)
      if (Object.entries(entries).filter(([k,v]) => k.startsWith('job:') && (v as TransferRecord).status === 'running').length >= 4) throw new Error('ერთდროულად მაქსიმუმ ოთხი გადატანაა შესაძლებელი. დაელოდეთ მიმდინარე ოპერაციებს.')
      const record: TransferRecord = {
        id: crypto.randomUUID(), sourceTabId: tab.id!, vehicle,
        createdAt: Date.now(), updatedAt: Date.now(), stage: 'preparing', status: 'running', claimed: false,
        photos: { total: vehicle.images.length, prepared: 0, uploaded: 0, failed: 0 }, fields: [], errors: [],
      }
      await this.save(record)
      await this.api.storage.session.set({ [`active:${tab.id}`]: record.id })
      try {
        record.stage = 'opening'; await this.save(record)
        const target: Tab = await this.api.tabs.create({ url: 'https://myauto.ge/ka/add' })
        if (target.id === undefined) throw new Error('MyAuto-ს გახსნა ვერ მოხერხდა.')
        record.destinationTabId = target.id
        await this.save(record)
        await this.api.storage.session.set({ [`destination:${target.id}`]: record.id })
        await this.api.alarms?.create('auto-importer-cleanup', { delayInMinutes: 30 })
        return record
      } catch {
        record.status = 'error'; record.errors = ['MyAuto-ს ახალი ჩანართის გახსნა ვერ დასრულდა.']; await this.save(record)
        throw new Error(record.errors[0])
      }
    })
  }
  async handle(message: Record<string, unknown>, sender: Sender): Promise<unknown> {
    if (message.type === 'TRANSFER_REVIEW') return this.review(sender)
    if (message.type === 'TRANSFER_START') return this.start(sender,message.reviewId)
    if (message.type === 'TRANSFER_CLAIM') {
      if (!isMyautoDestination(sender.tab?.url) || sender.tab?.id === undefined) throw new Error('მიმღები გვერდი არასწორია.')
      return this.lock(`claim:${sender.tab.id}`, async () => {
        const id = (await this.api.storage.session.get(`destination:${sender.tab!.id}`))[`destination:${sender.tab!.id}`]
        if (!id) return null
        const record = await this.read(id)
        if (record.destinationTabId !== sender.tab!.id || record.claimed) return null
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
    if (message.type === 'PHOTO_PREPARE') {
      return this.lock(`job:${record.id}`, async () => {
        const fresh = await this.read(record.id)
        if (fresh.status !== 'running') throw new Error('ეს გადატანა აღარ მუშავდება.')
        const index = message.index
        if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= record.photos.total) throw new Error('ფოტოს ნომერი არასწორია.')
        const cached = await this.photos.get(record.id, index as number)
        if (cached) return cached.metadata
        const prepared = await this.download(record.vehicle.images[index as number], index as number)
        if ((await this.photos.bytes(record.id)) + prepared.blob.size > MAX_TRANSFER_BYTES) throw new Error('ფოტოების საერთო ზომა აღემატება 15 ფაილისთვის დაშვებულ საერთო ზომას. ფაილები არ შეკუმშულა ან შეცვლილა.')
        // Recheck after network/IDB work; an expired or closed destination cannot leave an orphan cache.
        await this.read(record.id)
        prepared.metadata.name = `vehicle-${record.id.slice(0, 8)}-${index as number + 1}.${prepared.metadata.mime === 'image/jpeg' ? 'jpg' : prepared.metadata.mime === 'image/png' ? 'png' : 'webp'}`
        await this.photos.put(record.id, prepared.blob, prepared.metadata)
        let latest: TransferRecord
        try { latest = await this.read(record.id) }
        catch (error) { await this.photos.remove(record.id); throw error }
        latest.photos.prepared = (await Promise.all(record.vehicle.images.map((_, i) => this.photos.get(record.id, i)))).filter(Boolean).length
        await this.save(latest)
        return prepared.metadata
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
      const allowed: TransferStage[] = ['preparing', 'filling', 'uploading', 'verifying']
      if (!allowed.includes(message.stage as TransferStage) || latest.status !== 'running') throw new Error('გადატანის ეტაპი არასწორია.')
      const order = ['preparing','filling','uploading','verifying']
      if (order.includes(latest.stage) && order.indexOf(message.stage as string) < order.indexOf(latest.stage)) throw new Error('გადატანის ეტაპი უკან ვერ დაბრუნდება.')
      latest.stage = message.stage as TransferStage; await this.save(latest); return true
    })
    if (message.type === 'TRANSFER_FINISH') return this.lock(`job:${record.id}`, async () => {
      const latest = await this.read(record.id)
      if (latest.status !== 'running') return latest
      const fields = message.fields
      const errors = message.errors
      if (!Array.isArray(fields) || fields.length > 80 || !fields.every(isFieldResult) || !Array.isArray(errors) || errors.length > 20 || !errors.every(v => typeof v === 'string' && v.length <= 500)) throw new Error('შედეგების ფორმატი არასწორია.')
      if (!Number.isInteger(message.uploaded) || (message.uploaded as number) < 0 || (message.uploaded as number) > latest.photos.prepared) throw new Error('ატვირთვის რაოდენობა არასწორია.')
      latest.fields = fields; latest.errors = errors; latest.photos.uploaded = message.uploaded as number
      latest.photos.failed = latest.photos.total - latest.photos.uploaded
      latest.status = errors.length || fields.some(f => f.status === 'unfilled') || latest.photos.failed > 0 ? 'error' : 'review'
      latest.stage = latest.status === 'review' ? 'review' : 'verifying'
      await this.save(latest); await this.photos.remove(record.id); return latest
    })
    throw new Error('უცნობი მოთხოვნა.')
  }
}
function isFieldResult(value: unknown): value is FieldResult {
  if (!value || typeof value !== 'object') return false
  const f = value as FieldResult
  return (f.optionId === undefined || (typeof f.optionId === 'string' && f.optionId.length<=200)) && (f.optionLabel === undefined || (typeof f.optionLabel === 'string' && f.optionLabel.length<=500)) && (f.match === undefined || ['exact','equivalent','custom'].includes(f.match)) && typeof f.field === 'string' && f.field.length <= 120 && ['filled','unfilled'].includes(f.status) && typeof f.reason === 'string' && f.reason.length <= 500
}
