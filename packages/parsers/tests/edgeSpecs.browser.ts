import {parseEdgePipelineText} from '../src/edge/index'
import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
export async function runEdgeSpecTests(check:(value:unknown,label:string)=>void,a:string,b:string,urlA:string,urlB:string){
  const source=document.createElement('iframe');document.body.append(source);const doc=source.contentDocument!
  const load=(html:string)=>{doc.open();doc.write(html);doc.close()}
  const field=(name:string,value:string|undefined)=>{let node=[...doc.querySelectorAll('.section.details .field')].find(node=>node.querySelector('label')?.textContent===name);if(value===undefined){node?.remove();return}if(!node){node=doc.createElement('div');node.className='field';const label=doc.createElement('label');label.textContent=name;node.append(label,doc.createElement('span'));doc.querySelector('.section.details')!.append(node)}node.querySelector('span')!.textContent=value}
  const vehicle=(title:string,cylinder:string|undefined,odo:string|undefined,electric=false,fuel?:string)=>{
    load(electric?b:a);for(const node of doc.querySelectorAll('h1.description'))node.textContent=title
    field('Model','Fixture Model');field('Cylinders',cylinder);if(fuel)field('Fuel Type',fuel)
    const node=doc.querySelector('.overview .odometer')!;if(odo===undefined)node.remove();else node.textContent='Odometer: '+odo
    return parseEdgePipelineText(doc,electric?urlB:urlA)
  }
  const title='2013 BMW 1-Series 128i RWD 2D Coupe 3.0 6cyl. Gasoline'
  const wait=async(test:()=>boolean)=>{for(let i=0;i<200;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('EDGE specification React fixture timeout')}
  try{
    for(const [text,count] of [['4cyl.',4],['6cyl.',6],['8cyl.',8],['4 cyl',4],['6-cylinder',6],['V6',6],['V8',8],['I4',4],['L4',4],['H4',4],['Flat-6',6]] as const){
      check(vehicle(`2021 Ford Mustang GT 5.0 ${text} Gasoline`,undefined,'120,500').cylinders===count,`EDGE cylinders: title ${text} maps to numeric ${count}`)
    }
    check(vehicle(title,'8','66,774 (Actual)').cylinders===8,'EDGE independently labeled numeric cylinders take precedence over title')
    check(vehicle(title,'V8','66,774 (Actual)').cylinders===8,'EDGE structured cylinder layout is recognized before title fallback')
    for(const text of ['3.0','2.5','128i','V6 4cyl.','2.5cyl.','i4'])check(vehicle('2020 BMW '+text+' Gasoline',undefined,'0').cylinders===undefined,'EDGE unknown/ambiguous cylinders and displacement/model numbers never become guessed counts')
    const cases=[
      {title:'2020 Toyota Camry 2.5 4cyl. Gasoline',cylinder:undefined,odo:'66,774 (Actual)',count:4,miles:66774},
      {title,cylinder:undefined,odo:'120,500',count:6,miles:120500},
      {title:'2021 Ford Mustang GT 5.0 V8 Gasoline',cylinder:undefined,odo:'8,250 (Exempt)',count:8,miles:8250},
      {title:'2020 Toyota Camry Hybrid 2.5 4cyl.',cylinder:'4 Cylinder',odo:'12,000 km',count:4,miles:12000,unit:'km',fuel:'Hybrid'},
      {title:'2024 Tesla Cybertruck CyberBeast AWD 4 Door Pickup Truck Electric',cylinder:'8',odo:'0',count:undefined,miles:0,electric:true},
      {title:'2020 BMW Fixture 2.5 Gasoline',cylinder:undefined,odo:undefined,count:undefined,miles:undefined},
    ]
    for(const value of ['66, 774 (Actual)','66 774 (Actual)','  66,774   (Actual)  '])check(vehicle(title,undefined,value).mileage?.value===66774,'EDGE odometer removes separators, extra spacing and source status without conversion')
    for(const value of ['--','?','','not reported','66,77','-1','3.0','Price: 120500','Run 123 2013','66,774 (Actual) VIN 123'])check(vehicle(title,undefined,value).mileage===undefined,'EDGE invalid/missing odometer never reads unrelated numbers')
    let parsed=vehicle(title,undefined,'66,774 (Actual)');field('Odometer','8,250 (Exempt)');parsed=parseEdgePipelineText(doc,urlA)
    check(parsed.mileage?.value===8250&&parsed.mileage.unit==='mi','EDGE structured labeled odometer takes precedence over scoped DOM fallback')
    check(vehicle(title,undefined,'12,000 km').mileage?.unit==='km','EDGE existing explicit kilometer unit remains unchanged; no conversion')
    const formSnapshot=new DOMParser().parseFromString(await(await fetch('/packages/parsers/tests/fixtures/myauto.html')).text(),'text/html')
    check(!!formSnapshot.querySelector('[name="primaryFeatures.mileage"]')&&!!formSnapshot.querySelector('[data-testid="single-select-trigger-primaryFeatures.cylinders"]'),'EDGE two-field mapping uses selectors confirmed by saved MyAuto form')
    for(const entry of cases){
      const v=vehicle(entry.title,entry.cylinder,entry.odo,entry.electric,entry.fuel)
      check(v.cylinders===entry.count&&v.mileage?.value===entry.miles&&(entry.miles===undefined||v.mileage?.unit===(entry.unit??'mi')),`EDGE normalized cylinders/mileage: ${entry.count??'missing'} / ${entry.miles??'missing'} Miles`)
      const target=document.createElement('iframe');document.body.append(target)
      try{
        const form=target.contentDocument!;form.open();form.write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.fixtureConfiguration='+JSON.stringify({model:'Fixture Model',cylinders:String(entry.count??6),mileageUnit:entry.unit??'mi',pointerOnly:true})+'</script><script src="/edge-spec-react.js"></script></body></html>');form.close()
        const win=target.contentWindow as Window&{fixtureState?:{values:Record<string,string>;selected:Record<string,{id:string;label:string}>;renders:number};fixtureForceRender?:()=>void}
        await wait(()=>!!win.fixtureState)
        const results=await fillMyautoForm(form,v,{onlyFields:['cylinders','mileageKm'],dropdownTimeoutMs:400})
        const renders=win.fixtureState!.renders
        form.querySelector<HTMLButtonElement>('#fixture-other-field')!.click();win.fixtureForceRender!()
        await wait(()=>win.fixtureState!.renders>renders)
        const actual=win.fixtureState!,miles=entry.miles===undefined?'':String(entry.miles)
        check(form.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value===miles&&actual.values.mileage===miles&&actual.selected.mileageType.label===(entry.unit==='km'?'კმ':'მილი')&&(entry.count===undefined?!actual.selected.cylinders:actual.selected.cylinders?.id==='fixture-cylinders'&&actual.selected.cylinders.label===String(entry.count)),'EDGE shared mapper fills exact numeric mileage/Miles and cylinder option ID in real React state; both persist after rerender/focus change')
        const verified=await verifyMyautoPersistence(form,v,results,myautoFields(v),undefined,['cylinders','mileageKm'])
        check(verified.filter(result=>(result.key==='cylinders'&&entry.count!==undefined)||(result.key==='mileageKm'&&entry.miles!==undefined)).every(result=>result.status==='filled'&&result.persisted),'EDGE populated specifications pass unchanged shared persistence verification')
        check(actual.values.vin===''&&actual.values.description===''&&!actual.selected.manufacturer,'EDGE two-field regression touches no other form fields')
      }finally{target.remove()}
    }
  }finally{source.remove()}
}
