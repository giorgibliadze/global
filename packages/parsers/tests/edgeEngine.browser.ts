import {parseEdgePipelineText} from '../src/edge/index'
import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
export async function runEdgeEngineTests(check:(value:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/edge-gasoline.html')).text(),url='https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32)
  const source=document.createElement('iframe');document.body.append(source);const doc=source.contentDocument!
  const field=(name:string,value:string|undefined)=>{let row=[...doc.querySelectorAll('.section.details .field')].find(row=>row.querySelector('label')?.textContent===name);if(value===undefined){row?.remove();return}if(!row){row=doc.createElement('div');row.className='field';const label=doc.createElement('label');label.textContent=name;row.append(label,doc.createElement('span'));doc.querySelector('.section.details')!.append(row)}row.querySelector('span')!.textContent=value}
  const wait=async(predicate:()=>boolean)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('EDGE engine React fixture timeout')}
  const regular='2026 BMW Fixture AWD 2 Door Coupe 6cyl. Gasoline'
  const cases:[string,string|undefined,number|undefined,string?,string?][]=[
    ...[1.5,2,2.5,3,3.5,5].map(liters=>[regular,liters.toFixed(1)+' L',liters*1000] as [string,string,number]),
    [regular,'1998 cc',1998],
    [regular,'2.0L Turbo',2000],
    [regular,'3.0',3000],
    ['2013 BMW 1-Series 128i RWD 2D Coupe 3.0 6cyl. Gasoline',undefined,3000],
    ['2020 Toyota Camry 2.5 4cyl. Gasoline',undefined,2500],
    ['2021 Ford Mustang GT 5.0 V8 Gasoline',undefined,5000],
    ['2026 BMW Fixture 2.0L Turbo',undefined,2000],
    ['2026 BMW Fixture 3.0 6cyl. Gasoline','1998 cc',1998],
    ['2026 BMW Fixture Electric','3.0 L',undefined,'Electric'],
    ['2026 BMW Fixture Electric',undefined,undefined,'Electric'],
    ['2026 BMW Fixture Hybrid 2.5 4cyl.','2.5 L',2500,'Hybrid'],
    ['2026 BMW 320i 3-Series xDrive30i 128i RWD 2 Door Coupe Gasoline',undefined,undefined],
    ['2026 BMW Fixture 300 hp 75 kWh 66,774 mi',undefined,undefined],
    [regular,undefined,undefined],
    [regular,'2.0 L or 3.0 L',undefined],
    // A real form offering only 2.0 cannot accept an exact 1998cc value.
    [regular,'1998 cc',1998,'Gasoline','2.0'],
  ]
  try{
    const snapshot=new DOMParser().parseFromString(await(await fetch('/packages/parsers/tests/fixtures/myauto.html')).text(),'text/html')
    check(!!snapshot.querySelector('[data-testid="single-select-trigger-primaryFeatures.engineVolume"]'),'Existing MyAuto engineVolume selector is confirmed in saved form')
    for(const [title,displacement,expected,fuel='Gasoline',option] of cases){
      doc.open();doc.write(html);doc.close();for(const node of doc.querySelectorAll('h1.description'))node.textContent=title
      field('Model','Fixture Model');field('Fuel Type',fuel);field('Displacement',undefined)
      const baseline=parseEdgePipelineText(doc,url)
      field('Displacement',displacement)
      const v=parseEdgePipelineText(doc,url)
      check(v.engineCc===expected,`EDGE engine: ${displacement??'title/missing'} → ${expected??'missing'} cc`)
      const remaining=(vehicle:typeof v)=>{const copy=structuredClone(vehicle);delete copy.engineCc;delete copy.raw.engineDisplacement;return JSON.stringify(copy)}
      check(remaining(v)===remaining(baseline),'EDGE engine extraction changes no photos, cylinders, mileage, identity or other normalized fields')
      const target=document.createElement('iframe');document.body.append(target)
      try{
        const form=target.contentDocument!;form.open();form.write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.fixtureConfiguration='+JSON.stringify({model:'Fixture Model',engine:option??String((expected??2000)/1000),pointerOnly:true,mileageUnit:'mi'})+'</script><script src="/edge-spec-react.js"></script></body></html>');form.close()
        const win=target.contentWindow as Window&{fixtureState?:{values:Record<string,string>;selected:Record<string,{label:string;id:string}>;renders:number;uploads:number};fixtureForceRender?:()=>void}
        await wait(()=>!!win.fixtureState)
        const results=await fillMyautoForm(form,v,{onlyFields:['engineCc'],dropdownTimeoutMs:150})
        const before=win.fixtureState!.renders;form.querySelector<HTMLButtonElement>('#fixture-other-field')!.click();win.fixtureForceRender!();await wait(()=>win.fixtureState!.renders>before)
        const actual=win.fixtureState!,selected=actual.selected.engineVolume
        if(expected===undefined||option){
          check(!selected&&!results.some(result=>result.status==='filled'),'EDGE missing/EV/unavailable exact displacement option remains unfilled without choosing a different engine')
        }else{
          check(selected?.id==='fixture-engineVolume'&&Number(selected.label)*1000===expected&&form.querySelector<HTMLInputElement>('[data-testid="single-select-input-primaryFeatures.engineVolume"]')!.value==='fixture-engineVolume','Existing MyAuto mapper selects the exact available liter option ID and React preserves it after focus/rerender')
          const verified=await verifyMyautoPersistence(form,v,results,myautoFields(v),undefined,['engineCc'])
          check(verified.some(result=>result.key==='engineCc'&&result.status==='filled'&&result.persisted),'Engine displacement passes unchanged shared final persistence verification')
        }
        check(actual.values.mileage===''&&actual.values.vin===''&&actual.values.description===''&&!actual.selected.cylinders&&actual.uploads===0,'Engine-only form test does not fill mileage/cylinders/other fields or invoke photos')
      }finally{target.remove()}
    }
  }finally{source.remove()}
}
