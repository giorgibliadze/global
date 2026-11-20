import type {TransferRecord,FieldResult} from '@auto-importer/shared'
import {assertNormalizedVehicle} from '@auto-importer/parsers/validation'
import {TRANSFER_PROTOCOL,TRANSFER_TTL_MS,READY_WINDOW_MS,transferId} from '../services/transferActivation'
export const stateSchemaKey='auto-importer:transfer-schema:v1'
export function validStoredTransfer(value:unknown,key:string,now=Date.now()):value is TransferRecord{
  if(!value||typeof value!=='object')return false
  const r=value as TransferRecord
  if(!transferId(r.id)||key!==`job:${r.id}`||!Number.isInteger(r.sourceTabId)||r.sourceTabId<0||!Number.isFinite(r.createdAt)||r.createdAt>now||transferExpired(r,now)||!Number.isFinite(r.updatedAt))return false
  if(r.destinationTabId!==undefined&&(!Number.isInteger(r.destinationTabId)||r.destinationTabId<0))return false
  if(typeof r.claimed!=='boolean'||r.claimed&&(!Number.isInteger(r.destinationTabId)||typeof r.documentId!=='string'||!r.documentId||r.documentId.length>200))return false
  if(!['running','error','review'].includes(r.status)||!['reading','preparing','opening','matching','filling','uploading','verifying','review'].includes(r.stage)||!Array.isArray(r.fields)||r.fields.length>80||!r.fields.every(isFieldResult)||!Array.isArray(r.errors)||r.errors.length>20||!r.errors.every(v=>typeof v==='string'&&v.length<=500))return false
  if(!r.photos||!['total','prepared','uploaded','failed'].every(key=>{const n=r.photos[key as keyof typeof r.photos];return typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=(r.vehicle?.source==='EdgePipeline'?1000:15)})||r.photos.prepared>r.photos.total||r.photos.uploaded>r.photos.prepared)return false
  if(r.activation && (r.activation.schema!==TRANSFER_PROTOCOL||!['IDLE','PREPARING','READY','TRANSFERRING','COMPLETED','FAILED'].includes(r.activation.state)))return false
  if(r.edgePreparedIndices!==undefined&&(r.vehicle?.source!=='EdgePipeline'||!Array.isArray(r.edgePreparedIndices)||r.edgePreparedIndices.length>1000||r.edgePreparedIndices.length!==r.photos.prepared||new Set(r.edgePreparedIndices).size!==r.edgePreparedIndices.length||r.edgePreparedIndices.some(index=>!Number.isInteger(index)||index<0||index>=r.photos.total)))return false
  if(r.activation){
    const state=r.activation.state
    if(r.status==='running'&&!['PREPARING','READY','TRANSFERRING'].includes(state)||r.status!=='running'&&!['COMPLETED','FAILED'].includes(state))return false
    if(state==='READY'&&(r.claimed||r.destinationTabId===undefined)||state==='TRANSFERRING'&&!r.claimed||state==='PREPARING'&&r.claimed)return false
  }
  try{assertNormalizedVehicle(r.vehicle)}catch{return false}
  return true
}
export function readyToClaim(record:TransferRecord){
  return record.activation?.schema===TRANSFER_PROTOCOL&&record.activation.state==='READY'&&record.status==='running'&&!record.claimed&&Number.isInteger(record.destinationTabId)&&Date.now()-record.createdAt<READY_WINDOW_MS
}

export function isFieldResult(value: unknown): value is FieldResult {
  if (!value || typeof value !== 'object') return false
  const f = value as FieldResult
  return (f.sourceValue===undefined || (typeof f.sourceValue==='string' && f.sourceValue.length<=500)) && (f.evidence===undefined || ['react-value','myauto-option','myauto-choice','negotiable'].includes(f.evidence)) && (f.resetAfter===undefined || (typeof f.resetAfter==='string' && /^[a-zA-Z]{1,30}$/.test(f.resetAfter))) && (f.reviewRequired===undefined || typeof f.reviewRequired==='boolean') && (f.omissions===undefined || (Array.isArray(f.omissions) && f.omissions.length<=10 && f.omissions.every(item=>typeof item==='string' && item.length<=500))) && (f.persisted===undefined || typeof f.persisted==='boolean') && (f.retryable===undefined || typeof f.retryable==='boolean') && (f.key===undefined || (typeof f.key==='string' && /^[a-zA-Z]{1,30}$/.test(f.key))) && (f.code===undefined || ['missing','unavailable','dependency','unresolved','verification','protected','privacy','manual','unverified'].includes(f.code)) && (f.optionId === undefined || (typeof f.optionId === 'string' && f.optionId.length<=200)) && (f.optionLabel === undefined || (typeof f.optionLabel === 'string' && f.optionLabel.length<=500)) && (f.match === undefined || ['exact','equivalent','custom'].includes(f.match)) && typeof f.field === 'string' && f.field.length <= 120 && ['filled','unfilled','unverified'].includes(f.status) && typeof f.reason === 'string' && f.reason.length <= 500
}


export function transferExpired(record:Pick<TransferRecord,'createdAt'|'updatedAt'|'status'|'claimed'>,now=Date.now()){const last=record.status==='running'&&record.claimed?Math.max(record.createdAt,record.updatedAt):record.createdAt;return !Number.isFinite(last)||now-last>=TRANSFER_TTL_MS}
