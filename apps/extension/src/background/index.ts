import { pipelineLog } from '../services/diagnostics'
import { extensionApi, operation } from '../services/extensionApi'
import { IndexedPhotoStore } from '../photos/store'
import { TransferManager } from './transfers'

const api = extensionApi()
const transfers = new TransferManager(api, new IndexedPhotoStore())
void transfers.prune().catch(() => { pipelineLog(undefined,'cleanup','failed') })
const types = new Set(['TRANSFER_RETRY_FIELDS','TRANSFER_REVIEW','TRANSFER_START','TRANSFER_CLAIM','TRANSFER_STATUS','TRANSFER_PROGRESS','TRANSFER_FINISH','PHOTO_PREPARE','PHOTO_CHUNK'])
api.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== api.runtime.id || !types.has(operation(message) ?? '')) return
  void transfers.handle(message as Record<string, unknown>, sender).then(
    value => reply({ ok: true, value }),
    error => {
      pipelineLog((message as {id?:unknown;reviewId?:unknown}).id ?? (message as {reviewId?:unknown}).reviewId,'messaging','failed')
      reply({ ok: false, error: error instanceof Error && /[\u10A0-\u10FF]/.test(error.message) ? error.message : 'გადატანა ვერ შესრულდა. გადატვირთეთ გვერდი და ხელახლა სცადეთ.' })
    },
  )
  return true
})
api.tabs.onRemoved?.addListener(tabId => { void transfers.tabClosed(tabId).catch(() => { pipelineLog(undefined,'cleanup','failed') }) })
api.alarms?.onAlarm.addListener(alarm => {
  if (alarm.name === 'auto-importer-cleanup') void transfers.prune().then(count => { if (count) return api.alarms?.create(alarm.name, { delayInMinutes: 30 }) }).catch(() => { pipelineLog(undefined,'cleanup','failed') })
})

