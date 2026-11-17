import {supportsVehicleHostname} from '../services/sourceRegistry'
import {useEffect,useState} from 'react'
import {subscribePreparation} from './manheim'
import type {PreparationStatus} from '@auto-importer/shared'
import {ExtensionIcon} from '../components/ExtensionIcon'
import {useDirectTransfer} from '../services/useDirectTransfer'
import type {Website} from '../services/website'

export function FloatingLauncher({website,regularManheim=false}:{website:Website;regularManheim?:boolean}){
  const [preparation,setPreparation]=useState<PreparationStatus>()
  useEffect(()=>subscribePreparation(setPreparation),[])
  const parserSupported=supportsVehicleHostname(website.hostname)
  const supported=parserSupported&&preparation==='ready'
  const title=regularManheim&&!supported?(preparation==='error'?'ავტომობილის მონაცემები ჯერ არ არის მზად':'ავტომობილის მონაცემები მზადდება…'):'Auto Importer · GLOBAL AUTO TRANSPORTER'
  const {start,busy,error,lifecycle}=useDirectTransfer(supported)
  return <div lang="ka" className="dock" data-preparation-state={preparation} data-transfer-state={lifecycle}>
    <button className="launcher" type="button" disabled={busy||(parserSupported&&!supported)} aria-busy={busy} aria-label="MyAuto-ზე გადატანა" title={title} onClick={()=>void start()}>
      <ExtensionIcon />
    </button>
    {error&&<span className="launcher-error" role="alert">{error}</span>}
  </div>
}
