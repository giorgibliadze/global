import type { TimingStage,NormalizedVehicle,TransferRecord } from '@auto-importer/shared'
// Intentionally accepts no payloads, URLs, exception text, VINs or session data.
export type PipelineStage = 'matching' | 'reading' | 'review' | 'detecting' | 'extracting' | 'validating' | 'storing' | 'opening' | 'claiming' | 'preparing' | 'filling' | 'uploading' | 'verifying' | 'finished' | 'cleanup' | 'messaging'
export function pipelineLog(transferId: unknown, stage: PipelineStage, event: 'started' | 'completed' | 'failed' | 'retry' | 'partial') {
  const id = typeof transferId === 'string' && /^[a-f0-9-]{36}$/.test(transferId) ? transferId : 'pending'
  const details = { transferId: id, stage, event }
  if (event === 'failed') console.warn('[Auto Importer]', details)
  else console.info('[Auto Importer]', details)
}

export function timingLog(transferId:string,stage:TimingStage,durationMs:number,context?:{platform:NormalizedVehicle['source'];vehicleId:string;status:'completed'|'failed'}) {
  if(!/^[a-f0-9-]{36}$/.test(transferId) || !Number.isFinite(durationMs) || durationMs<0)return
  console.info('[Auto Importer timing]',{transferId,stage,durationMs:Math.round(durationMs*100)/100,...(context?{platform:context.platform,vehicleId:/^[a-f0-9]{16}$/.test(context.vehicleId)?context.vehicleId:'pending',status:context.status}:{})})
}

// Explicit safe fields only: never include payloads, exception messages or URLs.
export function sessionLog(record:TransferRecord,vehicleId:string,stage:string,result:'started'|'completed'|'partial'|'failed',errorCategory?:string){
  if((import.meta as ImportMeta & {env?:{DEV:boolean}}).env?.DEV!==true)return
  if(!/^[a-f0-9-]{36}$/.test(record.id)||!/^[a-f0-9]{16}$/.test(vehicleId))return
  console.info('[Auto Importer session]',{transferId:record.id,sourcePlatform:record.vehicle.source,sourceTabId:record.sourceTabId,destinationTabId:record.destinationTabId??null,vehicleId,stage,timestamp:new Date().toISOString(),durationMs:Math.max(0,Date.now()-record.createdAt),result,errorCategory:errorCategory??null})
}
