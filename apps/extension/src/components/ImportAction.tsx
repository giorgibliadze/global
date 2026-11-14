import {useState} from 'react'
import {LocationPreferences} from './LocationPreferences'
import {useDirectTransfer} from '../services/useDirectTransfer'
export function ImportAction({enabled,guidance,manheim24=false}:{enabled:boolean;guidance?:string;manheim24?:boolean}){
  const [locationSaving,setLocationSaving]=useState(false),[listingLocation,setListingLocation]=useState('')
  const {start,busy,error}=useDirectTransfer(manheim24)
  return <div className="import-action">
    <button className="import-button" type="button" disabled={!enabled||busy||locationSaving} onClick={()=>{const override=listingLocation;setListingLocation('');void start(override||undefined)}}>
      {busy?'მიმდინარეობს გადატანა…':'MyAuto-ზე გადატანა'} <span aria-hidden="true">↗</span>
    </button>
    {manheim24&&<LocationPreferences override={listingLocation} onOverride={setListingLocation} onSaving={setLocationSaving} disabled={busy} />}
    {guidance&&<p className="guidance">{guidance}</p>}
    {error&&<p className="notice" role="alert">{error}</p>}
  </div>
}
