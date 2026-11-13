import { waitForDomReady } from '../services/domReady'
import { pipelineLog, timingLog } from '../services/diagnostics'
import { isMyautoControllerForm,textInteractive,fillMyautoForm, verifyMyautoFields, verifyMyautoPersistence, applyAutofillPolicy, myautoFields } from '@auto-importer/parsers/myauto'
import type { FieldResult, TransferRecord, TransferStage, TimingStage } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
import { prepareFiles } from '../photos/client'
import { assertFreshMyauto, uploadPhotos } from '../photos/upload'

export async function claimMyautoTransfer(attempts = 20, intervalMs = 500): Promise<TransferRecord | null> {
  let failed = false
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const job = await request<TransferRecord | null>({ type: 'TRANSFER_CLAIM' })
      failed = false
      if (job) { pipelineLog(job.id,'claiming','completed'); return job }
    } catch { failed = true; pipelineLog(undefined,'claiming','retry') }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs,25*2**Math.min(attempt,5))))
  }
  if (failed) { pipelineLog(undefined,'claiming','failed'); throw new Error('MyAuto-სთან დაკავშირება ვერ მოხერხდა. გადატვირთეთ გაფართოება და გვერდი; შემდეგ დაიწყეთ ახალი გადატანა.') }
  return null // An ordinary visit has no approved transfer and must remain untouched.
}

const activeForms=new WeakMap<Document,{id:string;controller:AbortController}>()

