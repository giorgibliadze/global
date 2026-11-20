import {EdgePreloads} from './edgePreloads'
import {downloadSourcePhoto} from './edgeDownloads'
import {isPhotoErrorCode} from '../photos/checkpoints'
import { pipelineLog } from '../services/diagnostics'
import { extensionApi, operation } from '../services/extensionApi'
import { IndexedPhotoStore } from '../photos/store'
import { TransferManager } from './transfers'

const workerStartedAt=Date.now()
const api = extensionApi()
const edgePreloads=new EdgePreloads(api)
const transfers = new TransferManager(api, new IndexedPhotoStore(),downloadSourcePhoto,edgePreloads)
edgePreloads.setDownloader(transfers.preloadEdgePhoto)
let maintenance=transfers.validateState().then(()=>transfers.prune()).then(()=>{},()=>{pipelineLog(undefined,'cleanup','failed')})
api.runtime.onInstalled?.addListener(details=>{void edgePreloads.clear().catch(()=>{});maintenance=maintenance.then(()=>transfers.validateState(details.reason==='update'?{invalidateBefore:workerStartedAt}:{})).catch(()=>{pipelineLog(undefined,'cleanup','failed')})})
const types = new Set(['EDGE_PHOTO_RELEASE','TRANSFER_ACTIVE','LOCATION_PREFERENCE_GET','LOCATION_PREFERENCE_SET','PREFETCH_INVALIDATE','PREFETCH_PREPARE','TRANSFER_BEGIN','TRANSFER_RETRY_FIELDS','TRANSFER_REVIEW','TRANSFER_START','TRANSFER_CLAIM','TRANSFER_ABORT','TRANSFER_STATUS','TRANSFER_PROGRESS','TRANSFER_FINISH','PHOTO_REFRESH','PHOTO_PREPARE','PHOTO_CHUNK'])
api.runtime.onMessage.addListener((message, sender, reply) => {
  if(sender.id===api.runtime.id&&['EDGE_PRELOAD_UPDATE','EDGE_PRELOAD_DROP','EDGE_PRELOAD_STATUS'].includes(operation(message)??'')){
    const value=message as Record<string,unknown>,task=operation(message)==='EDGE_PRELOAD_UPDATE'?edgePreloads.update(value,sender):operation(message)==='EDGE_PRELOAD_DROP'?edgePreloads.invalidate(sender,value.id):edgePreloads.status()
    void task.then(value=>reply({ok:true,value}),()=>reply({ok:false,error:'EDGE-ის წინასწარი cache მიუწვდომელია; გადატანა ჩვეულებრივი გზით გაგრძელდება.'}));return true
  }
  if (sender.id !== api.runtime.id || !types.has(operation(message) ?? '')) return
  void maintenance.then(()=>transfers.handle(message as Record<string, unknown>, sender)).then(
    value => reply({ ok: true, value }),
    error => {
      pipelineLog((message as {id?:unknown;reviewId?:unknown}).id ?? (message as {reviewId?:unknown}).reviewId,'messaging','failed')
      const code=error && typeof error==='object' && 'photoErrorCode' in error?error.photoErrorCode:undefined
      reply({ ok: false, ...(isPhotoErrorCode(code)?{photoErrorCode:code}:{}), error: error instanceof Error && /[\u10A0-\u10FF]/.test(error.message) ? error.message : 'გადატანა ვერ შესრულდა. გადატვირთეთ გვერდი და ხელახლა სცადეთ.' })
    },
  )
  return true
})
api.tabs.onRemoved?.addListener(tabId => { void edgePreloads.closeTab(tabId).catch(()=>{});void maintenance.then(()=>transfers.tabClosed(tabId)).catch(() => { pipelineLog(undefined,'cleanup','failed') }) })
api.alarms?.onAlarm.addListener(alarm => {
  if(alarm.name==='auto-importer-edge-preload-cleanup')void edgePreloads.sweep().catch(()=>{})
  if (alarm.name === 'auto-importer-cleanup') void maintenance.then(()=>transfers.prune()).then(count => { if (count) return api.alarms?.create(alarm.name, { delayInMinutes: 30 }) }).catch(() => { pipelineLog(undefined,'cleanup','failed') })
})

