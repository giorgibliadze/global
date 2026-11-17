import type {NormalizedVehicle,VehicleMileage} from '@auto-importer/shared'
// Exact source values; no distance conversion or assumed country-based unit.
export function mileageUnit(value:unknown):VehicleMileage['unit']|undefined{
  if(typeof value!=='string')return
  const unit=value.trim().toLowerCase()
  if(['mi','mile','miles','მილი','მლ'].includes(unit))return 'mi'
  if(['km','kilometer','kilometers','kilometre','kilometres','კმ','კილომეტრი'].includes(unit))return 'km'
}
export function sourceMileage(value:unknown,unit:unknown,display?:string):VehicleMileage|undefined{
  const shown=display?.match(/(?:^|[\s•])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(mi(?:les)?|km)\b/i)
  const numeric=typeof value==='string'&&/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(value.trim())?Number(value.replaceAll(',','')):value
  const number=typeof numeric==='number'&&Number.isFinite(numeric)&&numeric>=0?numeric:shown&&value===undefined?Number(shown[1].replaceAll(',','')):undefined
  const explicit=mileageUnit(unit),visible=mileageUnit(shown?.[2])
  if(number===undefined||!Number.isFinite(number)||number<0||shown&&number!==Number(shown[1].replaceAll(',',''))||explicit&&visible&&explicit!==visible)return
  const recognized=explicit??visible
  return recognized?{value:number,unit:recognized}:undefined
}
export function mappedMileage(v:NormalizedVehicle):VehicleMileage|undefined{return v.mileage??(v.mileageKm===undefined?undefined:{value:Math.round(v.mileageKm),unit:'km'})}
export function mileageValue(v:NormalizedVehicle){const value=mappedMileage(v)?.value;return value!==undefined&&Number.isInteger(value)&&value>=0?String(value):undefined}
export function mileageCandidates(v:NormalizedVehicle){return mappedMileage(v)?.unit==='mi'?['მილი','მლ','mi','Miles','miles','Mile']:['კმ','km','Kilometers','kilometers']}
export function selectedMileageUnit(doc:Document,v:NormalizedVehicle){
  const select=doc.querySelector<HTMLSelectElement>('select[name="primaryFeatures.mileageType"]')
  const label=select?.selectedOptions[0]?.textContent??doc.querySelector('[data-testid="single-select-value-primaryFeatures.mileageType"]')?.textContent
  return mileageUnit(label)===mappedMileage(v)?.unit && mappedMileage(v)!==undefined
}
export function mileageDescription(v:NormalizedVehicle){const mileage=mappedMileage(v);return mileage?`გარბენი: ${mileage.value.toLocaleString('en-US',{maximumFractionDigits:6})} ${mileage.unit==='mi'?'მილი':'კმ'}`:''}
