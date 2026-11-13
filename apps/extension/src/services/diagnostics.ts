import type { TimingStage } from '@auto-importer/shared'
// Intentionally accepts no payloads, URLs, exception text, VINs or session data.
export type PipelineStage = 'matching' | 'reading' | 'review' | 'detecting' | 'extracting' | 'validating' | 'storing' | 'opening' | 'claiming' | 'preparing' | 'filling' | 'uploading' | 'verifying' | 'finished' | 'cleanup' | 'messaging'
export function pipelineLog(transferId: unknown, stage: PipelineStage, event: 'started' | 'completed' | 'failed' | 'retry' | 'partial') {
  const id = typeof transferId === 'string' && /^[a-f0-9-]{36}$/.test(transferId) ? transferId : 'pending'
  const details = { transferId: id, stage, event }
  if (event === 'failed') console.warn('[Auto Importer]', details)
  else console.info('[Auto Importer]', details)
}

export function timingLog(transferId:string,stage:TimingStage,durationMs:number) {
  if(!/^[a-f0-9-]{36}$/.test(transferId) || !Number.isFinite(durationMs) || durationMs<0)return
  console.info('[Auto Importer timing]',{transferId,stage,durationMs:Math.round(durationMs*100)/100})
}
