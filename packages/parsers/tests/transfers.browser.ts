import { assertNormalizedVehicle } from '../src/validation'
import { TransferManager, isManheimSource, isMyautoDestination } from '../../../apps/extension/src/background/transfers'
import { IndexedPhotoStore } from '../../../apps/extension/src/photos/store'
import { downloadPhoto, PHOTO_CHUNK_BYTES, MAX_PHOTO_BYTES } from '../../../apps/extension/src/photos/download'
import { prepareFiles } from '../../../apps/extension/src/photos/client'
import { uploadPhotos, assertFreshMyauto } from '../../../apps/extension/src/photos/upload'
import { selectDropdown } from '../src/dropdowns'
import { fillMyautoForm, verifyMyautoFields } from '../src/myauto'
import { parseManheim24 } from '../src/manheim24'
import type { TransferRecord, PhotoMetadata } from '@auto-importer/shared'
import type { ExtensionApi, Sender } from '../../../apps/extension/src/services/extensionApi'

export async function runTransferTests(manheim: string, myauto: string, check: (value: unknown, label: string) => void) {
  const makeDoc = () => new DOMParser().parseFromString(manheim, 'text/html')
  check(!isManheimSource('https://manheim24.com.evil.example') && !isMyautoDestination('https://myauto.ge.evil.example/ka/add'), 'exact host validation rejects source and destination lookalikes')
  let source = makeDoc()
  const store: Record<string, unknown> = {}, urls: string[] = []
  let nextTab = 100
  const api: ExtensionApi = {
    runtime: { id: 'fixture', sendMessage: async () => null, onMessage: { addListener() {} } },
    tabs: {
      query: async () => [{ id: 7, url: 'https://home.manheim24.com/landingPage#/results/fixture' }],
      sendMessage: async () => ({ ok: true, vehicle: parseManheim24(source) }),
      create: async ({ url }) => { check(url === 'https://myauto.ge/ka/add', 'fresh destination without vehicle/query data'); return { id: ++nextTab } },
    },
    storage: { session: {
      get: async key => structuredClone(key === null ? store : { [key]: store[key] }),
      set: async entries => { Object.assign(store, structuredClone(entries)) },
      remove: async key => { delete store[key] },
    } },
  }
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0))
  const payload = new Uint8Array(PHOTO_CHUNK_BYTES + 500); payload.set(png)
  const cache = new IndexedPhotoStore()
  const manager = new TransferManager(api, cache, async (url,index) => {
    urls.push(url)
    const bytes = payload.slice(); bytes[bytes.length - 1] = url.includes('fixture-b') ? 2 : 1
    return downloadPhoto(url,index, async (_input, init) => {
      check(init?.credentials === 'include' && init.redirect === 'error', 'ordinary authenticated fetch; no credential extraction/redirect forwarding')
      return new Response(bytes, { headers: { 'content-type': 'image/png' } })
    })
  })
  const sourceSender: Sender = { id: 'fixture', tab: { id: 7, url: 'https://home.manheim24.com/landingPage#/results/fixture' } }
  check(await rejectedValidation(), 'normalization validation rejects credentials hidden in raw fields')
  async function rejectedValidation() { try { assertNormalizedVehicle({ ...parseManheim24(source), raw: { accessToken: 'synthetic-sensitive-value' } }); return false } catch { return true } }
  const startReviewed = async () => { const review = await manager.review(sourceSender); return manager.start(sourceSender,review.reviewId) }
  const a = await startReviewed()
  const [a2,a3] = await Promise.all([startReviewed(),startReviewed()])
  check(a.id === a2.id && a2.id === a3.id && nextTab === 101, 'repeated/concurrent clicks deduplicate active vehicle A')
  source = makeDoc()
  const record = source.querySelector('.StockWaveInfo')!
  const bData = JSON.parse(record.textContent!)
  bData.designatedDescriptionEnrichment.vin = '2HGCM82633A004352'
  record.textContent = JSON.stringify({ ...bData, vin: '2HGCM82633A004352', id: 'FIXTURE-B', images: [] })
  source.querySelector('[data-testid="vdp-vin"]')!.textContent = '2HGCM82633A004352'
  for (const img of source.querySelectorAll('img')) img.src = img.src.replace('/fixture/', '/fixture-b/')
  const b = await startReviewed()
  check(b.id !== a.id && b.destinationTabId !== a.destinationTabId && b.vehicle.vin !== a.vehicle.vin, 'vehicle B isolated by transfer ID/source snapshot/destination')
  const senderA: Sender = { id: 'fixture', tab: { id: a.destinationTabId, url: 'https://myauto.ge/ka/add' }, documentId: 'document-A' }
  const senderB: Sender = { id: 'fixture', tab: { id: b.destinationTabId, url: 'https://myauto.ge/ka/add' }, documentId: 'document-B' }
  const claimed = await manager.handle({ type: 'TRANSFER_CLAIM' }, senderA) as TransferRecord
  await manager.handle({ type: 'TRANSFER_CLAIM' }, senderB)
  check(claimed.id === a.id && await manager.handle({ type: 'TRANSFER_CLAIM' }, senderA) === null, 'single claim prevents reinjection/refresh overwrites')
  async function rejected(operation: () => Promise<unknown>) { try { await operation(); return false } catch { return true } }
  check(await rejected(() => manager.handle({ type: 'PHOTO_PREPARE', id: a.id, index: 0 }, senderB)), 'B cannot request A photos')
  check(await rejected(() => manager.handle({ type: 'PHOTO_PREPARE', id: a.id, index: 0 }, { ...senderA, documentId: 'replacement-document' })), 'replacement documents cannot reuse claimed transfers')
  const metaA = await manager.handle({ type: 'PHOTO_PREPARE', id: a.id, index: 0 }, senderA) as PhotoMetadata
  const metaB = await manager.handle({ type: 'PHOTO_PREPARE', id: b.id, index: 0 }, senderB) as PhotoMetadata
  check(metaA.sha256 !== metaB.sha256 && metaA.name !== metaB.name && urls[0].includes('/fixture/') && urls[1].includes('/fixture-b/'), 'vehicle photo bytes, filenames and URLs never mix after SPA selection')
  const firstChunk = await manager.handle({ type: 'PHOTO_CHUNK', id: a.id, index: 0, offset: 0 }, senderA) as string
  check(atob(firstChunk).length === PHOTO_CHUNK_BYTES && firstChunk.length < 300000, 'bounded image chunks stay below Chrome messaging limits')
  Object.defineProperty(window, 'chrome', { configurable: true, value: { runtime: {
    sendMessage: async (message: Record<string, unknown>) => {
      try { return { ok: true, value: await manager.handle(message, senderA) } }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'შეცდომა' } }
    },
  } } })
  const prepared = await prepareFiles(a.id, 1, () => {})
  check(prepared.files.length === 1 && prepared.files[0].type === 'image/png' && prepared.files[0].size === payload.length && prepared.errors.length === 0, 'chunk reassembly creates hash-verified Files with correct MIME/filename')
  check(urls.length === 2, 'lost/repeated prepare requests use cached bytes without duplicate downloads')
  let attempts = 0
  await downloadPhoto(a.vehicle.images[0], 0, async () => { attempts++; return attempts === 1 ? new Response('', { status: 503 }) : new Response(png) })
  check(attempts === 2, 'transient download failure retries')
  attempts = 0
  check(await rejected(() => downloadPhoto(a.vehicle.images[0], 0, async () => { attempts++; return new Response('', { status: 403 }) })) && attempts === 1, 'access denial does not retry or bypass authentication')
  check(await rejected(() => downloadPhoto(a.vehicle.images[0], 0, async () => new Response('<html>login</html>', { headers: { 'content-type': 'image/jpeg' } }))), 'login HTML cannot masquerade as photo data')
  check(await rejected(() => downloadPhoto(a.vehicle.images[0], 0, async () => new Response('', { headers: { 'content-length': String(MAX_PHOTO_BYTES + 1) } }))), 'oversized images rejected before buffering')

  const frame = document.createElement('iframe'); document.body.append(frame)
  const d = frame.contentDocument!; d.open(); d.write(myauto); d.close()
  const staticIcon = d.createElement('img')
  Object.defineProperties(staticIcon,{currentSrc:{value:'https://myauto.ge/build/assets/phone-upload.svg'},complete:{value:true},naturalWidth:{value:40}})
  d.querySelector('[data-testid="photo-video-container"]')!.append(staticIcon)
  assertFreshMyauto(d)
  check(true,'confirmed static phone-upload icon does not count as an existing vehicle photo')
  const manufacturer = d.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.manufacturer"]')!
  const trigger = manufacturer.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
  trigger.addEventListener('click', () => {
    const box = d.createElement('div'); box.setAttribute('role','listbox'); box.id = 'owned-fixture-options'; trigger.setAttribute('aria-controls',box.id)
    setTimeout(() => {
      const option = d.createElement('div'); option.setAttribute('role','option'); option.textContent = 'BMW'
      option.onclick = () => { manufacturer.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value = 'fixture-bmw-id'; manufacturer.querySelector('[data-testid^="single-select-value-"]')!.textContent = 'BMW'; box.remove() }
      box.append(option); d.body.append(box)
    }, 20)
  })
  check(await selectDropdown(d,'manufacturer',{ candidates: ['BMW'] },500) === undefined, 'async owned accessible options selected and verified without invented IDs')
  check((await selectDropdown(d,'fuelType',{ candidates: ['Gasoline'] },50)) !== undefined, 'closed snapshot without owned option evidence remains explicitly unverified')
  const native = d.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!
  native.value = a.vehicle.vin
  check(await rejected(async () => assertFreshMyauto(d)), 'populated listings rejected before writes/uploads')
  native.value = ''
  const count = d.querySelector<HTMLElement>('.fixture-photo-count')!
  const container = d.querySelector('[data-testid="photo-video-container"]')!
  const input = d.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]')!
  input.addEventListener('change', () => {
    setTimeout(() => {
      count.textContent = 'ფოტო 1/15'
      const img = d.createElement('img')
      // Emulate the uploader's server-confirmed DOM, without making an external image request.
      Object.defineProperties(img, { currentSrc: { value: 'https://cdn.example.test/confirmed.png' }, complete: { value: true }, naturalWidth: { value: 640 } })
      container.append(img)
    }, 20)
  }, { once: true })
  const uploaded = await uploadPhotos(d, prepared.files, () => {}, { timeoutMs: 1000 })
  check(input.files?.length === 1 && uploaded.verified === 1, 'DataTransfer dispatches actual Files; remote preview AND widget count verify upload')
  check((await uploadPhotos(d,prepared.files,()=>{},{ timeoutMs:100 })).verified === 0, 'existing gallery prevents duplicate upload retries')
  for (const img of container.querySelectorAll('img')) img.remove()
  count.textContent = 'ფოტო 0/15'
  input.addEventListener('change', () => {
    count.textContent = 'ფოტო 1/15'
    const img = d.createElement('img')
    Object.defineProperties(img, { currentSrc: { value: 'blob:https://myauto.ge/local-only' }, complete: { value: true }, naturalWidth: { value: 640 } })
    container.append(img)
  }, { once: true })
  check((await uploadPhotos(d,prepared.files,()=>{},{ timeoutMs:200 })).verified === 0, 'local blob preview/FileList are not reported as successful server uploads')
  const values = await fillMyautoForm(d,a.vehicle,{ dropdownTimeoutMs:30 })
  native.value = ''
  check(verifyMyautoFields(d,a.vehicle,values).some(f => f.field === 'VIN' && f.status === 'unfilled'), 'final verification detects fields reset by dependent rerenders')
  for (const img of container.querySelectorAll('img')) img.remove()
  count.textContent = 'ფოტო 0/15'
  input.value = ''
  let uploadAttempts = 0
  input.addEventListener('change', () => {
    uploadAttempts++
    if (uploadAttempts === 1) {
      input.value = ''
      const alert = d.createElement('div'); alert.setAttribute('role','alert'); alert.textContent = 'სატესტო დროებითი შეცდომა'; container.append(alert)
    } else {
      container.querySelector('[role="alert"]')!.remove()
      count.textContent = 'ფოტო 1/15'
      const image = d.createElement('img')
      Object.defineProperties(image,{currentSrc:{value:'https://cdn.example.test/retried.png'},complete:{value:true},naturalWidth:{value:640}})
      container.append(image)
    }
  })
  const retryUpload = await uploadPhotos(d,prepared.files,()=>{},{timeoutMs:1000})
  check(retryUpload.verified === 1 && uploadAttempts === 2, 'upload retries only after explicit failure with empty queue/gallery; no blind duplicates')
  frame.remove()
  await manager.handle({ type: 'TRANSFER_PROGRESS', id:a.id,stage:'verifying' }, senderA)
  const finished = await manager.handle({ type: 'TRANSFER_FINISH', id:a.id,fields:[],uploaded:1,errors:['დანარჩენი ფოტოები სატესტო რეჟიმში არ ატვირთულა.'] },senderA) as TransferRecord
  check(await rejected(() => manager.handle({type:'TRANSFER_PROGRESS',id:a.id,stage:'filling'},senderA)), 'finished transfers cannot be restarted or mutated by progress messages')
  check(finished.status === 'error' && finished.photos.uploaded === 1 && finished.photos.failed === a.photos.total - 1, 'partial photo transfer never becomes fake completion')
  check(!await cache.get(a.id,0) && !!await cache.get(b.id,0), 'finish clears A binary data without touching B')
  await manager.tabClosed(b.destinationTabId!)
  check(!await cache.get(b.id,0) && !store[`job:${b.id}`], 'closing destination cleans only its transfer/cache')
  ;(store[`job:${a.id}`] as TransferRecord).createdAt -= 31 * 60 * 1000
  await manager.prune()
  check(!store[`job:${a.id}`], 'expired records and orphaned temporary images cleaned')
}
