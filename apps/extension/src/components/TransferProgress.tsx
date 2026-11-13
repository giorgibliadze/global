import { useEffect, useState } from 'react'
import { transferStageLabels } from '@auto-importer/shared'
import type { TransferRecord } from '@auto-importer/shared'
export function TransferProgress({ record }: { record: TransferRecord }) {
  const [now,setNow]=useState(Date.now)
  useEffect(()=>{if(record.status!=='running')return;const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[record.id,record.status])
  const completed=record.fields.filter(field=>field.status==='filled').length
  const failed=record.fields.filter(field=>field.status==='unfilled').length
  const unresolved=record.fields.filter(field=>field.status==='unfilled' && !field.retryable).length
  const elapsed=Math.max(0,((record.status==='running'?now:record.updatedAt)-record.createdAt)/1000)
  const activity=record.stage==='filling' && record.activity ? {discovery:'MyAuto-ს ველების შემოწმება',matching:'მონაცემების შესაბამისობის დადგენა',selection:'ფორმის შევსება'}[record.activity]:transferStageLabels[record.stage]
  return <section className="transfer-progress" aria-label="გადატანის მიმდინარეობა">
    <p role="status"><strong>{activity}</strong></p>
    <p>{record.vehicle.title}</p>
    <p>შევსებული ველები: {completed} · შეუვსებელი: {failed}</p>
    <p>ხელით გადასამოწმებელი შესაბამისობები: {unresolved}</p>
    <p>გასული დრო: {elapsed.toLocaleString('ka-GE',{maximumFractionDigits:1})} წმ</p>
    <p>ჩამოტვირთული ფოტოები: {record.photos.prepared} / {record.photos.total}</p>
    <p>დადასტურებული ატვირთვა: {record.photos.uploaded} / {record.photos.total}</p>
    {record.status === 'error' && <p className="missing">გადატანა სრულად ვერ დადასტურდა. გადაამოწმეთ დარჩენილი ველები და შეცდომები MyAuto-ს ჩანართში.</p>}
    {record.vehicle.warnings.map((warning,index)=><p className="missing" key={`warning-${index}`}>{warning}</p>)}
    {record.errors.map((error, index) => <p className="missing" key={index}>{error}</p>)}
    <p>განცხადება ავტომატურად არ გამოქვეყნდება.</p>
  </section>
}
