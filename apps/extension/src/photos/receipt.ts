import type {TransferRecord} from '@auto-importer/shared'
import type {UploadResult} from './upload'
export function photoReceipt(record:TransferRecord,files:File[],upload:UploadResult):NonNullable<TransferRecord['photoReceipt']>{
  const index=(name:string)=>{const match=name.match(new RegExp(`^vehicle-${record.id.slice(0,8)}-(\\d+)\\.(?:jpg|png|webp)$`));return match?Number(match[1])-1:-1}
  const confirmed=new Map((record.photoReceipt?.confirmed??[]).map(item=>[item.index,item]))
  const names=upload.confirmedNames??(upload.verified===files.length?files.map(file=>file.name):[])
  for(const name of names){const i=index(name);if(i>=0&&i<record.photos.total)confirmed.set(i,{index:i,slot:upload.slots?.[name]})}
  const retryable=new Set((record.photos.failures??[]).filter(item=>item.retryable).map(item=>item.index))
  for(const name of upload.retryNames??[]){const i=index(name);if(i>=0&&i<record.photos.total)retryable.add(i)}
  const permanent=new Set((record.photos.failures??[]).filter(item=>!item.retryable).map(item=>item.index))
  const uncertain=[]
  for(let i=0;i<record.photos.total;i++)if(confirmed.has(i))retryable.delete(i);else if(!retryable.has(i)&&!permanent.has(i))uncertain.push(i)
  return {confirmed:[...confirmed.values()].sort((a,b)=>a.index-b.index),retryable:[...retryable],uncertain}
}
export function canRetryPhotos(record:TransferRecord){
  return !!record.photos.issue && (!record.photos.total || !!record.photoReceipt?.retryable.length && !record.photoReceipt.uncertain.length && record.photoReceipt.confirmed.every(item=>!!item.slot))
}
