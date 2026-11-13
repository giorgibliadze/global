import { pipelineLog, timingLog } from '../services/diagnostics'
import { fillMyautoForm, verifyMyautoFields, enforceDescriptionPrivacy, myautoFields, settleField } from '@auto-importer/parsers/myauto'
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

// The content-script entry and the browser regression harness run this same receiver.
export async function runMyautoTransfer(doc: Document, transfer: TransferRecord, onUpdate: (record: TransferRecord) => void, options: { pageUrl?: () => string; dropdownTimeoutMs?: number; uploadTimeoutMs?: number } = {}): Promise<TransferRecord> {
  const transferStarted=performance.now()
  const pageUrl = options.pageUrl ?? (() => doc.location.href)
  let current = structuredClone(transfer)
  current.timings={...current.timings}
  const addTiming=(stage:TimingStage,ms:number)=>{current.timings![stage]=(current.timings![stage] ?? 0)+ms;timingLog(transfer.id,stage,ms)}
  async function measure<T>(stage:TimingStage,fn:()=>Promise<T>):Promise<T>{const started=performance.now();try{return await fn()}finally{addTiming(stage,performance.now()-started)}}
  const update = () => onUpdate(structuredClone(current))
  async function phase(stage: TransferStage) {
    current.stage = stage; update()
    pipelineLog(transfer.id,stage,'started')
    await request({ type: 'TRANSFER_PROGRESS', id: transfer.id, stage })
  }
  const controller = new AbortController()
  const guard = () => {
    if (!/^\/ka\/add\/?$/.test(new URL(pageUrl()).pathname)) { controller.abort(); throw new Error('გვერდის მისამართი შეიცვალა. გადატანა შეჩერებულია.') }
    const vin = doc.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value.trim()
    if (vin && vin !== transfer.vehicle.vin) { controller.abort(); throw new Error('ფორმაში სხვა ავტომობილის VIN გამოჩნდა. ფოტოები არ შეირევა.') }
  }
  let results: FieldResult[] = [], uploaded = 0
  const errors: string[] = []
  update()
  try {
    // Authentication/delayed SPA rendering are handled without private API calls.
    const formReady=()=>!!doc.querySelector('input[name="primaryFeatures.vinCode"],input[name="primaryFeatures.model"],select[name="primaryFeatures.model"],[data-testid="single-select-primaryFeatures.model"],[data-testid="description-textarea"]')
    if (!await settleField(doc,()=>{guard();return formReady()},controller.signal,25000)) throw new Error('MyAuto-ს ფორმა ვერ მოიძებნა. შეამოწმეთ ავტორიზაცია და გვერდის ჩატვირთვა.')
    assertFreshMyauto(doc)
    await phase('preparing')
    await phase('matching')
    const planned=await measure('normalization',async()=>myautoFields(transfer.vehicle))
    await phase('filling')
    results = await measure('formFilling',()=>fillMyautoForm(doc, transfer.vehicle, {
      planned,onTiming:addTiming,onFieldStage:activity=>{current.activity=activity;update()},
      allowAutofillCorrection: true, dropdownTimeoutMs: options.dropdownTimeoutMs, signal: controller.signal, beforeField: guard,
      onResult: fields => { current.fields = fields; update() },
    }))
    guard()
    pipelineLog(transfer.id,'filling',results.some(result=>result.status==='unfilled')?'partial':'completed')
    await phase('uploading')
    const prepared = await measure('photoDownload',()=>prepareFiles(transfer.id, transfer.photos.total, (ready, failed) => {
      current.photos.prepared = ready; current.photos.failed = failed; update()
    }, controller.signal))
    errors.push(...prepared.errors)
    const upload = await measure('photoUpload',()=>uploadPhotos(doc, prepared.files, count => { current.photos.uploaded = count; update() }, { timeoutMs: options.uploadTimeoutMs, signal: controller.signal, guard }))
    uploaded = upload.verified; errors.push(...upload.errors)
    pipelineLog(transfer.id,'uploading',upload.errors.length || prepared.errors.length ? 'partial':'completed')
    await phase('verifying')
    guard()
    if (!(await enforceDescriptionPrivacy(doc,transfer.vehicle.vin))) throw new Error('აღწერაში საიდენტიფიკაციო მონაცემი ხელახლა გამოჩნდა. შეამოწმეთ ფორმა გამოქვეყნებამდე.')
    results = await measure('finalValidation',async()=>verifyMyautoFields(doc, transfer.vehicle, results,planned))
  } catch (error) {
    pipelineLog(transfer.id,current.stage === 'opening' || current.stage === 'reading' || current.stage === 'review' ? 'preparing' : current.stage,'failed')
    const stageError = current.stage === 'uploading' ? 'ფოტოების ატვირთვა ვერ შესრულდა.' : current.stage === 'filling' ? 'ფორმის შევსება ვერ შესრულდა.' : 'MyAuto-სთან დაკავშირება ვერ მოხერხდა.'
    errors.push(stageError)
    errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message) ? error.message : 'გადატანა ვერ დასრულდა. ველები და ფოტოები გადაამოწმეთ; წარმატება არ დადასტურებულა.')
  }
  current.activity=undefined
  addTiming('total',performance.now()-transferStarted)
  try {
    current = await request<TransferRecord>({ type: 'TRANSFER_FINISH', id: transfer.id, fields: results, errors, uploaded, timings:current.timings })
  } catch {
    pipelineLog(transfer.id,'finished','failed')
    current.fields=results;current.photos.uploaded=uploaded
    current.status = 'error'; current.errors = [...errors, 'საბოლოო შედეგის შენახვა ვერ მოხერხდა. მონაცემები და ფოტოები გადაამოწმეთ MyAuto-ზე.']
  }
  pipelineLog(transfer.id,'finished',current.status==='error'?'partial':'completed')
  update()
  return current
}

