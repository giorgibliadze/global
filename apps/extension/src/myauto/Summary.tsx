import { useState } from 'react'
import type { TransferRecord } from '@auto-importer/shared'
import { TransferProgress } from '../components/TransferProgress'
export function Summary({ record }: { record: TransferRecord }) {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return <aside lang="ka" className="summary" aria-label="გადატანის შედეგები">
    <button type="button" className="close" aria-label="შედეგების დახურვა" onClick={() => setOpen(false)}>×</button>
    <h2>Auto Importer</h2>
    <TransferProgress record={record} />
    <ul>{record.fields.map((result, index) => <li key={index}><strong>{result.status === 'filled' ? '✓' : '⚠'} {result.field}</strong><p>{result.reason}</p></li>)}</ul>
  </aside>
}
