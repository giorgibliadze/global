import { subscribePreparation } from './manheim'
import type { PreparationStatus } from '@auto-importer/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExtensionIcon } from '../components/ExtensionIcon'
import { PopupContent } from '../popup/PopupContent'
import type { Website } from '../services/website'

export function FloatingLauncher({ website }: { website: Website }) {
  const [preparation,setPreparation]=useState<PreparationStatus>()
  useEffect(()=>subscribePreparation(setPreparation),[])
  const preparationLabel=preparation?{preparing:'ავტომობილის მონაცემები მუშავდება...',ready:'მონაცემები მზად არის',updating:'მონაცემების განახლება მიმდინარეობს...',error:'მონაცემები ვერ მომზადდა'}[preparation]:undefined
  const [open, setOpen] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) launcher.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus({ preventScroll: true })
    function onPointerDown(event: PointerEvent) {
      const path = event.composedPath()
      if (!path.includes(panel.current!) && !path.includes(launcher.current!)) close(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    // Listen without blocking the page's own clicks, forms, or keyboard handlers.
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, close])

  return (
    <div lang="ka" className="dock" data-preparation-state={preparation}>
      {open && (
        <section className="panel" id="auto-importer-panel" ref={panel} role="dialog" aria-modal="false"
          aria-labelledby="auto-importer-title">
          <button className="close-button" type="button" ref={closeButton}
            aria-label="Auto Importer-ის პანელის დახურვა" onClick={() => close()}>×</button>
          <PopupContent detection={{ status: 'ready', website }} />
        </section>
      )}
      {!open && preparationLabel && <span className="preparation-status" role="status">{preparationLabel}</span>}
      <button className="launcher" type="button" ref={launcher}
        aria-label={open ? 'Auto Importer-ის პანელის დახურვა' : 'Auto Importer-ის პანელის გახსნა'}
        title="Auto Importer · GLOBAL AUTO TRANSPORTER" aria-expanded={open}
        aria-controls={open ? 'auto-importer-panel' : undefined}
        onClick={() => open ? close() : setOpen(true)}>
        <ExtensionIcon />
      </button>
    </div>
  )
}
