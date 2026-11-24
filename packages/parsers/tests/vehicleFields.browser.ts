import {assertNormalizedVehicle} from '../src/validation'
import {specificationEngine,specificationBody} from '../src/specNumbers'
import {parseManheim24} from '../src/manheim24'
import {parseManheim24Search} from '../src/manheim24Search'
import {parseSearchManheim} from '../src/searchManheim'
import {parseSiteManheim} from '../src/siteManheim'
import {parseEdgePipelineText} from '../src/edge/index'
import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
export async function runVehicleFieldsTests(check:(value:unknown,label:string)=>void,group:string){
  for(const [input,expected] of [['1.5 L',1500],['2.0L Turbo',2000],['3.0L V6',3000],['1998 cc',1998],['3.0',3000]] as const)check(specificationEngine(input,'Hybrid')===expected,'Explicit engine specification normalizes without double conversion')
  check(specificationEngine('3.0L','Electric')===undefined&&specificationEngine('Unknown','Gasoline')===undefined,'EV and unknown engines remain empty')
  for(const [input,expected] of [['4 Door Pickup Truck','Pickup'],['2D Coupe','Coupe'],['Sport Utility Vehicle','SUV'],['Station Wagon','Wagon']] as const)check(specificationBody(input)===expected,'Only confirmed body-style equivalents normalize to supported categories')
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),search=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text(),edge=await(await fetch('/packages/parsers/tests/fixtures/edge-gasoline.html')).text()
  const snapshot=new DOMParser().parseFromString(await(await fetch('/packages/parsers/tests/fixtures/myauto.html')).text(),'text/html')
  const choices=[...snapshot.querySelectorAll<HTMLElement>('[data-testid^="single-checkbox-primaryFeatures."]')].map(node=>node.dataset.testid!.match(/^single-checkbox-primaryFeatures\.(.+)-(\d+)$/)).filter((match):match is RegExpMatchArray=>!!match).map(match=>[match[1],match[2]])
  const source=document.createElement('iframe');document.body.append(source);const doc=source.contentDocument!
  const sources=[
    {name:'Manheim Search',group:'manheim',html:search,parse:()=>parseSearchManheim(doc,'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE')},
    {name:'Manheim Site modern',group:'manheim',html:search,parse:()=>parseSiteManheim(doc,'https://site.manheim.com/results#/details/SALKZ9F90RA229948/OVE')},
    {name:'Manheim Site legacy',group:'manheim',html:legacy,parse:()=>parseSiteManheim(doc,'https://site.manheim.com/vehicle/detail/fixture')},
    {name:'Manheim24',group:'manheim24',html:legacy,parse:()=>parseManheim24(doc)},
    {name:'Manheim24 Search',group:'manheim24',html:legacy,parse:()=>parseManheim24Search(doc,'https://search.manheim24.com/results#/details/1HGCM82633A004352/OVE')},
    {name:'EDGE Pipeline',group:'edge',html:edge,parse:()=>parseEdgePipelineText(doc,'https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32))},
  ].filter(source=>group==='all'||source.group===group)
  const wait=async(predicate:()=>boolean)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('Vehicle-field React verification timeout')}
  try{for(const platform of sources){for(const fuel of ['Premium Unleaded Gasoline','Diesel','Hybrid','Gasoline Plug-In Hybrid','Electric']){
    doc.open();doc.write(platform.html);doc.close()
    const json=doc.querySelector('.StockWaveInfo')
    if(json){
      const data=JSON.parse(json.textContent!);Object.assign(data,{engineDisplacement:'3.0L Turbo',engineType:'V6',engineFuelType:fuel,bodyStyle:'4 Door Pickup Truck',transmission:'6-Speed Automatic',driveTrain:'AWD',interiorColor:'Black',exteriorColor:'Blue',interiorType:'Fabric',doorCount:4,doors:'4',odometer:'66,774 (Actual)',odometerUnits:'mi'})
      if(platform.group==='manheim24'){data.equipment=[...(data.equipment??[]),'LHD']}
      else if(platform.name==='Manheim Site legacy'){data.equipment=[...(data.equipment??[]),'LHD']}
      else {const engine=data.designatedDescriptionEnrichment.powertrain.engine;engine.primaryDescription='3.0L V6';data.designatedDescriptionEnrichment.installedEquipment.push({primaryDescription:'LHD'});if(typeof data.comments==='string')data.comments=data.comments.replace(/Cylinders:\s*8/,'Cylinders: 6')}
      json.textContent=JSON.stringify(data);for(const node of doc.querySelectorAll('[data-testid="vdp-decription-info"]'))node.textContent='66,774 miles'
    }else{
      const set=(label:string,value:string)=>{const row=[...doc.querySelectorAll('.section.details .field')].find(row=>row.querySelector('label')?.textContent===label);if(row)row.querySelector('span')!.textContent=value}
      set('Displacement','3.0L Turbo');set('Fuel Type',fuel);set('Cylinders','6');set('Body Style','4 Door Pickup Truck');set('Transmission','6-Speed Automatic');set('Interior Color / Material','Black / Fabric');set('Color','Blue');set('Doors','4');set('Drive Train','AWD')
      // Keep exact identity separate from the changed specification text.
      const row=doc.createElement('div');row.className='field';row.innerHTML='<label>Model</label><span>Fixture Model</span>';doc.querySelector('.section.details')!.append(row)
      const li=doc.createElement('li');li.textContent='LHD';doc.querySelector('.section.options ul')!.append(li);doc.querySelector('.odometer')!.textContent='Odometer: 66,774 (Actual) mi'
    }
    const v=platform.parse();assertNormalizedVehicle(v);assertNormalizedVehicle(JSON.parse(JSON.stringify(v)));const electric=fuel==='Electric'
    check(v.engineCc===(electric?undefined:3000)&&v.cylinders===(electric?undefined:6)&&v.body==='Pickup'&&v.mileage?.value===66774&&v.mileage.unit==='mi',`${platform.name} ${fuel}: exact engine/body/cylinders/original mileage payload`)
    check(v.transmission==='Automatic'&&v.steeringWheel==='LHD'&&v.interiorMaterial==='Cloth',`${platform.name}: explicit transmission, steering and fabric material reach supported mappings`)
    const fields=myautoFields(v),expected=fields.filter(field=>field.value!==undefined&&field.mode!=='manual'&&field.field!=='price')
    const target=document.createElement('iframe');document.body.append(target)
    try{
      const label=(key:string)=>{const field=fields.find(field=>field.field===key);return field?.optionValue?.equivalents?.[0]??field?.optionValue?.candidates?.[0]}
      const form=target.contentDocument!;form.open();form.write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.fixtureConfiguration='+JSON.stringify({make:v.make,model:v.model,year:String(v.year),fuel:label('fuel'),body:label('body'),engine:'3.0',cylinders:'6',mileageUnit:'mi',choices,pointerOnly:true})+'</script><script src="/edge-spec-react.js"></script></body></html>');form.close()
      const win=target.contentWindow as Window&{fixtureState?:{values:Record<string,string>;selected:Record<string,{id:string;label:string}>;renders:number;uploads:number};fixtureForceRender?:()=>void}
      await wait(()=>!!win.fixtureState)
      const results=await fillMyautoForm(form,v,{onlyFields:expected.map(field=>field.field),dropdownTimeoutMs:300})
      const before=win.fixtureState!.renders;form.querySelector<HTMLButtonElement>('#fixture-other-field')!.click();win.fixtureForceRender!();await wait(()=>win.fixtureState!.renders>before)
      const verified=await verifyMyautoPersistence(form,v,results,fields,undefined,expected.map(field=>field.field))
      const missing=expected.filter(field=>!verified.some(result=>result.key===field.field&&result.status==='filled'&&result.persisted)).map(field=>field.field)
      check(!missing.length,`${platform.name} ${fuel}: all confirmed available fields persist through the existing MyAuto React contract (${missing.join(',')||expected.length})`)
      check(win.fixtureState!.values.vin===v.vin&&win.fixtureState!.values.mileage==='66774'&&win.fixtureState!.selected.model.label===v.model&&win.fixtureState!.uploads===0,`${platform.name}: exact VIN/model/mileage retained; audit invokes no photo upload`)
    }finally{target.remove()}
  }}}finally{source.remove()}
}
