import { createRoot } from 'react-dom/client'
import { detectWebsite } from '../services/website'
import { FloatingLauncher } from './FloatingLauncher'
import sharedStyles from '../styles/ui.css?inline'
import popupStyles from '../popup/popup.css?inline'
import styles from './launcher.css?inline'

const hostId = 'global-auto-transporter-launcher'
const website = detectWebsite(window.location.href)

// The host lives outside the page body so ordinary SPA route changes cannot remove it.
// Match again at runtime as a defense in addition to the manifest's URL restrictions.
if (window.top === window && website.kind === 'auction' && !document.getElementById(hostId)) {
  const host = document.createElement('div')
  host.id = hostId
  host.style.setProperty('all', 'initial', 'important')
  host.style.setProperty('position', 'fixed', 'important')
  host.style.setProperty('width', '0', 'important')
  host.style.setProperty('height', '0', 'important')
  host.style.setProperty('top', '0', 'important')
  host.style.setProperty('left', '0', 'important')
  host.style.setProperty('z-index', '2147483647', 'important')
  host.style.setProperty('pointer-events', 'none', 'important')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `${sharedStyles}\n${popupStyles}\n${styles}`
  const root = document.createElement('div')
  shadow.append(style, root)
  document.documentElement.append(host)
  createRoot(root).render(<FloatingLauncher website={website} />)
}
