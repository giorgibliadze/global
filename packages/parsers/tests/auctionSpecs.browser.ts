import {parseManheim24} from '../src/manheim24'
import {parseManheim24Search} from '../src/manheim24Search'
import {parseSearchManheim} from '../src/searchManheim'
import {parseSiteManheim} from '../src/siteManheim'
import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
import {specificationCylinders,specificationOdometer} from '../src/specNumbers'
export async function runAuctionSpecTests(check:(value:unknown,label:string)=>void){
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),search=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  for(const [token,count] of [['4cyl.',4],['6cyl.',6],['8cyl.',8],['4 Cylinder',4],['6-Cylinder',6],['V6',6],['V8',8],['I4',4],['L4',4],['H4',4],['Flat-6',6]] as const)check(specificationCylinders('Gasoline','Vehicle',token)===count,`Cylinder specification ${token} → ${count}`)
  for(const invalid of ['2.0L','3.5L','5.0L','128i','V6 4 Cylinder'])check(specificationCylinders('Gasoline','Vehicle',invalid)===undefined,'Displacement/model/conflicting cylinder numbers are not guessed')
  for(const label of ['Mileage','Odometer','Miles','Odometer Reading','Vehicle Mileage'])check(specificationOdometer(`${label}: 66,774 (Actual)`)?.value===66774,'Only explicit odometer labels and their complete numeric value are accepted')
  const source=document.createElement('iframe');document.body.append(source);const doc=source.contentDocument!
  const wait=async(test:()=>boolean)=>{for(let i=0;i<200;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('Auction specification React verification timeout')}
  const sources=[
    {name:'Manheim24',html:legacy,parse:()=>parseManheim24(doc)},
    {name:'Manheim24 Search',html:legacy,parse:()=>parseManheim24Search(doc,'https://search.manheim24.com/results#/details/1HGCM82633A004352/OVE')},
    {name:'Manheim Site legacy',html:legacy,parse:()=>parseSiteManheim(doc,'https://site.manheim.com/vehicle/detail/fixture')},
    {name:'Manheim Search',html:search,parse:()=>parseSearchManheim(doc,'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE')},
    {name:'Manheim Site modern',html:search,parse:()=>parseSiteManheim(doc,'https://site.manheim.com/results#/details/SALKZ9F90RA229948/OVE')},
  ]
  try{for(const platform of sources){
    const cases=[
      {engine:'4cyl.',fuel:'Gasoline',odo:'66,774 (Actual)',unit:'mi',expected:66774,cylinders:4},
      {engine:'V6',fuel:'Gasoline',odo:'120,500 mi',unit:'mi',expected:120500,cylinders:6},
      {engine:'V8',fuel:'Gasoline',odo:'8,250 (Exempt)',unit:'mi',expected:8250,cylinders:8},
      {engine:'H4',fuel:'Hybrid',odo:'12,000 km',unit:'km',expected:12000,cylinders:4},
      {engine:'V8',fuel:'Electric',odo:0,unit:'mi',expected:0,cylinders:undefined},
      {engine:undefined,fuel:'Gasoline',odo:undefined,unit:undefined,expected:undefined,cylinders:undefined},
    ]
    for(const entry of cases){
      doc.open();doc.write(platform.html);doc.close()
      const node=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!)
      data.engineType=entry.engine;data.engineFuelType=entry.fuel;data.odometer=entry.odo;data.odometerUnits=entry.unit
      const engine=data.designatedDescriptionEnrichment?.powertrain?.engine;if(engine)engine.primaryDescription=entry.engine
      for(const key of ['comments','remarks'])if(typeof data[key]==='string')data[key]=data[key].replace(/<br\s*\/?\s*>/gi,'\n').replace(/^Cylinders:.*$/gim,'').replace(/\b(?:V|I|H|L)\d{1,2}\b|\bFlat-\d{1,2}\b/g,'')
      node.textContent=JSON.stringify(data)
      for(const item of doc.querySelectorAll('[data-testid="vdp-decription-info"]'))item.textContent=''
      for(const item of doc.querySelectorAll('[data-testid="card-view-engine-type"]'))item.textContent=entry.engine??''
      const v=platform.parse()
      check(v.cylinders===entry.cylinders&&v.mileage?.value===entry.expected&&(entry.expected===undefined||v.mileage?.unit===entry.unit),`${platform.name}: ${entry.engine??'missing'} / ${entry.odo??'missing'} → ${entry.cylinders??'missing'} / ${entry.expected??'missing'} ${entry.unit??'unknown'}`)
      const target=document.createElement('iframe');document.body.append(target)
      try{
        const form=target.contentDocument!;form.open();form.write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.fixtureConfiguration='+JSON.stringify({model:v.model,cylinders:String(entry.cylinders??6),mileageUnit:entry.unit??'mi',pointerOnly:true})+'</script><script src="/edge-spec-react.js"></script></body></html>');form.close()
        const win=target.contentWindow as Window&{fixtureState?:{values:Record<string,string>;selected:Record<string,{id:string;label:string}>;renders:number};fixtureForceRender?:()=>void}
        await wait(()=>!!win.fixtureState)
        const results=await fillMyautoForm(form,v,{onlyFields:['cylinders','mileageKm'],dropdownTimeoutMs:400})
        const before=win.fixtureState!.renders;form.querySelector<HTMLButtonElement>('#fixture-other-field')!.click();win.fixtureForceRender!();await wait(()=>win.fixtureState!.renders>before)
        const state=win.fixtureState!,numeric=entry.expected===undefined?'':String(entry.expected)
        check(state.values.mileage===numeric&&form.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value===numeric&&(entry.cylinders===undefined?!state.selected.cylinders:state.selected.cylinders?.id==='fixture-cylinders'&&state.selected.cylinders.label===String(entry.cylinders))&&state.selected.mileageType.label===(entry.unit==='km'?'კმ':'მილი'),`${platform.name}: exact mileage/unit and cylinder option persist in real React state after blur and rerender`)
        const verified=await verifyMyautoPersistence(form,v,results,myautoFields(v),undefined,['cylinders','mileageKm'])
        check(verified.filter(result=>result.key==='cylinders'&&entry.cylinders!==undefined||result.key==='mileageKm'&&entry.expected!==undefined).every(result=>result.status==='filled'&&result.persisted),`${platform.name}: unchanged shared MyAuto mapper verifies the two fields`)
      }finally{target.remove()}
    }
    for(const conflict of [false,true]){
      doc.open();doc.write(platform.html);doc.close();const node=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!);data.odometer=100;data.odometerUnits=conflict?'mi':'';node.textContent=JSON.stringify(data)
      doc.querySelector('[data-testid="vdp-decription-info"]')!.textContent=conflict?'100 km':''
      const v=platform.parse();check(v.mileage===undefined&&v.mileageKm===undefined,`${platform.name}: unknown/conflicting distance units stay unresolved without silently reinterpreting mileage`)
    }
    // Visible odometer fallback, unknown units and EV range exclusion.
    for(const [shown,expected,unit] of [['66,774 (Actual) miles',66774,'mi'],['Odometer Reading: 8,250 km',8250,'km'],['Range: 350 miles',undefined,undefined],['',undefined,undefined]] as const){
      doc.open();doc.write(platform.html);doc.close();const node=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!);delete data.odometer;delete data.odometerUnits;node.textContent=JSON.stringify(data)
      doc.querySelector('[data-testid="vdp-decription-info"]')!.textContent=shown
      const v=platform.parse();check(v.mileage?.value===expected&&v.mileage?.unit===unit,`${platform.name}: scoped visible odometer fallback excludes range and never assumes unknown units`)
    }
  }}finally{source.remove()}
}
