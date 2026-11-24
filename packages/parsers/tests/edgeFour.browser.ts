import {EdgePreparation} from '../../../apps/extension/src/content/edgePreparation'
import type {ExtensionApi} from '../../../apps/extension/src/services/extensionApi'
import {parseEdgePipelineText} from '../src/edge/index'
import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
export async function runEdgeFourTests(check:(value:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/edge-gasoline.html')).text(),url='https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32)
  const source=document.createElement('iframe');document.body.append(source);const doc=source.contentDocument!
  const field=(name:string,value?:string)=>{let row=[...doc.querySelectorAll('.section.details .field')].find(row=>row.querySelector('label')?.textContent===name);if(value===undefined){row?.remove();return}if(!row){row=doc.createElement('div');row.className='field';const label=doc.createElement('label');label.textContent=name;row.append(label,doc.createElement('span'));doc.querySelector('.section.details')!.append(row)}row.querySelector('span')!.textContent=value}
  const wait=async(predicate:()=>boolean)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('EDGE four-field React verification timeout')}
  const cases:[string|undefined,string|undefined,string|undefined,string|undefined,string|undefined,string,number|undefined,string|undefined,number|undefined,number|undefined,'mi'|'km',string?][]=[
    ['1.5 L','4DR Sedan','4cyl.','66,774 (Actual) mi','Gasoline','2026 BMW Fixture Model',1500,'Sedan',4,66774,'mi'],
    ['3.0 L','2-Door Coupe','6cyl.','8,250 (Exempt) mi','Gasoline','2026 BMW Fixture Model',3000,'Coupe',6,8250,'mi'],
    ['2.0 L','Sport Utility Vehicle','I4','120,500 mi','Gasoline','2026 BMW Fixture Model',2000,'SUV',4,120500,'mi'],
    ['3.0 L','2D Coupe','6-Cylinder','8,250 (Exempt) miles','Gasoline','2026 BMW Fixture Model',3000,'Coupe',6,8250,'mi'],
    ['3.5 L','4 Door Hatchback','V6','0 miles','Hybrid','2026 BMW Fixture Model',3500,'Hatchback',6,0,'mi'],
    ['5.0 L','4DR Pickup Truck','V8','12,000 kilometers','Gasoline','2026 BMW Fixture Model',5000,'Pickup',8,12000,'km'],
    ['1998 cc','Station Wagon','L4','9,000 km','Gasoline','2026 BMW Fixture Model',1998,'Wagon',4,9000,'km'],
    ['2.5 L','Convertible','4 Cylinder','1000 mi','Gasoline','2026 BMW Fixture Model',2500,'Convertible',4,1000,'mi'],
    [undefined,undefined,undefined,'100 mi','Gasoline','2026 BMW Fixture Model AWD 4DR Sedan 3.0 6cyl. Gasoline',3000,'Sedan',6,100,'mi'],
    [undefined,undefined,undefined,'100 mi','Gasoline','2026 BMW Fixture Model Coupe 2.0L V8 Gasoline',2000,'Coupe',8,100,'mi'],
    ['3.0 L','SUV','8','0 mi','Electric','2026 BMW Fixture Model Electric',undefined,'SUV',undefined,0,'mi'],
    ['2.5 L','Sedan','4','120 mi',undefined,'2026 BMW Fixture Model Electric Hybrid',2500,'Sedan',4,120,'mi'],
    [undefined,undefined,undefined,undefined,'Gasoline','2026 BMW Fixture Model',undefined,undefined,undefined,undefined,'mi'],
    ['2.0 L','Unverified Body','4','500 mi','Gasoline','2026 BMW Fixture Model',2000,'Unverified Body',4,500,'mi','unsupported-body'],
    ['1998 cc','Sedan','4','500 mi','Gasoline','2026 BMW Fixture Model',1998,'Sedan',4,500,'mi','unsupported-engine'],
    ['2.0 L',undefined,'4','500 mi','Gasoline','2026 BMW Fixture Model',2000,undefined,4,500,'mi','preserve-category'],
  ]
  try{
    const snapshot=new DOMParser().parseFromString(await(await fetch('/packages/parsers/tests/fixtures/myauto.html')).text(),'text/html')
    check(['engineVolume','vehicleCategory','cylinders'].every(key=>snapshot.querySelector(`[data-testid="single-select-trigger-primaryFeatures.${key}"]`))&&!!snapshot.querySelector('[name="primaryFeatures.mileage"]'),'All four selectors match the saved MyAuto form contract')
    for(const [engine,body,cylinders,odo,fuel,title,cc,category,count,miles,unit,scenario] of cases){
      doc.open();doc.write(html);doc.close();for(const node of doc.querySelectorAll('h1.description'))node.textContent=title
      field('Model','Fixture Model');field('Fuel Type',fuel);field('Displacement');field('Body Style');field('Cylinders');doc.querySelector('.odometer')!.textContent='Odometer: --'
      const baseline=parseEdgePipelineText(doc,url)
      field('Displacement',engine);field('Body Style',body);field('Cylinders',cylinders);doc.querySelector('.odometer')!.textContent=odo===undefined?'Odometer: --':'Odometer: '+odo
      const v=parseEdgePipelineText(doc,url),payload=JSON.parse(JSON.stringify(v)) as typeof v
      check(payload.engineCc===cc&&payload.body===category&&payload.cylinders===count&&payload.mileage?.value===miles&&(miles===undefined||payload.mileage?.unit===unit),'EDGE four-field extraction survives payload serialization with exact numeric values and source units')
      const unaffected=(vehicle:typeof v)=>{const copy=structuredClone(vehicle);for(const key of ['engineCc','body','bodyStyle','cylinders','mileage','mileageKm'])delete (copy as unknown as Record<string,unknown>)[key];for(const key of ['engineDisplacement','engineType','bodyStyle','odometer','odometerUnits'])delete copy.raw[key];return JSON.stringify(copy)}
      check(unaffected(v)===unaffected(baseline),'All unrelated normalized fields, identity, fuel, photos and gallery metadata remain unchanged')
      const target=document.createElement('iframe');document.body.append(target)
      try{
        const plan=myautoFields(v),categoryLabel=plan.find(item=>item.field==='body')?.optionValue?.equivalents?.[0]??category??'სედანი'
        const form=target.contentDocument!;form.open();form.write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.fixtureConfiguration='+JSON.stringify({make:v.make,model:v.model,engine:scenario==='unsupported-engine'?'2.0':String((cc??2000)/1000),cylinders:String(count??6),body:scenario==='unsupported-body'?'სედანი':categoryLabel,mileageUnit:unit,pointerOnly:true})+'</script><script src="/edge-spec-react.js"></script></body></html>');form.close()
        const win=target.contentWindow as Window&{fixtureState?:{values:Record<string,string>;selected:Record<string,{id:string;label:string}>;renders:number;uploads:number};fixtureForceRender?:()=>void}
        await wait(()=>!!win.fixtureState)
        if(scenario==='preserve-category')await fillMyautoForm(form,{...v,body:'Sedan'},{onlyFields:['body'],dropdownTimeoutMs:300})
        const initial=win.fixtureState!.selected.vehicleCategory?.id
        const results=await fillMyautoForm(form,payload,{onlyFields:['make','model','engineCc','body','mileageKm','cylinders'],dropdownTimeoutMs:300})
        const before=win.fixtureState!.renders;form.querySelector<HTMLButtonElement>('#fixture-other-field')!.click();win.fixtureForceRender!();await wait(()=>win.fixtureState!.renders>before)
        const actual=win.fixtureState!,expectedMileage=miles===undefined?'':String(miles)
        check(actual.values.mileage===expectedMileage&&form.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value===expectedMileage&&actual.selected.mileageType.label===(unit==='mi'?'მილი':'კმ'),'Exact mileage and unit survive dependent make/model selection and final React rerender')
        check(count===undefined?!actual.selected.cylinders:actual.selected.cylinders?.id==='fixture-cylinders'&&Number(actual.selected.cylinders.label)===count,'Numeric cylinder option persists; EV/missing cylinders remain empty')
        check(cc===undefined||scenario==='unsupported-engine'?!actual.selected.engineVolume:actual.selected.engineVolume?.id==='fixture-engineVolume'&&Number(actual.selected.engineVolume.label)*1000===cc,'Exact engine option persists without double conversion or unrelated substitution')
        check(scenario==='preserve-category'?actual.selected.vehicleCategory?.id===initial:category===undefined||scenario==='unsupported-body'?!actual.selected.vehicleCategory:actual.selected.vehicleCategory?.id==='fixture-vehicleCategory'&&actual.selected.vehicleCategory.label===categoryLabel,'Supported category selects the actual offered ID; missing/manual/unsupported categories remain protected')
        const verified=await verifyMyautoPersistence(form,payload,results,plan,undefined,['engineCc','body','mileageKm','cylinders'])
        const expectedFields=[...(cc!==undefined&&scenario!=='unsupported-engine'?['engineCc']:[]),...(category!==undefined&&scenario!=='unsupported-body'?['body']:[]),...(count!==undefined?['cylinders']:[]),...(miles!==undefined?['mileageKm']:[])]
        check(expectedFields.every(key=>verified.some(result=>result.key===key&&result.status==='filled'&&result.persisted)),'All supported four-field selections pass unchanged shared final verification; unresolved fields do not block independent values')
        check(actual.values.description===''&&actual.values.vin===''&&actual.uploads===0,'Four-field form verification invokes no photos or unrelated text writes')
      }finally{target.remove()}
    }
    doc.open();doc.write(html);doc.close();field('Model','Fixture Model');field('Body Style');field('Vehicle Category','Sedan');field('Odometer Reading','100 mi')
    const api={runtime:{sendMessage:async()=>({ok:true,value:true})}} as unknown as ExtensionApi
    const prepared=new EdgePreparation(doc,api,()=>url)
    try{
      const first=await prepared.resolve()
      field('Vehicle Category','SUV');field('Odometer Reading','0 miles')
      check(!prepared.verify(first.preparationId),'EDGE targeted category/odometer label changes invalidate stale text snapshots')
      const next=await prepared.resolve()
      check(next.vehicle.body==='SUV'&&next.vehicle.mileage?.value===0&&next.vehicle.mileage.unit==='mi','EDGE refreshed transfer snapshot includes the latest category and explicit zero odometer without changing photo logic')
    }finally{prepared.dispose()}
    doc.open();doc.write(html);doc.close();field('Model','SUV Edition');field('Body Style');for(const node of doc.querySelectorAll('h1.description'))node.textContent='2026 BMW SUV Edition 2.0L V6 Gasoline'
    check(parseEdgePipelineText(doc,url).body===undefined,'A body word inside the independently identified model is not guessed as category')
    field('Model','Fixture Model');for(const node of doc.querySelectorAll('h1.description'))node.textContent='2026 BMW Fixture Model Coupe Edition 2.0L V6 Gasoline'
    check(parseEdgePipelineText(doc,url).body===undefined,'An ambiguous unverified trim name is not substituted for vehicle category')
    field('Odometer Reading','66 (Actual) 774')
    check(parseEdgePipelineText(doc,url).mileage===undefined,'An odometer status between separate numbers is not used to fabricate a merged reading')
  }finally{source.remove()}
}
