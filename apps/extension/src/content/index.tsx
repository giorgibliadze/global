import {watchSiteManheim} from './siteManheim'
import {siteManheimAdapter} from './sourceAdapters'
import {vehicleSource} from '../services/sourceRegistry'
import {registerSearchManheimParser} from './searchManheim'
import { registerManheimParser } from './manheim'
import { createRoot } from 'react-dom/client'
import { detectWebsite } from '../services/website'
import { FloatingLauncher } from './FloatingLauncher'
import sharedStyles from '../styles/ui.css?inline'
import popupStyles from '../popup/popup.css?inline'
import styles from './launcher.css?inline'

const hostId = 'global-auto-transporter-launcher'
const website = detectWebsite(window.location.href)

function mountLauncher(){
  if(document.getElementById(hostId))return ()=>{}
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
  const reactRoot=createRoot(root)
  reactRoot.render(<FloatingLauncher website={website} />)
  return ()=>{reactRoot.unmount();host.remove()}
}

// Informational Site pages have only a read-only component watcher. The same
// verified vehicle component can arrive through any path/hash or async render.
if(window.top===window){
  const source=vehicleSource(window.location.href)
  if(source?.id==='ManheimSite')watchSiteManheim(document,siteManheimAdapter,()=>{
    const stop=registerManheimParser(document,siteManheimAdapter),unmount=mountLauncher()
    return ()=>{try{unmount()}finally{stop?.()}}
  })
  else if(website.kind==='auction'&&!document.getElementById(hostId)){
    if(source?.id==='Manheim24')registerManheimParser()
    if(source?.id==='ManheimSearch')registerSearchManheimParser()
    mountLauncher()
  }
}
