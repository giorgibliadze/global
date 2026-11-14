import {useEffect,useState} from 'react'
import {subscribePreparation} from './manheim'
import type {PreparationStatus} from '@auto-importer/shared'
import {ExtensionIcon} from '../components/ExtensionIcon'
import {useDirectTransfer} from '../services/useDirectTransfer'
import type {Website} from '../services/website'

export function FloatingLauncher({website}:{website:Website}){
  const [preparation,setPreparation]=useState<PreparationStatus>()
  useEffect(()=>subscribePreparation(setPreparation),[])
  const supported=website.hostname==='manheim24.com'||website.hostname.endsWith('.manheim24.com')
  const {start,busy,error,lifecycle}=useDirectTransfer(supported)
  return <div lang="ka" className="dock" data-preparation-state={preparation} data-transfer-state={lifecycle}>
    <button className="launcher" type="button" disabled={busy} aria-busy={busy} aria-label="MyAuto-ზე გადატანა" title="Auto Importer · GLOBAL AUTO TRANSPORTER" onClick={()=>void start()}>
      <ExtensionIcon />
    </button>
    {error&&<span className="launcher-error" role="alert">{error}</span>}
  </div>
}
