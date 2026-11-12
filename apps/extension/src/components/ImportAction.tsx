import { useEffect, useState } from 'react'
import type { NormalizedVehicle, TransferRecord } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
import { VehicleReview } from './VehicleReview'
import { TransferProgress } from './TransferProgress'

export function ImportAction({ enabled, guidance, manheim24 = false }: { enabled: boolean; guidance?: string; manheim24?: boolean }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [review,setReview] = useState<{vehicle:NormalizedVehicle;reviewId:string} | null>(null)
  const [record, setRecord] = useState<TransferRecord | null>(null)
  useEffect(() => {
    if (!record?.id || record.status !== 'running') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const id = record.id
    async function poll() {
      try {
        const next = await request<TransferRecord>({ type: 'TRANSFER_STATUS', id })
        if (cancelled) return
        setRecord(next)
        if (next.status === 'running') timer = setTimeout(() => void poll(), 800)
      } catch { if (!cancelled) setMessage('გადატანის სტატუსი მიუწვდომელია. შეამოწმეთ MyAuto-ს ჩანართი.') }
    }
    timer = setTimeout(() => void poll(), 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [record?.id, record?.status])
  async function start() {
    if (!manheim24) { setMessage('ავტომობილის მონაცემების გადატანის ფუნქცია ამ პლატფორმისთვის მალე დაემატება.'); return }
    setBusy(true); setMessage(''); setReview(null); setRecord(null)
    try { setReview(await request({type:'TRANSFER_REVIEW'})) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'ავტომობილის ამოცნობა ვერ მოხერხდა.') }
    finally { setBusy(false) }
  }
  async function confirm() {
    if (!review) return
    setBusy(true); setMessage('')
    try { setRecord(await request<TransferRecord>({type:'TRANSFER_START',reviewId:review.reviewId})); setReview(null) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'გადატანა ვერ შესრულდა.'); setReview(null) }
    finally { setBusy(false) }
  }
  return <div className="import-action">
    <button className="import-button" type="button" disabled={!enabled || busy} onClick={() => void start()}>
      {busy ? 'ავტომობილის მონაცემების წაკითხვა' : 'MyAuto-ზე გადატანა'} <span aria-hidden="true">↗</span>
    </button>
    {guidance && <p className="guidance">{guidance}</p>}
    {review && <VehicleReview vehicle={review.vehicle} busy={busy} confirm={() => void confirm()} cancel={() => setReview(null)} />}
    {record && <TransferProgress record={record} />}
    {message && <p className="notice" role="status">{message}</p>}
  </div>
}
