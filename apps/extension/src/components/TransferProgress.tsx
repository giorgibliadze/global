import { useEffect, useState } from 'react'
import { transferStageLabels } from '@auto-importer/shared'
import type { TransferRecord } from '@auto-importer/shared'
export function TransferProgress({ record }: { record: TransferRecord }) {
  const [now,setNow]=useState(Date.now)
  useEffect(()=>{if(record.status!=='running')return;const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[record.id,record.status])
  const fields=record.fields.filter(field=>field.key!=='description' && field.field!=='აღწერა')
  const completed=fields.filter(field=>field.status==='filled' && field.persisted).length
  const failed=fields.filter(field=>field.status==='unfilled').length
  const unverified=fields.filter(field=>field.status==='unverified').length
  const unresolved=fields.filter(field=>field.status==='unfilled' && !field.retryable).length
  const elapsed=Math.max(0,((record.status==='running'?now:record.updatedAt)-record.createdAt)/1000)
  const activity=record.stage==='filling' && record.activity ? {discovery:'MyAuto-ს ველების შემოწმება',matching:'მონაცემების შესაბამისობის დადგენა',selection:'ფორმის შევსება'}[record.activity]:transferStageLabels[record.stage]
  return <section className="transfer-progress" aria-label="გადატანის მიმდინარეობა">
    <p role="status"><strong>{activity}</strong></p>
    <p>{record.vehicle.title}</p>
    {record.currentField && record.status==='running' && <p>შევსება მიმდინარეობს: {record.currentField}</p>}
    <p>ავტომატურად შევსებულია: {completed}/{fields.length || Math.max(0,(record.formTotal ?? 0))} · ხელით შესავსები: {failed}</p>
    {fields.some(field=>field.key==='price' && field.status==='filled' && field.persisted) && <p>ფასი — შეთანხმებით</p>}
    <p>აღწერა — გამოტოვებულია მოთხოვნის შესაბამისად</p>
    <p>შევსება ვერ გადამოწმდა: {unverified}</p>
    <p>ხელით გადასამოწმებელი შესაბამისობები: {unresolved}</p>
    <p>გასული დრო: {elapsed.toLocaleString('ka-GE',{maximumFractionDigits:1})} წმ</p>
    <p>ჩამოტვირთული ფოტოები: {record.photos.prepared} / {record.photos.total}</p>
    <p>ფოტოები: {record.photos.uploaded}/{record.photos.total}</p>
    {record.status === 'error' && <p className="missing">გადატანა სრულად ვერ დადასტურდა. გადაამოწმეთ დარჩენილი ველები და შეცდომები MyAuto-ს ჩანართში.</p>}
    {record.vehicle.warnings.map((warning,index)=><p className="missing" key={`warning-${index}`}>{warning}</p>)}
    {record.errors.map((error, index) => <p className="missing" key={index}>{error}</p>)}
    <p>განცხადება ავტომატურად არ გამოქვეყნდება.</p>
  </section>
}
