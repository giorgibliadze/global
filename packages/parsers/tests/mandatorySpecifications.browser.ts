import {mandatorySpecifications,sourceDoorCount,explicitSteering} from '../src/mandatorySpecifications'
import {parseManheim24} from '../src/manheim24'
import {myautoFields,fillMyautoForm,verifyMyautoPersistence} from '../src/myauto'
import {assertNormalizedVehicle} from '../src/validation'

export async function runMandatoryTests(html:string,form:string,check:(value:unknown,label:string)=>void){
  const original=parseManheim24(new DOMParser().parseFromString(html,'text/html'))
  const cases=[
    ['steeringWheel','LHD','0'],['steeringWheel','Left Hand Drive','0'],['steeringWheel','RHD','1'],['steeringWheel','Right Hand Drive','1'],
    ['transmission','Automatic','2'],['transmission','AT','2'],['transmission','Manual','1'],['transmission','MT','1'],['transmission','Tiptronic','3'],['transmission','Manual-shift automatic','3'],['transmission','CVT','4'],['transmission','Continuously Variable Transmission','4'],
    ['drivetrain','FWD','1'],['drivetrain','Front Wheel Drive','1'],['drivetrain','RWD','2'],['drivetrain','Rear Wheel Drive','2'],['drivetrain','AWD','3'],['drivetrain','All Wheel Drive','3'],['drivetrain','4WD','3'],['drivetrain','Four Wheel Drive','3'],
    ...[2,3,4,5,6,7].map(value=>['doorCount',value,value<=3?'1':value<=5?'2':'4']),
  ] as const
  for(const [key,value,id] of cases)check(mandatorySpecifications({...original,[key]:value}).find(field=>field.field===key)?.value===id,`mandatory: ${key} ${value} maps to actual option ID ${id}`)
  check(!mandatorySpecifications({...original,drivetrain:'DRW'}).find(field=>field.field==='drivetrain')!.value,'mandatory: DRW never becomes 4WD')
  for(const value of ['Automatic / Manual','Automatic (unspecified)','Unknown'])check(!mandatorySpecifications({...original,transmission:value}).find(field=>field.field==='transmission')!.value,'mandatory: ambiguous transmission is manual, never guessed Tiptronic')
  check(sourceDoorCount(4,'4')===4 && sourceDoorCount(4,'2')===undefined && sourceDoorCount(undefined,'4/5')===undefined,'mandatory: structured door fields agree or remain unresolved, never infer from model')
  check(explicitSteering(['LHD','Left Hand Drive'])==='LHD' && explicitSteering(['LHD','RHD'])==='LHD / RHD','mandatory: explicit equipment preserves steering conflicts without guessing')
  const source=new DOMParser().parseFromString(html,'text/html'),node=source.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!)
  data.equipment=['Right Hand Drive'];data.doorCount=6;data.doors='6';node.textContent=JSON.stringify(data)
  const parsed=parseManheim24(source);assertNormalizedVehicle(parsed)
  check(parsed.steeringWheel==='Right Hand Drive' && parsed.doorCount===6 && parsed.raw.doorCount===6 && parsed.raw.doors==='6','mandatory: explicit source equipment and labeled door count survive normalized payload validation')
  check(original.steeringWheel===undefined && original.doorCount===4,'mandatory: real fixture door count extracted; absent steering is not guessed from BMW or country')
  const frame=document.createElement('iframe');frame.style.width='1280px';document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(form);doc.close()
  try{
    const tracker=doc.querySelector('[data-testid="single-select-input-primaryFeatures.manufacturer"]')!;tracker.classList.add('opacity-0')
    const tab=doc.createElement('button');tab.dataset.testid='description-locale-tab-ka';doc.body.append(tab)
    const vehicle={...original,steeringWheel:'RHD',doorCount:6,transmission:'CVT',drivetrain:'FWD'},planned=myautoFields(vehicle)
    const keys=['steeringWheel','transmission','drivetrain','doorCount']
    const stored=new Map<string,string>()
    for(const element of doc.querySelectorAll<HTMLElement>('[data-testid^="single-checkbox-primaryFeatures."]'))element.onclick=()=>{
      const [,group,id]=element.dataset.testid!.match(/single-checkbox-primaryFeatures\.([^-]+)-(.+)/)!
      stored.set(group,id)
      for(const peer of doc.querySelectorAll<HTMLElement>(`[data-testid^="single-checkbox-primaryFeatures.${group}-"]`))peer.className=peer===element?'border-[#02cc59] bg-[#02cc59]/10':''
    }
    const results=await fillMyautoForm(doc,vehicle,{planned,onlyFields:keys})
    doc.querySelector<HTMLInputElement>('input[name="primaryFeatures.mileage"]')!.focus()
    // Re-render from the committed form values, without relying on hidden input.value.
    for(const element of doc.querySelectorAll<HTMLElement>('[data-testid^="single-checkbox-primaryFeatures."]')){
      const [,group,id]=element.dataset.testid!.match(/single-checkbox-primaryFeatures\.([^-]+)-(.+)/)!
      element.className=stored.get(group)===id?'border-[#02cc59] bg-[#02cc59]/10':''
    }
    const checked=await verifyMyautoPersistence(doc,vehicle,results,planned)
    check(checked.length===4 && checked.every(result=>result.persisted),'mandatory: all four survive peer focus and source-derived controlled rerender')
    const conflict=await fillMyautoForm(doc,{...vehicle,steeringWheel:'LHD'},{onlyFields:['steeringWheel']})
    check(conflict[0].code==='protected' && stored.get('wheelTypeId')==='1','mandatory: existing manual steering selection is never overwritten')
    const protectedOthers=await fillMyautoForm(doc,{...vehicle,transmission:'AT',drivetrain:'RWD',doorCount:2},{onlyFields:['transmission','drivetrain','doorCount']})
    check(protectedOthers.every(result=>result.code==='protected'),'mandatory: existing transmission, drivetrain and door choices also remain protected')
    const missing=await fillMyautoForm(doc,{...vehicle,steeringWheel:undefined,doorCount:undefined,raw:{...vehicle.raw,doorCount:4,doors:'2'},transmission:'Uncertain',drivetrain:'DRW'},{onlyFields:keys})
    check(missing.every(result=>result.status==='unfilled') && missing.find(result=>result.key==='drivetrain')?.sourceValue==='DRW','mandatory: missing/ambiguous values remain untouched with original values for manual selection')
  }finally{frame.remove()}
}
