import {watchEdge} from './edge'
import {watchRegularManheim} from './regularManheim'
import {siteManheimAdapter,searchManheimAdapter,manheim24SearchAdapter,edgePipelineAdapter} from './sourceAdapters'
import {vehicleSource} from '../services/sourceRegistry'
import { registerManheimParser } from './manheim'
import { createRoot } from 'react-dom/client'
import { detectWebsite } from '../services/website'
import { FloatingLauncher } from './FloatingLauncher'
import sharedStyles from '../styles/ui.css?inline'
import popupStyles from '../popup/popup.css?inline'
import styles from './launcher.css?inline'

const hostId = 'global-auto-transporter-launcher'
const website = detectWebsite(window.location.href)

function mountLauncher(regularManheim=false){
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
  reactRoot.render(<FloatingLauncher website={website} regularManheim={regularManheim} />)
  return ()=>{reactRoot.unmount();host.remove()}
}

// Informational regular Manheim pages have only a read-only component watcher. The same
// verified vehicle component can arrive through any path/hash or async render.
if(window.top===window){
  const source=vehicleSource(window.location.href)
  if(source?.id==='ManheimSite'||source?.id==='ManheimSearch'){
    const adapter=source.id==='ManheimSite'?siteManheimAdapter:searchManheimAdapter
    watchRegularManheim(document,adapter,()=>{
      const stop=registerManheimParser(document,adapter),unmount=mountLauncher(true)
      return ()=>{try{unmount()}finally{stop?.()}}
    })
  }else if(source?.id==='EdgePipeline'){
    watchEdge(document,()=>{const stop=registerManheimParser(document,edgePipelineAdapter),unmount=mountLauncher(true);return ()=>{try{unmount()}finally{stop?.()}}})
  }else if(website.kind==='auction'&&!document.getElementById(hostId)){
    if(source?.id==='Manheim24')registerManheimParser()
    if(source?.id==='Manheim24Search')registerManheimParser(document,manheim24SearchAdapter)
    mountLauncher()
  }
}
