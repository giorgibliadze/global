import {useEffect,useId,useState} from 'react'
import {locationOptions} from '@auto-importer/parsers/location'
import {request} from '../services/extensionApi'

export function LocationPreferences({override,onOverride,disabled,onSaving}:{override:string;onOverride:(value:string)=>void;disabled:boolean;onSaving:(value:boolean)=>void}){
  const id=useId(),[preference,setPreference]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{
    let cancelled=false
    void request<string|undefined>({type:'LOCATION_PREFERENCE_GET'}).then(value=>{if(!cancelled)setPreference(value??'')},()=>{if(!cancelled)setMessage('მდებარეობის პარამეტრი ვერ ჩაიტვირთა.')}).finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[])
  const save=async(value:string)=>{
    setSaving(true);onSaving(true);setMessage('')
    try{await request({type:'LOCATION_PREFERENCE_SET',label:value});setPreference(value);setMessage('პარამეტრი შენახულია.')}
    catch{setMessage('პარამეტრი ვერ შეინახა. ხელახლა სცადეთ.')}
    finally{setSaving(false);onSaving(false)}
  }
  const options=locationOptions.map(label=><option key={label} value={label}>{label}</option>)
  return <details className="location-preferences">
    <summary>მდებარეობის პარამეტრები</summary>
    <label htmlFor={id+'-default'}>ნაგულისხმევი მდებარეობა</label>
    <select id={id+'-default'} value={preference} disabled={disabled||loading||saving} onChange={event=>void save(event.target.value)}>
      <option value="">დადასტურებული წყაროს მიხედვით</option>{options}
    </select>
    <label htmlFor={id+'-override'}>მხოლოდ ამ გადატანის მდებარეობა</label>
    <select id={id+'-override'} value={override} disabled={disabled||loading||saving} onChange={event=>onOverride(event.target.value)}>
      <option value="">ნაგულისხმევი პარამეტრით</option>{options}
    </select>
    <p>ეს არჩევანი მოქმედებს შემდეგ გადატანაზე. MyAuto-ზე ხელით არჩეული მდებარეობა არ შეიცვლება. „გზაში საქ.-სკენ“ საჭიროებს დადასტურებულ გადაზიდვის სტატუსს.</p>
    {message&&<p role="status">{message}</p>}
  </details>
}
