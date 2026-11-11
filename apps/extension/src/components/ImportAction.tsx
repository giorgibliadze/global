import { useState } from 'react'

export function ImportAction({ enabled, guidance }: { enabled: boolean; guidance?: string }) {
  const [message, setMessage] = useState('')
  return (
    <div className="import-action">
      <button className="import-button" type="button" disabled={!enabled}
        onClick={() => setMessage('ავტომობილის მონაცემების გადატანის ფუნქცია მალე დაემატება.')}>
        MyAuto-ზე გადატანა <span aria-hidden="true">↗</span>
      </button>
      {guidance && <p className="guidance">{guidance}</p>}
      {message && <p className="notice" role="status">{message}</p>}
    </div>
  )
}
