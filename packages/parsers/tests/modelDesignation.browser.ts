import { parseManheim24 } from '../src/manheim24'
import { assertNormalizedVehicle } from '../src/validation'
import { MODEL_TRIM_WARNING } from '../src/identity'
import { fillMyautoForm, myautoFields, vehicleDescription, verifyMyautoFields, MYAUTO_MODEL_WARNING } from '../src/myauto'

export async function runModelDesignationTests(manheim:string,myauto:string,check:(value:unknown,label:string)=>void) {
  function fixture(make:string,base:string,full:string,trim?:string) {
    const doc=new DOMParser().parseFromString(manheim,'text/html'),node=doc.querySelector('.StockWaveInfo')!
    const data=JSON.parse(node.textContent!)
    Object.assign(data,{make,models:[base],trims:trim?[trim]:[],sourceTrim:trim,year:'2019',engineFuelType:'Gasoline',engineDisplacement:'2.3L',engineType:'4 Cylinder Turbo'})
    data.designatedDescriptionEnrichment={vin:data.vin,make,model:base,trim,year:2019,manheimStandardDescription:{shortDescription:`2019 ${make} ${full}`}}
    doc.querySelector('[data-testid="vdp-title-text"]')!.textContent=`2019 ${make} ${full}`
    node.textContent=JSON.stringify(data)
    return {doc,data,node,save:()=>{node.textContent=JSON.stringify(data)}}
  }
  for(const [make,base,full,trim] of [
    ['Ford','Ranger Crew Cab Medium Bed','Ranger XLT Crew Cab Medium Bed','XLT'],
    ['BMW','M5','M5 Touring Wagon','Base'],
    ['Toyota','Camry','Camry SE','SE'],
  ]) {
    const source=fixture(make,base,full,trim),vehicle=parseManheim24(source.doc)
    assertNormalizedVehicle(vehicle)
    check(vehicle.fullModelName===full && vehicle.model===full && vehicle.original.fullModelName===full && vehicle.baseModel===base,`designation: ${make} complete source designation survives normalization and payload validation`)
    check(vehicle.trim===trim && vehicle.original.manufacturer===make,`designation: ${make} independently labeled trim and manufacturer retained separately`)
    check(myautoFields(vehicle).find(field=>field.field==='model')?.value===full && vehicleDescription(vehicle).includes(full) && !vehicleDescription(vehicle).includes(vehicle.vin),`designation: ${make} maps full designation without VIN leakage into description`)
    check(myautoFields({...vehicle,model:base}).find(field=>field.field==='model')?.value===full,`designation: ${make} MyAuto prefers canonical fullModelName over a shortened legacy model alias`)
    if(make==='Ford')check(vehicle.warnings.includes(MODEL_TRIM_WARNING),'designation: old non-adjacent model/trim blocker is now the requested non-blocking Georgian warning')
  }
  const missing=fixture('Ford','Ranger','Ranger XLT Crew Cab Medium Bed')
  const noTrim=parseManheim24(missing.doc);assertNormalizedVehicle(noTrim)
  check(noTrim.trim===null && noTrim.fullModelName==='Ranger XLT Crew Cab Medium Bed' && myautoFields(noTrim).find(field=>field.field==='trim')?.value===undefined,'designation: missing trim stays null and never becomes literal text or guessed title tokens')
  missing.data.designatedDescriptionEnrichment.year=null;missing.save()
  check(parseManheim24(missing.doc).year===2019,'designation: a missing null enrichment year does not block verified independent source fields')
  const placeholder=fixture('Ford','Ranger','Ranger XLT Crew Cab Medium Bed','Not Specified')
  check(parseManheim24(placeholder.doc).trim===null,'designation: placeholder trim values are missing metadata, not a fabricated trim')
  const ambiguous=fixture('Ford','Ranger','Ranger XLT Crew Cab Medium Bed','XLT')
  ambiguous.data.trims=['XLT','Sport'];ambiguous.data.sourceTrim='Sport';ambiguous.save()
  const uncertain=parseManheim24(ambiguous.doc);assertNormalizedVehicle(uncertain)
  check(uncertain.trim===null && uncertain.original.trim===null && uncertain.warnings.includes(MODEL_TRIM_WARNING),'designation: conflicting trim sources remain optional instead of blocking the payload')
  const structuredFull=fixture('Ford','Ranger XLT Crew Cab Medium Bed','Ranger')
  check(parseManheim24(structuredFull.doc).fullModelName==='Ranger XLT Crew Cab Medium Bed','designation: a complete separately labeled model is never shortened to its display-title prefix')
  const titleOnly=fixture('Toyota','Camry','Camry SE','SE')
  delete titleOnly.data.designatedDescriptionEnrichment.manheimStandardDescription;titleOnly.save()
  check(parseManheim24(titleOnly.doc).fullModelName==='Camry SE' && parseManheim24(titleOnly.doc).original.evidence==='selected-title','designation: VIN-scoped selected title retains the full suffix after verified manufacturer/year header')
  const noBase=fixture('BMW','M5','M5 Touring Wagon')
  delete noBase.data.models;delete noBase.data.designatedDescriptionEnrichment.model;noBase.save()
  const withoutBase=parseManheim24(noBase.doc);assertNormalizedVehicle(withoutBase)
  check(withoutBase.fullModelName==='M5 Touring Wagon' && withoutBase.baseModel===undefined,'designation: complete structured designation does not require a separate base model')
  const unsafe=fixture('Ford','Ranger','Ranger XLT Crew Cab Medium Bed','XLT')
  unsafe.data.designatedDescriptionEnrichment.vin='2HGCM82633A004352';unsafe.save()
  let blocked=false;try{parseManheim24(unsafe.doc)}catch{blocked=true}
  check(blocked,'designation: unsafe selected-vehicle VIN mismatch remains blocking')
  blocked=false;try{assertNormalizedVehicle({...uncertain,fullModelName:'Different model'})}catch{blocked=true}
  check(blocked,'designation: contradictory full model identity cannot enter the transfer payload')

  const frame=document.createElement('iframe');document.body.append(frame)
  const d=frame.contentDocument!;d.open();d.write(myauto);d.close()
  function select(key:string,labels:string[]) {
    d.querySelector(`[data-testid="single-select-primaryFeatures.${key}"]`)?.remove()
    const control=d.createElement('select');control.name=`primaryFeatures.${key}`;control.append(new d.defaultView!.Option('',''))
    for(const label of labels)control.append(new d.defaultView!.Option(label,'fixture-'+key+'-'+label))
    d.body.append(control);return control
  }
  try {
    select('manufacturer',['Ford']);const model=select('model',['Ranger'])
    select('issueYear',['2019']);select('fuelType',['ბენზინი']);select('engineVolume',['2.3']);select('cylinders',['4'])
    const results=await fillMyautoForm(d,uncertain,{dropdownTimeoutMs:100})
    const checked=verifyMyautoFields(d,uncertain,results)
    check(model.value==='' && checked.some(field=>field.key==='model' && field.status==='unfilled' && field.reason.includes(MYAUTO_MODEL_WARNING)),'designation: unsupported full MyAuto model produces the exact requested warning and never selects Ranger')
    check(['vin','year','mileageKm','fuel','engineCc','cylinders'].every(key=>checked.some(field=>field.key===key && field.status==='filled')),'designation: unresolved model/trim does not block VIN, year, mileage, fuel, engine, cylinders while description is intentionally skipped')
    check(d.querySelector<HTMLInputElement>('[name="primaryFeatures.customModel"]')!.value==='' && d.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!.value==='' && !d.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!.value.includes(uncertain.vin),'designation: optional trim remains empty; complete model is preserved and VIN remains outside description')
    model.remove()
    const custom=d.createElement('input');custom.name='primaryFeatures.model';d.body.append(custom)
    const customResults=await fillMyautoForm(d,uncertain,{dropdownTimeoutMs:100,onlyFields:['model'],previousResults:results})
    check(custom.value==='Ranger XLT Crew Cab Medium Bed' && customResults.find(field=>field.key==='model')?.match==='custom','designation: supported custom Model entry receives the entire original designation')
  } finally {frame.remove()}
}