// A field retry claims the existing destination job; it never opens a tab, downloads
// photos or invokes the uploader. Successful fields and photo verification are retained.
export async function retryMyautoFields(doc:Document,previous:TransferRecord,onUpdate:(record:TransferRecord)=>void,options:{pageUrl?:()=>string;dropdownTimeoutMs?:number}={}):Promise<TransferRecord> {
  let current=await request<TransferRecord>({type:'TRANSFER_RETRY_FIELDS',id:previous.id})
  const started=performance.now(),controller=new AbortController()
  const guard=()=>{
    const vin=doc.querySelector<HTMLInputElement>('input[name="primaryFeatures.vinCode"]')?.value.trim()
    if(!/^\/ka\/add\/?$/.test(new URL(options.pageUrl?.() ?? doc.location.href).pathname) || (vin && vin!==current.vehicle.vin)){controller.abort();throw new Error('ავტომობილი ან გვერდი შეიცვალა. ხელახალი შევსება შეჩერებულია.')}
  }
  let results=current.fields
  const errors=[...current.errors]
  current.timings={...current.timings}
  try {
    guard();onUpdate(structuredClone(current))
    const planned=myautoFields(current.vehicle)
    const keys=current.fields.filter(field=>field.status==='unfilled' && field.retryable).map(field=>field.key ?? planned.find(item=>item.label===field.field)?.field).filter((key):key is string=>!!key)
    results=await fillMyautoForm(doc,current.vehicle,{planned,dropdownTimeoutMs:options.dropdownTimeoutMs,onlyFields:keys,previousResults:current.fields,signal:controller.signal,beforeField:guard,
      onFieldStage:activity=>{current.activity=activity;onUpdate(structuredClone(current))},
      onTiming:(stage,ms)=>{current.timings![stage]=(current.timings![stage] ?? 0)+ms;timingLog(current.id,stage,ms)},
      onResult:fields=>{current.fields=fields;onUpdate(structuredClone(current))}})
    guard()
    if(!await enforceDescriptionPrivacy(doc,current.vehicle.vin))throw new Error('აღწერიდან საიდენტიფიკაციო მონაცემი ვერ მოიშორა.')
    results=verifyMyautoFields(doc,current.vehicle,results,planned)
  }catch(error){errors.push(error instanceof Error && /[\u10A0-\u10FF]/.test(error.message)?error.message:'ველების ხელახალი შევსება ვერ შესრულდა.')}
  current.activity=undefined
  current.timings.total=(current.timings.total ?? 0)+performance.now()-started
  try{current=await request<TransferRecord>({type:'TRANSFER_FINISH',id:current.id,fields:results,errors,uploaded:current.photos.uploaded,timings:current.timings})}
  catch{current.status='error';current.fields=results;current.errors=[...errors,'ხელახალი შევსების შედეგის შენახვა ვერ მოხერხდა.']}
  onUpdate(structuredClone(current));return current
}
