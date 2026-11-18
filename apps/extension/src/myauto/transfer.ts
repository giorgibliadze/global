import {waitForUploader} from '../photos/readiness'
import {liveClaim,isMyautoAddUrl,TRANSFER_PROTOCOL} from '../services/transferActivation'
import {assertNormalizedVehicle} from '@auto-importer/parsers/validation'
import {photoTrace,photoReport,preparationFailureStage} from '../photos/checkpoints'
import type {PhotoCheckpoint,PhotoErrorCode} from '../photos/checkpoints'
import {locationField,fillLocation} from '@auto-importer/parsers/myauto'
import {resolveListingLocation} from '@auto-importer/parsers/location'
import { waitForDomReady } from '../services/domReady'
import { sessionLog,pipelineLog, timingLog } from '../services/diagnostics'
import { isMyautoControllerForm,textInteractive,fillMyautoForm, verifyMyautoFields, verifyMyautoPersistence, applyAutofillPolicy, myautoFields } from '@auto-importer/parsers/myauto'
import type { FieldResult, TransferRecord, TransferStage, TimingStage } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
import { prepareFiles } from '../photos/client'
import { assertFreshMyauto, uploadPhotos } from '../photos/upload'

export async function claimMyautoTransfer(attempts = 1, intervalMs = 500): Promise<TransferRecord | null> {
  let failed = false
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const job = await request<TransferRecord | null>({ type: 'TRANSFER_CLAIM',protocol:TRANSFER_PROTOCOL })
      failed = false
      if (job) {if(!liveClaim(job))throw new Error('გადატანის ნებართვა არასწორია.');assertNormalizedVehicle(job.vehicle);pipelineLog(job.id,'claiming','completed');return job}
      return null
    } catch { failed = true; pipelineLog(undefined,'claiming','retry') }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs,25*2**Math.min(attempt,5))))
  }
  if (failed) { pipelineLog(undefined,'claiming','failed'); throw new Error('MyAuto-სთან დაკავშირება ვერ მოხერხდა. გადატვირთეთ გაფართოება და გვერდი; შემდეგ დაიწყეთ ახალი გადატანა.') }
  return null // An ordinary visit has no approved transfer and must remain untouched.
}

const activeForms=new WeakMap<Document,{id:string;controller:AbortController}>()

