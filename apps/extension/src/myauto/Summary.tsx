import { useState } from 'react'
import type { TransferRecord } from '@auto-importer/shared'
import { TransferProgress } from '../components/TransferProgress'
export function Summary({ record,onRetry }: { record: TransferRecord;onRetry?:(record:TransferRecord)=>Promise<unknown> }) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const retry=async()=>{if(!onRetry || busy)return;setBusy(true);setError('');try{await onRetry(record)}catch{setError('ველების ხელახალი შევსება ვერ დაიწყო. გადატვირთეთ გაფართოება და გადაამოწმეთ გვერდი.')}finally{setBusy(false)}}
  const [open, setOpen] = useState(true)
  if (!open) return null
  return <aside lang="ka" className="summary" aria-label="გადატანის შედეგები">
    <button type="button" className="close" aria-label="შედეგების დახურვა" onClick={() => setOpen(false)}>×</button>
    <h2>Auto Importer</h2>
    <TransferProgress record={record} />
    {onRetry && record.status!=='running' && record.fields.some(field=>field.status==='unfilled' && field.retryable) && <button className="import-button" type="button" disabled={busy} onClick={()=>void retry()}>{busy?'მიმდინარეობს ხელახალი შევსება…':'შეუვსებელი ველების ხელახლა ცდა'}</button>}
    {error && <p role="alert">{error}</p>}
    <ul>{record.fields.filter(result=>result.key!=='description' && result.field!=='აღწერა').map((result, index) => <li key={result.key ?? index}>
      <strong>{result.status==='filled' && result.persisted?'✓':'⚠'} {result.field}</strong>
      <p>{result.key==='price' && result.status==='filled' && result.persisted?'ფასი — შეთანხმებით':result.status==='filled' && result.persisted?'შევსებულია':result.code==='verification'?'ვერ შენარჩუნდა':'ხელით შესავსები'}</p>
      {result.sourceValue && result.status!=='filled' && <p>წყაროს მნიშვნელობა: {result.sourceValue}</p>}
    </li>)}</ul>
  </aside>
}
