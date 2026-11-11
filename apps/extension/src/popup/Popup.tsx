import { useEffect, useState } from 'react'
import { getCurrentWebsite } from '../services/browser'
import { PopupContent } from './PopupContent'
import type { Detection } from './PopupContent'

export function Popup() {
  const [detection, setDetection] = useState<Detection>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    getCurrentWebsite().then(
      (website) => { if (!cancelled) setDetection({ status: 'ready', website }) },
      () => { if (!cancelled) setDetection({ status: 'error' }) },
    )
    return () => { cancelled = true }
  }, [])
  return <PopupContent detection={detection} />
}