// The content-script entry and the browser regression harness run this same receiver.
export async function runMyautoTransfer(doc: Document, transfer: TransferRecord, onUpdate: (record: TransferRecord) => void, options: { pageUrl?: () => string; dropdownTimeoutMs?: number; uploadTimeoutMs?: number;signal?:AbortSignal } = {}): Promise<TransferRecord> {
  if(!liveClaim(transfer))throw new Error('გადატანის ნებართვა არასწორია.')
  assertNormalizedVehicle(transfer.vehicle)
  if(activeForms.has(doc))throw new Error('ამ ფორმაში გადატანა უკვე მიმდინარეობს.')
  const controller = new AbortController()
  const owner={id:transfer.id,controller};activeForms.set(doc,owner)
  const cleanups:Array<()=>void>=[]
  const abort=()=>controller.abort(options.signal?.reason)
  if(options.signal?.aborted)abort()
  options.signal?.addEventListener('abort',abort,{once:true})
  cleanups.push(()=>options.signal?.removeEventListener('abort',abort))
  try {
  const trace=await photoTrace(transfer.id,transfer.vehicle.vin,transfer.vehicle.source)
  const photoCounts={source:transfer.photos.total,discovered:transfer.vehicle.availableImageCount??transfer.photos.total,delivered:0,downloaded:0,received:0,attempts:0,verified:0}
  let photoStage:PhotoCheckpoint='PHOTO_PAYLOAD_RECEIVED',photoCode:PhotoErrorCode|undefined
  const transferStarted=performance.now()
  const pageUrl = options.pageUrl ?? (() => doc.location.href)
  let current = structuredClone(transfer)
  current.timings={...current.timings}
  const addTiming=(stage:TimingStage,ms:number)=>{current.timings![stage]=(current.timings![stage] ?? 0)+ms;timingLog(transfer.id,stage,ms,{platform:transfer.vehicle.source,vehicleId:trace.vehicleId,status:'completed'})}
  async function measure<T>(stage:TimingStage,fn:()=>Promise<T>):Promise<T>{const started=performance.now();try{const result=await fn();addTiming(stage,performance.now()-started);return result}catch(error){timingLog(transfer.id,stage,performance.now()-started,{platform:transfer.vehicle.source,vehicleId:trace.vehicleId,status:'failed'});throw error}}
  const update = () => onUpdate(structuredClone(current))
  async function phase(stage: TransferStage) {
    current.currentField=undefined;current.stage = stage; update()
    pipelineLog(transfer.id,stage,'started')
    await request({ type: 'TRANSFER_PROGRESS', id: transfer.id, stage,fields:current.fields,currentField:'' })
  }
  const guard = () => {
    controller.signal.throwIfAborted()
    if(activeForms.get(doc)!==owner){controller.abort();throw new Error('გადატანა ჩანაცვლებულია.')}
    if (!isMyautoAddUrl(pageUrl())) { controller.abort(); throw new Error('გვერდის მისამართი შეიცვალა. გადატანა შეჩერებულია.') }
    const vin = doc.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value.trim()
    if (vin && vin !== transfer.vehicle.vin) { controller.abort(); throw new Error('ფორმაში სხვა ავტომობილის VIN გამოჩნდა. ფოტოები არ შეირევა.') }
  }
  const navigation=()=>{try{guard()}catch{controller.abort()}}
  const pagehide=()=>controller.abort()
  cleanups.push(()=>{doc.defaultView?.removeEventListener('popstate',navigation);doc.defaultView?.removeEventListener('hashchange',navigation);doc.defaultView?.removeEventListener('pagehide',pagehide)})
  doc.defaultView?.addEventListener('popstate',navigation);doc.defaultView?.addEventListener('hashchange',navigation);doc.defaultView?.addEventListener('pagehide',pagehide)
  let lastUrl=pageUrl()
  const routeObserver=new doc.defaultView!.MutationObserver(()=>{const url=pageUrl();if(url!==lastUrl){lastUrl=url;navigation()}})
  cleanups.push(()=>routeObserver.disconnect())
  routeObserver.observe(doc.documentElement,{subtree:true,childList:true})
  let planned:ReturnType<typeof myautoFields>=[]
  const userEdited=new Set<string>()
  const noteUser=(event:Event)=>{
    if(!event.isTrusted || !(event.target instanceof doc.defaultView!.Element))return
    for(const field of planned){
      const owner=field.dropdownKey==='location.location'?doc.querySelector('[data-testid="single-select-location.location"]'):field.dropdownKey?doc.querySelector(`[data-testid="single-select-primaryFeatures.${field.dropdownKey}"]`) ?? doc.querySelector(`select[name="primaryFeatures.${field.dropdownKey}"]`) ?? doc.querySelector(`input[name="primaryFeatures.${field.dropdownKey}"]`):field.selector?doc.querySelector(field.selector):null
      if(owner?.contains(event.target) && (event.type!=='pointerdown' || field.mode!=='text'))userEdited.add(field.field)
    }
  }
  const editEvents=['pointerdown','keydown','input','change']
  cleanups.push(()=>{for(const event of editEvents)doc.removeEventListener(event,noteUser,true)})
  for(const event of editEvents)doc.addEventListener(event,noteUser,true)
  let results: FieldResult[] = [], uploaded = 0
  const errors: string[] = []
  update()
  try {
    // Authentication/delayed SPA rendering are handled without private API calls.
    const formReady=()=>!!doc.querySelector('input[name="primaryFeatures.vinCode"],input[name="primaryFeatures.model"],select[name="primaryFeatures.model"],[data-testid="single-select-primaryFeatures.model"],[data-testid="description-textarea"]')
    await waitForDomReady(doc,()=>{guard();return formReady() && (!isMyautoControllerForm(doc) || textInteractive(doc))},controller.signal,25000)
    const formReadyAt=performance.now();trace.mark('MYAUTO_PAGE_READY',current.photos.total)
    addTiming('destinationReadiness',Math.max(0,Date.now()-transfer.createdAt))
    assertFreshMyauto(doc)
    await phase('preparing')
    await phase('matching')
    planned=await measure('normalization',async()=>applyAutofillPolicy(structuredClone(transfer.preparedFields ?? myautoFields(transfer.vehicle))))
    await phase('filling')
    current.formTotal=planned.length
    let firstField=false
    const formPipeline=async()=>{
      results = await measure('formFilling',()=>fillMyautoForm(doc, transfer.vehicle, {
        planned,onField:label=>{current.currentField=label;update()},onTiming:addTiming,onFieldStage:activity=>{current.activity=activity;update()},
        allowAutofillCorrection:true,dropdownTimeoutMs:options.dropdownTimeoutMs,signal:controller.signal,beforeField:guard,
        onResult:async fields=>{
          guard();current.fields=fields
          if(fields.some(field=>field.status!=='filled'))sessionLog(current,trace.vehicleId,'field-mapping','partial','FIELD_UNRESOLVED')
          if(!firstField && fields.some(field=>field.status==='filled' && field.persisted)){firstField=true;addTiming('firstField',performance.now()-transferStarted);addTiming('firstFieldAfterReady',performance.now()-formReadyAt)}
          update()
          await request({type:'TRANSFER_PROGRESS',id:transfer.id,stage:'filling',fields,formTotal:planned.length,currentField:current.currentField ?? ''})
        },
      }))
      guard();current.currentField=undefined;current.activity=undefined;update()
      pipelineLog(transfer.id,'filling',results.some(result=>result.status!=='filled')?'partial':'completed')
    }
    const preparePhotoFiles=async()=>{
      photoStage='PHOTO_URLS_EXTRACTED';photoCode='MESSAGE_FAILED'
      if(!current.photos.total){const refreshed=await request<TransferRecord['photos'] & {availableImageCount?:number}>({type:'PHOTO_REFRESH',id:transfer.id});current.photos=refreshed;if(typeof refreshed.availableImageCount==='number')photoCounts.discovered=Math.max(photoCounts.discovered,refreshed.availableImageCount);update()}
      photoCounts.source=current.photos.total;photoCounts.discovered=Math.max(photoCounts.discovered,current.photos.total)
      trace.mark('PHOTO_URLS_EXTRACTED',current.photos.total,current.photos.total?{}:{errorCode:'NO_URLS'})
      photoStage='PHOTO_PAYLOAD_RECEIVED'
      const prepared=await measure('photoDownload',()=>prepareFiles(transfer.id,current.photos.total,(ready,failed)=>{
        guard();current.photos.prepared=ready;current.photos.failed=failed;update()
      },controller.signal,undefined,trace,addTiming))
      photoCounts.received=prepared.files.length;trace.mark('PHOTO_FILES_PREPARED',prepared.files.length)
      // Files are reconstructed only after metadata, complete chunks and SHA verification.
      photoCounts.downloaded=prepared.downloaded
      if(prepared.errors.length)photoCode=prepared.failureCode
      return prepared
    }
    // Known photo lists download concurrently. A missing gallery is resolved only
    // after text fills: PHOTO_REFRESH holds the job lock also used by form progress.
    const prefetchedPhotos=current.photos.total>0?preparePhotoFiles():undefined
    void prefetchedPhotos?.catch(()=>{}) // The original promise is awaited/reported below.
    const photoPipeline=async()=>{
      pipelineLog(transfer.id,'uploading','started')
      const prepared=await (prefetchedPhotos??preparePhotoFiles())
      errors.push(...prepared.errors)
      // The adapter owns one upload operation. Only source-confirmed failed
      // gallery IDs may be resubmitted; successful photos are never cleared.
      if(!prepared.files.length){photoStage=preparationFailureStage(prepared.failureCode);photoCode=prepared.failureCode??(current.photos.total?'FILE_CONVERSION_FAILED':'NO_URLS');throw new Error('ფოტოების გადატანა ვერ დასრულდა')}
      photoStage='MYAUTO_UPLOADER_READY';photoCode='UPLOADER_TIMEOUT'
      guard();await measure('uploaderReadiness',()=>waitForUploader(doc,controller.signal,options.uploadTimeoutMs??25000,transfer.id));guard()
      trace.mark('MYAUTO_UPLOADER_READY',prepared.files.length)
      photoStage='PHOTO_UPLOAD_STARTED';photoCode='INPUT_REJECTED'
      const upload=await measure('photoUpload',()=>uploadPhotos(doc,prepared.files,count=>{guard();current.photos.uploaded=count;update()},{timeoutMs:options.uploadTimeoutMs,signal:controller.signal,guard,trace,onTiming:addTiming,onSubmitted:count=>{photoCounts.attempts++;photoCounts.delivered=count;current.photos.submitted=count;update()}}))
      uploaded=upload.verified;photoCounts.verified=uploaded;errors.push(...upload.errors)
      photoStage=photoCounts.attempts?'PHOTO_GALLERY_VERIFIED':'PHOTO_UPLOAD_STARTED';photoCode=upload.errorCode??(!photoCounts.attempts?'INPUT_REJECTED':uploaded===current.photos.total && uploaded>0?undefined:uploaded?'UPLOAD_UNCONFIRMED':'EMPTY_GALLERY')
      if(photoCounts.attempts)trace.mark('PHOTO_UPLOAD_COMPLETED',uploaded,photoCode?{errorCode:photoCode}:{})
      if(photoCode)trace.mark(photoStage,uploaded,{errorCode:photoCode})
      if(uploaded)addTiming('photoComplete',Math.max(0,Date.now()-transfer.createdAt))
      await request({type:'TRANSFER_PROGRESS',id:transfer.id,stage:'uploading',uploaded,submitted:current.photos.submitted})
      pipelineLog(transfer.id,'uploading',upload.errors.length || prepared.errors.length?'partial':'completed')
    }
    // Only submit photos after the existing automatic form operations settle.
    // Missing/unresolved fields are results, not a requirement for a valid listing.
    try{await formPipeline()}catch(error){
      guard();results=verifyMyautoFields(doc,transfer.vehicle,current.fields)
      errors.push('ფორმის შევსება ვერ შესრულდა.')
      if(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message))errors.push(error.message)
    }
    const locationPlan=locationField(transfer.listingLocation??resolveListingLocation(transfer.vehicle))
    planned.push(locationPlan);current.formTotal=planned.length
    guard();current.currentField='მდებარეობა';update()
    results.push(await fillLocation(doc,locationPlan,controller.signal));current.fields=results
    current.textComplete=true;await phase('uploading')
    try{await photoPipeline()}catch(error){
      trace.mark(photoStage,photoCounts.verified,{errorCode:controller.signal.aborted?'INTERRUPTED':photoCode??'MESSAGE_FAILED'})
      guard();errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message)?error.message:'ფოტოების ატვირთვა ვერ შესრულდა.')
      pipelineLog(transfer.id,'uploading','failed')
    }
    await phase('verifying')
    guard()
    const beforeFinal=results
    results = await measure('finalValidation',()=>verifyMyautoPersistence(doc, transfer.vehicle, results,planned,controller.signal))
    const lost=results.filter(field=>field.status==='unfilled' && field.code==='verification' && (field.resetAfter || beforeFinal.some(previous=>previous.field===field.field && previous.status==='filled'))).map(field=>field.key!).filter(Boolean)
    if(lost.includes('make') && beforeFinal.some(field=>field.key==='model' && field.status==='filled') && !lost.includes('model'))lost.push('model')
    const recoverable=lost.filter(key=>key!=='location' && !userEdited.has(key) && !(key==='model' && userEdited.has('make')))
    if(recoverable.length){guard();results=await fillMyautoForm(doc,transfer.vehicle,{planned,onlyFields:recoverable,recoveringFields:recoverable,previousResults:results,signal:controller.signal,beforeField:guard,dropdownTimeoutMs:options.dropdownTimeoutMs,onField:label=>{current.currentField=label;update()},onResult:fields=>{current.fields=fields;update()}});results=await verifyMyautoPersistence(doc,transfer.vehicle,results,planned,controller.signal,recoverable)}
  } catch (error) {
    if(current.fields.length)results=verifyMyautoFields(doc,transfer.vehicle,current.fields)
    pipelineLog(transfer.id,current.stage === 'opening' || current.stage === 'reading' || current.stage === 'review' ? 'preparing' : current.stage,'failed')
    const stageError = current.stage === 'uploading' ? 'ფოტოების ატვირთვა ვერ შესრულდა.' : current.stage === 'filling' ? 'ფორმის შევსება ვერ შესრულდა.' : 'MyAuto-სთან დაკავშირება ვერ მოხერხდა.'
    errors.push(stageError)
    errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message) ? error.message : 'გადატანა ვერ დასრულდა. ველები და ფოტოები გადაამოწმეთ; წარმატება არ დადასტურებულა.')
  }
  photoReport(trace,photoCounts,photoCounts.verified>0 && photoCounts.verified===photoCounts.source?undefined:photoStage,photoCode)
  current.currentField=undefined;current.activity=undefined
  addTiming('total',performance.now()-transferStarted)
  try {
    current = await request<TransferRecord>({ type: 'TRANSFER_FINISH', id: transfer.id, fields: results, errors, uploaded, timings:current.timings })
  } catch {
    sessionLog(current,trace.vehicleId,'transfer-completed',current.status==='error'?'partial':'completed')
  pipelineLog(transfer.id,'finished','failed')
    current.fields=results;current.photos.uploaded=uploaded
    current.status = 'error'; current.errors = [...errors, 'საბოლოო შედეგის შენახვა ვერ მოხერხდა. მონაცემები და ფოტოები გადაამოწმეთ MyAuto-ზე.']
  }
  pipelineLog(transfer.id,'finished',current.status==='error'?'partial':'completed')
  update()
  return current
  } finally {
    controller.abort()
    for(const cleanup of cleanups.reverse())try{cleanup()}catch{pipelineLog(transfer.id,'cleanup','failed')}
    if(activeForms.get(doc)===owner)activeForms.delete(doc)
  }
}

