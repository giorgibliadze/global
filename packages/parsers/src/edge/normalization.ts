import type {NormalizedVehicle} from '@auto-importer/shared'
export const edgeValue=(input:string|undefined|null)=>{
  const value=input?.replace(/\s+/g,' ').trim()
  return value&&!/^(?:-+|\?+|not specified|not applicable|unknown|n\/?a|null|undefined)$/i.test(value)?value:undefined
}
export function normalizeEdgeVehicle(vehicle:NormalizedVehicle):NormalizedVehicle{
  const canonical=(value:string|undefined,values:readonly string[])=>value?values.find(label=>label.toLowerCase()===value.toLowerCase())??value:undefined
  const body=edgeValue(vehicle.body)?.replace(/^\d+\s+Door\s+/i,'')
  vehicle.body=/^pickup truck$/i.test(body??'')?'Pickup':canonical(body,['Coupe','Pickup','Sedan','SUV','Wagon','Hatchback','Convertible'])
  vehicle.fuel=canonical(edgeValue(vehicle.fuel),['Gasoline','Electric','Diesel','Hybrid','Plug-in Hybrid'])
  vehicle.transmission=canonical(edgeValue(vehicle.transmission),['Automatic','Manual','CVT','Tiptronic'])
  vehicle.drivetrain=canonical(edgeValue(vehicle.drivetrain),['AWD','4WD','FWD','RWD'])
  vehicle.equipment=[...new Set((vehicle.equipment??[]).map(edgeValue).filter((value):value is string=>!!value))]
  if(vehicle.interiorColor&&!['Black','White','Gray','Grey','Brown','Beige','Red','Blue','Yellow','Orange','Burgundy','Gold'].some(value=>value.toLowerCase()===vehicle.interiorColor!.toLowerCase()))vehicle.warnings.push(`სალონის ფერი: ${vehicle.interiorColor} — ხელით შესავსები.`)
  // EV values are never synthesized from model names, kW or missing labels.
  if(vehicle.fuel==='Electric'){delete vehicle.engineCc;delete vehicle.cylinders}
  return vehicle
}
