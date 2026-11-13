import { useEffect, useRef, useState } from 'react'
import type { TransferRecord } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
import { TransferProgress } from './TransferProgress'

export function ImportAction({ enabled, guidance, manheim24 = false }: { enabled: boolean; guidance?: string; manheim24?: boolean }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const starting=useRef(false)
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
    if(starting.current || record?.status==='running')return
    starting.current=true;setBusy(true);setMessage('მონაცემების გადატანა დაიწყო');setRecord(null)
    try {setRecord(await request<TransferRecord>({type:'TRANSFER_BEGIN'}))}
    catch(error){setMessage(error instanceof Error?error.message:'გადატანა ვერ დაიწყო.')}
    finally{starting.current=false;setBusy(false)}
  }
  return <div className="import-action">
    <button className="import-button" type="button" disabled={!enabled || busy || record?.status==='running'} onClick={() => void start()}>
      {busy ? 'შევსება მიმდინარეობს' : 'MyAuto-ზე გადატანა'} <span aria-hidden="true">↗</span>
    </button>
    {guidance && <p className="guidance">{guidance}</p>}
    {record && <TransferProgress record={record} />}
    {message && <p className="notice" role="status">{message}</p>}
  </div>
}