// A field retry claims the existing destination job; it never opens a tab, downloads
// photos or invokes the uploader. Successful fields and photo verification are retained.
export async function retryMyautoFields(doc:Document,previous:TransferRecord,onUpdate:(record:TransferRecord)=>void,options:{pageUrl?:()=>string;dropdownTimeoutMs?:number}={}):Promise<TransferRecord> {
  if(activeForms.has(doc))throw new Error('ამ ფორმაში გადატანა უკვე მიმდინარეობს.')
  const controller=new AbortController(),owner={id:previous.id,controller}
  activeForms.set(doc,owner)
  try {
  let current=await request<TransferRecord>({type:'TRANSFER_RETRY_FIELDS',id:previous.id})
  const started=performance.now()
  const guard=()=>{
    controller.signal.throwIfAborted()
    if(activeForms.get(doc)!==owner){controller.abort();throw new Error('გადატანა ჩანაცვლებულია.')}
    const vin=doc.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value.trim()
    if(!/^\/ka\/add\/?$/.test(new URL(options.pageUrl?.() ?? doc.location.href).pathname) || (vin && vin!==current.vehicle.vin)){controller.abort();throw new Error('ავტომობილი ან გვერდი შეიცვალა. ხელახალი შევსება შეჩერებულია.')}
  }
  let results=current.fields
  const errors=[...current.errors]
  current.timings={...current.timings}
  try {
    guard();onUpdate(structuredClone(current))
    const planned=applyAutofillPolicy(structuredClone(current.preparedFields ?? myautoFields(current.vehicle)))
    const keys=current.fields.filter(field=>field.status==='unfilled' && field.retryable).map(field=>field.key ?? planned.find(item=>item.label===field.field)?.field).filter((key):key is string=>!!key)
    results=await fillMyautoForm(doc,current.vehicle,{planned,dropdownTimeoutMs:options.dropdownTimeoutMs,onlyFields:keys,previousResults:current.fields,signal:controller.signal,beforeField:guard,
      onFieldStage:activity=>{current.activity=activity;onUpdate(structuredClone(current))},
      onTiming:(stage,ms)=>{current.timings![stage]=(current.timings![stage] ?? 0)+ms;timingLog(current.id,stage,ms)},
      onResult:fields=>{current.fields=fields;onUpdate(structuredClone(current))}})
    guard()
    results=await verifyMyautoPersistence(doc,current.vehicle,results,planned,controller.signal)
  }catch(error){errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message)?error.message:'ველების ხელახალი შევსება ვერ შესრულდა.')}
  current.activity=undefined
  current.timings.total=(current.timings.total ?? 0)+performance.now()-started
  try{current=await request<TransferRecord>({type:'TRANSFER_FINISH',id:current.id,fields:results,errors,uploaded:current.photos.uploaded,timings:current.timings})}
  catch{current.status='error';current.fields=results;current.errors=[...errors,'ხელახალი შევსების შედეგის შენახვა ვერ მოხერხდა.']}
  onUpdate(structuredClone(current));return current
  } finally {controller.abort();if(activeForms.get(doc)===owner)activeForms.delete(doc)}
}
