import { createRoot } from 'react-dom/client'
import { fillMyautoForm, verifyMyautoFields } from '@auto-importer/parsers/myauto'
import type { FieldResult, TransferRecord, TransferStage } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
import { prepareFiles } from '../photos/client'
import { assertFreshMyauto, uploadPhotos } from '../photos/upload'
import styles from '../styles/ui.css?inline'
import { Summary } from './Summary'

async function receive() {
  if (!/^\/ka\/add\/?$/.test(location.pathname) || document.getElementById('auto-importer-results')) return
  let job: TransferRecord | null = null
  for (let attempt = 0; attempt < 20 && !job; attempt++) {
    job = await request<TransferRecord | null>({ type: 'TRANSFER_CLAIM' })
    if (!job) await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!job || document.getElementById('auto-importer-results')) return
  const transfer = job
  const host = document.createElement('div')
  host.id = 'auto-importer-results'
  host.style.setProperty('all', 'initial', 'important')
  host.style.setProperty('position', 'fixed', 'important')
  host.style.setProperty('z-index', '2147483647', 'important')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles + `.summary{position:fixed;right:16px;top:100px;width:min(360px,calc(100vw - 32px));max-height:calc(100dvh - 112px);overflow:auto;background:white;border:1px solid #E2E8F0;border-radius:16px;padding:20px;color:#0F172A;box-shadow:0 8px 30px #0f172a33;font:13px/1.6 sans-serif}.close{float:right;border:0;background:#F8FAFC;border-radius:6px;font-size:22px;cursor:pointer}h2{margin:0}ul{padding-left:18px}li{margin-top:12px}p{margin:6px 0;color:#475569}`
  const root = document.createElement('div')
  shadow.append(style, root)
  document.documentElement.append(host)
  const view = createRoot(root)
  let current = structuredClone(transfer)
  const render = () => view.render(<Summary record={structuredClone(current)} />)
  async function phase(stage: TransferStage) {
    current.stage = stage; render()
    await request({ type: 'TRANSFER_PROGRESS', id: transfer.id, stage })
  }
  const controller = new AbortController()
  const guard = () => {
    if (!/^\/ka\/add\/?$/.test(location.pathname)) { controller.abort(); throw new Error('გვერდის მისამართი შეიცვალა. გადატანა შეჩერებულია.') }
    const vin = document.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value.trim()
    if (vin && vin !== transfer.vehicle.vin) { controller.abort(); throw new Error('ფორმაში სხვა ავტომობილის VIN გამოჩნდა. ფოტოები არ შეირევა.') }
  }
  let results: FieldResult[] = [], uploaded = 0
  const errors: string[] = []
  render()
  try {
    // Authentication/delayed SPA rendering are handled without private API calls.
    for (let attempt = 0; attempt < 100 && !document.querySelector('input[name="primaryFeatures.vinCode"]'); attempt++) { guard(); await new Promise(resolve => setTimeout(resolve, 250)) }
    if (!document.querySelector('input[name="primaryFeatures.vinCode"]')) throw new Error('MyAuto-ს ფორმა ვერ მოიძებნა. შეამოწმეთ ავტორიზაცია და გვერდის ჩატვირთვა.')
    assertFreshMyauto(document)
    await phase('preparing')
    const prepared = await prepareFiles(transfer.id, transfer.photos.total, (ready, failed) => {
      current.photos.prepared = ready; current.photos.failed = failed; render()
    }, controller.signal)
    errors.push(...prepared.errors)
    guard()
    assertFreshMyauto(document)
    await phase('filling')
    results = await fillMyautoForm(document, transfer.vehicle, {
      allowAutofillCorrection: true, signal: controller.signal, beforeField: guard,
      onResult: fields => { current.fields = fields; render() },
    })
    guard()
    if (document.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value !== transfer.vehicle.vin) throw new Error('ფორმის VIN ვერ დადასტურდა. ფოტოების ატვირთვა შეჩერებულია.')
    await phase('uploading')
    const upload = await uploadPhotos(document, prepared.files, count => { current.photos.uploaded = count; render() }, { signal: controller.signal, guard })
    uploaded = upload.verified; errors.push(...upload.errors)
    await phase('verifying')
    guard()
    results = verifyMyautoFields(document, transfer.vehicle, results)
  } catch (error) {
    errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message) ? error.message : 'გადატანა ვერ დასრულდა. ველები და ფოტოები გადაამოწმეთ; წარმატება არ დადასტურებულა.')
  }
  try {
    current = await request<TransferRecord>({ type: 'TRANSFER_FINISH', id: transfer.id, fields: results, errors, uploaded })
  } catch {
    current.status = 'error'; current.errors = [...errors, 'საბოლოო შედეგის შენახვა ვერ მოხერხდა. მონაცემები და ფოტოები გადაამოწმეთ MyAuto-ზე.']
  }
  render()
}
void receive().catch(() => { /* No approved job or an invalidated extension context must leave ordinary visits untouched. */ })
