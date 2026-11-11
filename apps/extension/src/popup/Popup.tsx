import { useEffect, useState } from 'react'
import { AutoLogo } from '../components/AutoLogo'
import { getCurrentWebsite, getExtensionVersion } from '../services/browser'
import { auctionSites } from '../services/website'
import type { Website } from '../services/website'

type Detection = { status: 'loading' | 'error' } | { status: 'ready'; website: Website }

export function Popup() {
  const [detection, setDetection] = useState<Detection>({ status: 'loading' })
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    getCurrentWebsite().then(
      (website) => { if (!cancelled) setDetection({ status: 'ready', website }) },
      () => { if (!cancelled) setDetection({ status: 'error' }) },
    )
    return () => { cancelled = true }
  }, [])
  const website = detection.status === 'ready' ? detection.website : undefined
  const canImport = website?.kind === 'auction'
  const status = detection.status === 'loading' ? 'Checking website…'
    : detection.status === 'error' ? 'Detection unavailable'
    : canImport ? 'Supported auction website'
    : website?.kind === 'destination' ? 'You’re on MyAuto' : 'Website not supported'
  const guidance = detection.status === 'loading' ? 'Identifying your active tab.'
    : detection.status === 'error' ? 'Reopen the extension to try tab detection again.'
    : canImport ? 'Your auction website is supported. Vehicle importing is coming soon.'
    : website?.kind === 'destination' ? 'Open a supported auction website to import a vehicle to MyAuto.'
    : 'Visit one of the supported auction websites below to get started.'
  return (
    <main className="popup">
      <header className="header">
        <AutoLogo />
        <div className="header-title">
          <h1>Auto Importer</h1>
          <p className="brand-caption">Auction to MyAuto, simplified.</p>
        </div>
      </header>
      <section className="website-card" aria-labelledby="website-title">
        <h2 className="section-label" id="website-title">CURRENT WEBSITE</h2>
        <p className="website-name">{website?.name ?? (detection.status === 'loading' ? 'Detecting website…' : 'Unable to read tab')}</p>
        {website?.hostname && website.hostname !== website.name && <p className="hostname">{website.hostname}</p>}
        <div className={`detection ${detection.status === 'loading' ? 'loading' : ''} ${canImport ? 'supported' : ''}`} role="status">
          <span className="status-dot" />{status}
        </div>
      </section>
      <div className="import-action">
        <button type="button" disabled={!canImport} onClick={() => setMessage('Vehicle import functionality is coming soon.')}>
          Import to MyAuto <span aria-hidden="true">↗</span>
        </button>
        <p className="guidance">{guidance}</p>
        {message && <p className="notice" role="status">{message}</p>}
      </div>
      <section className="supported-sites" aria-labelledby="supported-title">
        <h2 className="section-label" id="supported-title">SUPPORTED AUCTION PLATFORMS</h2>
        <ul>{auctionSites.map((site) => <li key={site.domain}>{site.name}</li>)}</ul>
      </section>
      <footer><span>GLOBAL AUTO TRANSPORTER</span><span>v{getExtensionVersion()}</span></footer>
    </main>
  )
}