// The content-script entry and the browser regression harness run this same receiver.
export async function runMyautoTransfer(doc: Document, transfer: TransferRecord, onUpdate: (record: TransferRecord) => void, options: { pageUrl?: () => string; dropdownTimeoutMs?: number; uploadTimeoutMs?: number } = {}): Promise<TransferRecord> {
  if(activeForms.has(doc))throw new Error('ამ ფორმაში გადატანა უკვე მიმდინარეობს.')
  const controller = new AbortController()
  const owner={id:transfer.id,controller};activeForms.set(doc,owner)
  const transferStarted=performance.now()
  const pageUrl = options.pageUrl ?? (() => doc.location.href)
  let current = structuredClone(transfer)
  current.timings={...current.timings}
  const addTiming=(stage:TimingStage,ms:number)=>{current.timings![stage]=(current.timings![stage] ?? 0)+ms;timingLog(transfer.id,stage,ms)}
  async function measure<T>(stage:TimingStage,fn:()=>Promise<T>):Promise<T>{const started=performance.now();try{return await fn()}finally{addTiming(stage,performance.now()-started)}}
  const update = () => onUpdate(structuredClone(current))
  async function phase(stage: TransferStage) {
    current.currentField=undefined;current.stage = stage; update()
    pipelineLog(transfer.id,stage,'started')
    await request({ type: 'TRANSFER_PROGRESS', id: transfer.id, stage,fields:current.fields,currentField:'' })
  }
  const guard = () => {
    controller.signal.throwIfAborted()
    if(activeForms.get(doc)!==owner){controller.abort();throw new Error('გადატანა ჩანაცვლებულია.')}
    if (!/^\/ka\/add\/?$/.test(new URL(pageUrl()).pathname)) { controller.abort(); throw new Error('გვერდის მისამართი შეიცვალა. გადატანა შეჩერებულია.') }
    const vin = doc.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value.trim()
    if (vin && vin !== transfer.vehicle.vin) { controller.abort(); throw new Error('ფორმაში სხვა ავტომობილის VIN გამოჩნდა. ფოტოები არ შეირევა.') }
  }
  const navigation=()=>{try{guard()}catch{controller.abort()}}
  const pagehide=()=>controller.abort()
  doc.defaultView?.addEventListener('popstate',navigation);doc.defaultView?.addEventListener('hashchange',navigation);doc.defaultView?.addEventListener('pagehide',pagehide)
  let lastUrl=pageUrl()
  const routeObserver=new doc.defaultView!.MutationObserver(()=>{const url=pageUrl();if(url!==lastUrl){lastUrl=url;navigation()}})
  routeObserver.observe(doc.documentElement,{subtree:true,childList:true})
  let planned:ReturnType<typeof myautoFields>=[]
  const userEdited=new Set<string>()
  const noteUser=(event:Event)=>{
    if(!event.isTrusted || !(event.target instanceof doc.defaultView!.Element))return
    for(const field of planned){
      const owner=field.dropdownKey?doc.querySelector(`[data-testid="single-select-primaryFeatures.${field.dropdownKey}"]`) ?? doc.querySelector(`select[name="primaryFeatures.${field.dropdownKey}"]`) ?? doc.querySelector(`input[name="primaryFeatures.${field.dropdownKey}"]`):field.selector?doc.querySelector(field.selector):null
      if(owner?.contains(event.target) && (event.type!=='pointerdown' || field.mode!=='text'))userEdited.add(field.field)
    }
  }
  const editEvents=['pointerdown','keydown','input','change']
  for(const event of editEvents)doc.addEventListener(event,noteUser,true)
  let results: FieldResult[] = [], uploaded = 0
  const errors: string[] = []
  update()
  try {
    // Authentication/delayed SPA rendering are handled without private API calls.
    const formReady=()=>!!doc.querySelector('input[name="primaryFeatures.vinCode"],input[name="primaryFeatures.model"],select[name="primaryFeatures.model"],[data-testid="single-select-primaryFeatures.model"],[data-testid="description-textarea"]')
    await waitForDomReady(doc,()=>{guard();return formReady() && (!isMyautoControllerForm(doc) || textInteractive(doc))},controller.signal,25000)
    const formReadyAt=performance.now()
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
          if(!firstField && fields.some(field=>field.status==='filled' && field.persisted)){firstField=true;addTiming('firstField',performance.now()-transferStarted);addTiming('firstFieldAfterReady',performance.now()-formReadyAt)}
          update()
          await request({type:'TRANSFER_PROGRESS',id:transfer.id,stage:'filling',fields,formTotal:planned.length,currentField:current.currentField ?? ''})
        },
      }))
      guard();current.currentField=undefined;current.activity=undefined;update()
      pipelineLog(transfer.id,'filling',results.some(result=>result.status!=='filled')?'partial':'completed')
    }
    const photoPipeline=async()=>{
      pipelineLog(transfer.id,'uploading','started')
      const prepared=await measure('photoDownload',()=>prepareFiles(transfer.id,transfer.photos.total,(ready,failed)=>{
        guard();current.photos.prepared=ready;current.photos.failed=failed;update()
      },controller.signal))
      errors.push(...prepared.errors)
      // Only one batch is supported by the confirmed uploader. Do not append a
      // second FileList to a nonempty gallery or compete with another upload.
      await waitForDomReady(doc,()=>{guard();return !!doc.querySelector('[data-testid="photo-video-dropzone"] input[type="file"]:not(:disabled)')},controller.signal,options.uploadTimeoutMs ?? 25000)
      const upload=await measure('photoUpload',()=>uploadPhotos(doc,prepared.files,count=>{guard();current.photos.uploaded=count;update()},{timeoutMs:options.uploadTimeoutMs,signal:controller.signal,guard}))
      uploaded=upload.verified;errors.push(...upload.errors)
      if(uploaded)addTiming('photoComplete',Math.max(0,Date.now()-transfer.createdAt))
      await request({type:'TRANSFER_PROGRESS',id:transfer.id,stage:'filling',uploaded})
      pipelineLog(transfer.id,'uploading',upload.errors.length || prepared.errors.length?'partial':'completed')
    }
    // allSettled keeps a noncritical photo or field failure from cancelling the
    // other pipeline; identity/navigation failures abort their shared signal.
    const pipelines=await Promise.allSettled([formPipeline(),photoPipeline()])
    for(const [index,outcome] of pipelines.entries())if(outcome.status==='rejected'){
      errors.push(index===0?'ფორმის შევსება ვერ შესრულდა.':'ფოტოების ატვირთვა ვერ შესრულდა.')
      if(outcome.reason instanceof Error && /[\u10A0-\u10FF]/.test(outcome.reason.message))errors.push(outcome.reason.message)
      pipelineLog(transfer.id,index===0?'filling':'uploading','failed')
    }
    if(pipelines[0].status==='rejected')results=verifyMyautoFields(doc,transfer.vehicle,current.fields)
    await phase('verifying')
    guard()
    const beforeFinal=results
    results = await measure('finalValidation',()=>verifyMyautoPersistence(doc, transfer.vehicle, results,planned,controller.signal))
    const lost=results.filter(field=>field.status==='unfilled' && field.code==='verification' && (field.resetAfter || beforeFinal.some(previous=>previous.field===field.field && previous.status==='filled'))).map(field=>field.key!).filter(Boolean)
    if(lost.includes('make') && beforeFinal.some(field=>field.key==='model' && field.status==='filled') && !lost.includes('model'))lost.push('model')
    const recoverable=lost.filter(key=>!userEdited.has(key) && !(key==='model' && userEdited.has('make')))
    if(recoverable.length){guard();results=await fillMyautoForm(doc,transfer.vehicle,{planned,onlyFields:recoverable,recoveringFields:recoverable,previousResults:results,signal:controller.signal,beforeField:guard,dropdownTimeoutMs:options.dropdownTimeoutMs,onField:label=>{current.currentField=label;update()},onResult:fields=>{current.fields=fields;update()}});results=await verifyMyautoPersistence(doc,transfer.vehicle,results,planned,controller.signal,recoverable)}
  } catch (error) {
    if(current.fields.length)results=verifyMyautoFields(doc,transfer.vehicle,current.fields)
    pipelineLog(transfer.id,current.stage === 'opening' || current.stage === 'reading' || current.stage === 'review' ? 'preparing' : current.stage,'failed')
    const stageError = current.stage === 'uploading' ? 'ფოტოების ატვირთვა ვერ შესრულდა.' : current.stage === 'filling' ? 'ფორმის შევსება ვერ შესრულდა.' : 'MyAuto-სთან დაკავშირება ვერ მოხერხდა.'
    errors.push(stageError)
    errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message) ? error.message : 'გადატანა ვერ დასრულდა. ველები და ფოტოები გადაამოწმეთ; წარმატება არ დადასტურებულა.')
  }
  routeObserver.disconnect();doc.defaultView?.removeEventListener('popstate',navigation);doc.defaultView?.removeEventListener('hashchange',navigation);doc.defaultView?.removeEventListener('pagehide',pagehide)
  for(const event of editEvents)doc.removeEventListener(event,noteUser,true)
  current.currentField=undefined;current.activity=undefined
  addTiming('total',performance.now()-transferStarted)
  try {
    current = await request<TransferRecord>({ type: 'TRANSFER_FINISH', id: transfer.id, fields: results, errors, uploaded, timings:current.timings })
  } catch {
    pipelineLog(transfer.id,'finished','failed')
    current.fields=results;current.photos.uploaded=uploaded
    current.status = 'error'; current.errors = [...errors, 'საბოლოო შედეგის შენახვა ვერ მოხერხდა. მონაცემები და ფოტოები გადაამოწმეთ MyAuto-ზე.']
  }
  pipelineLog(transfer.id,'finished',current.status==='error'?'partial':'completed')
  if(activeForms.get(doc)===owner)activeForms.delete(doc)
  update()
  return current
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
