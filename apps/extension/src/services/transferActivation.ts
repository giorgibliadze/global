import type {TransferRecord} from '@auto-importer/shared'
export const TRANSFER_PROTOCOL=1
export const READY_WINDOW_MS=120000
export const TRANSFER_TTL_MS=30*60*1000
export const transferId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)
export const isMyautoAddUrl=(url:string)=>{
  try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='myauto.ge'||u.hostname.endsWith('.myauto.ge'))&&/^\/ka\/add\/?$/.test(u.pathname)}catch{return false}
}
export function liveClaim(record:unknown,now=Date.now()):record is TransferRecord{
  if(!record||typeof record!=='object')return false
  const r=record as TransferRecord
  return transferId(r.id)&&r.activation?.schema===TRANSFER_PROTOCOL&&r.activation.state==='TRANSFERRING'&&r.status==='running'&&r.claimed===true&&Number.isInteger(r.destinationTabId)&&typeof r.documentId==='string'&&!!r.documentId&&Number.isFinite(r.createdAt)&&r.createdAt<=now&&now-r.createdAt<TRANSFER_TTL_MS
}
