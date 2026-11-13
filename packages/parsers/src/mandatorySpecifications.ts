import type {NormalizedVehicle,PreparedFormField} from '@auto-importer/shared'

export const mandatoryKeys=['steeringWheel','transmission','drivetrain','doorCount'] as const
const canonical=(value:string)=>value.trim().toLowerCase().replace(/[\s-]+/g,' ')
const dictionaries={
  steeringWheel:[['0',['Left Hand Drive','LHD','მარცხენა']],['1',['Right Hand Drive','RHD','მარჯვენა']]],
  transmission:[['1',['Manual','MT','მექანიკა']],['2',['Automatic','Auto','AT','ავტომატიკა']],['3',['Tiptronic','Manual-shift automatic','Automatic with manual shift','ტიპტრონიკი']],['4',['CVT','Continuously Variable Transmission','ვარიატორი']]],
  drivetrain:[['1',['FWD','Front Wheel Drive','წინა']],['2',['RWD','Rear Wheel Drive','უკანა']],['3',['AWD','All Wheel Drive','4WD','Four Wheel Drive','4x4']]],
} as const
export function specificationOption(key:keyof typeof dictionaries,value:string|undefined):string|undefined{
  if(!value)return
  return dictionaries[key].find(([,values])=>values.some(candidate=>canonical(candidate)===canonical(value)))?.[0]
}
export function explicitSteering(equipment:string[]):string|undefined{
  const values=[...new Set(equipment.filter(value=>specificationOption('steeringWheel',value)!==undefined))]
  if(!values.length)return
  return new Set(values.map(value=>specificationOption('steeringWheel',value))).size===1?values[0]:values.join(' / ')
}
export function sourceDoorCount(doorCount:unknown,doors:unknown):number|undefined{
  const parse=(value:unknown)=>{
    const number=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value.trim())?Number(value):NaN
    return Number.isSafeInteger(number)&&number>0?number:undefined
  }
  const a=parse(doorCount),b=parse(doors)
  if(doorCount!==undefined && doorCount!==null && a===undefined || doors!==undefined && doors!==null && b===undefined)return
  return a!==undefined && b!==undefined && a!==b?undefined:a??b
}
export function mandatorySpecifications(vehicle:NormalizedVehicle):PreparedFormField[]{
  const originalDoor=vehicle.doorCount===undefined?[vehicle.raw.doorCount,vehicle.raw.doors].filter(value=>value!==undefined).map(String).join(' / '):String(vehicle.doorCount)
  const doors=vehicle.doorCount
  return ([
    ['steeringWheel','საჭე','wheelTypeId',vehicle.steeringWheel,specificationOption('steeringWheel',vehicle.steeringWheel)],
    ['transmission','ტრანსმისია','gearTypeId',vehicle.transmission,specificationOption('transmission',vehicle.transmission)],
    ['drivetrain','წამყვანი თვლები','driveTypeId',vehicle.drivetrain,specificationOption('drivetrain',vehicle.drivetrain)],
    ['doorCount','კარის რაოდენობა','doorTypeId',originalDoor||undefined,doors!==undefined && Number.isInteger(doors)&&doors>=2?(doors<=3?'1':doors<=5?'2':'4'):undefined],
  ] as const).map(([field,label,key,sourceValue,value])=>({field,label,mode:'choice',value,sourceValue,mandatory:true,
    selector:value===undefined?undefined:`[data-testid="single-checkbox-primaryFeatures.${key}-${value}"]`,
    verifySelector:value===undefined?undefined:`[data-testid="single-checkbox-input-primaryFeatures.${key}-${value}"]`,
    reason:'ხელით შესავსები',
  }))
}
