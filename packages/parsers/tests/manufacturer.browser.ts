import {parseManheim24} from '../src/manheim24'
import {parseManheim24Search} from '../src/manheim24Search'
import {parseSearchManheim} from '../src/searchManheim'
import {parseSiteManheim} from '../src/siteManheim'
import {parseEdgePipelineText} from '../src/edge/index'
import {fillMyautoForm,myautoFields,verifyMyautoPersistence} from '../src/myauto'
import {manufacturerOptionLabel,manufacturerPrefix,sameManufacturer} from '../src/myautoCatalog'
import {optionRank} from '../src/dropdowns'
export async function runManufacturerTests(check:(value:unknown,label:string)=>void,group:string){
  check(!sameManufacturer('?','?')&&!sameManufacturer('Not Available','Not Available'),'Missing manufacturer placeholders are never accepted as real makes')
  check(manufacturerOptionLabel('GM')===undefined&&!sameManufacturer('GM','GMC')&&!sameManufacturer('Rover','Land Rover'),'Ambiguous GM and distinct Rover/Land Rover manufacturers are never substituted')
  check(manufacturerPrefix('Mercedes Benz E-Class','Mercedes')?.length===14,'Longest verified manufacturer alias removes only the actual make prefix')
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),search=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text(),edge=await(await fetch('/packages/parsers/tests/fixtures/edge-gasoline.html')).text()
  let source=document.createElement('iframe');document.body.append(source);let doc=source.contentDocument!
  const fresh=(html:string)=>{source.remove();source=document.createElement('iframe');document.body.append(source);doc=source.contentDocument!;doc.open();doc.write(html);doc.close()}
  const sources=[
    {name:'Manheim Search',group:'manheim',html:search,parse:()=>parseSearchManheim(doc,'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE')},
    {name:'Manheim Site modern',group:'manheim',html:search,parse:()=>parseSiteManheim(doc,'https://site.manheim.com/results#/details/SALKZ9F90RA229948/OVE')},
    {name:'Manheim Site legacy',group:'manheim',html:legacy,parse:()=>parseSiteManheim(doc,'https://site.manheim.com/vehicle/detail/fixture')},
    {name:'Manheim24',group:'manheim24',html:legacy,parse:()=>parseManheim24(doc)},
    {name:'Manheim24 Search',group:'manheim24',html:legacy,parse:()=>parseManheim24Search(doc,'https://search.manheim24.com/results#/details/1HGCM82633A004352/OVE')},
    {name:'EDGE',group:'edge',html:edge,parse:()=>parseEdgePipelineText(doc,'https://www.edgepipeline.com/components/vehicle/detail/'+'a'.repeat(32))},
  ].filter(source=>source.group===group)
  const wait=async(predicate:()=>boolean)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('Manufacturer React verification timeout')}
  try{for(const platform of sources){
    for(const [raw,display,option] of [['bMw','BMW','BMW'],['Mercedes','Mercedes Benz','Mercedes-Benz'],['Mercedes  Benz','Mercedes-Benz','Mercedes Benz'],['VW','Volkswagen','Volkswagen'],['Volkswagen','VW','VW'],['Chevy','Chevrolet','Chevrolet'],['LandRover','Land Rover','Land-Rover'],['Škoda','Skoda','Skoda'],['New Brand','New Brand','New Brand']]){
      fresh(platform.html);const baseline=platform.parse();fresh(platform.html)
      const replace=(text:string)=>text.replace(' '+baseline.make+' ',' '+display+' ')
      const json=doc.querySelector('.StockWaveInfo')
      if(json){const data=JSON.parse(json.textContent!);data.make=display;data.designatedDescriptionEnrichment.make=raw;const standard=data.designatedDescriptionEnrichment.manheimStandardDescription;if(standard?.shortDescription)standard.shortDescription=replace(standard.shortDescription);json.textContent=JSON.stringify(data);for(const node of doc.querySelectorAll('[data-testid="vdp-title-text"]'))node.textContent=replace(node.textContent!)}
      else {for(const node of doc.querySelectorAll('h1.description'))node.textContent=replace(node.textContent!);const row=doc.createElement('div');row.className='field';const label=doc.createElement('label');label.textContent='Manufacturer';const value=doc.createElement('span');value.textContent=raw;row.append(label,value);doc.querySelector('.section.details')!.append(row)}
      const v=platform.parse(),expectedMake=platform.group==='edge'?raw.replace(/\s+/g,' '):raw
      check(v.make===expectedMake&&v.original.manufacturer===v.make,`${platform.name}: original source make retained while case/spacing/aliases validate`)
      const keys=['model','fullModelName','baseModel','trim','year','vin','listingId','body','bodyStyle','engineCc','cylinders','fuel','transmission','drivetrain','doorCount','steeringWheel','mileage','mileageKm','exteriorColor','interiorColor','interiorMaterial','images','availableImageCount','equipment'] as const
      const changed=keys.filter(key=>JSON.stringify(v[key])!==JSON.stringify(baseline[key]));check(!changed.length,`${platform.name}: complete model, all other fields and photos remain exactly unchanged (${changed.join(',')})`)
      const make=myautoFields(v).find(field=>field.field==='make')!
      check(Number.isFinite(optionRank(option,make.optionValue!)),`${platform.name}: offered manufacturer is an exact or verified equivalent option`)
      const target=document.createElement('iframe');document.body.append(target)
      try{
        const fields=myautoFields(v),body=fields.find(field=>field.field==='body'),form=target.contentDocument!
        form.open();form.write('<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.fixtureConfiguration='+JSON.stringify({make:option,model:v.model,engine:String((v.engineCc??2000)/1000),cylinders:String(v.cylinders??6),body:body?.optionValue?.equivalents?.[0]??v.body,mileageUnit:v.mileage?.unit??'mi',pointerOnly:true})+'</script><script src="/edge-spec-react.js"></script></body></html>');form.close()
        const win=target.contentWindow as Window&{fixtureState?:{values:Record<string,string>;selected:Record<string,{id:string;label:string}>;renders:number;uploads:number};fixtureForceRender?:()=>void}
        await wait(()=>!!win.fixtureState)
        const results=await fillMyautoForm(form,v,{onlyFields:['make','model','engineCc','body','mileageKm','cylinders'],dropdownTimeoutMs:400})
        const before=win.fixtureState!.renders;form.querySelector<HTMLButtonElement>('#fixture-other-field')!.click();win.fixtureForceRender!();await wait(()=>win.fixtureState!.renders>before)
        const actual=win.fixtureState!
        check(actual.selected.manufacturer?.id==='fixture-manufacturer'&&actual.selected.manufacturer.label===option&&actual.selected.model?.id==='fixture-model'&&actual.selected.model.label===baseline.model,`${platform.name}: actual offered make ID persists and dependent full model loads unchanged`)
        const verified=await verifyMyautoPersistence(form,v,results,fields,undefined,['make','model','engineCc','body','mileageKm','cylinders'])
        check(['make','model',...(v.engineCc!==undefined?['engineCc']:[]),...(v.cylinders!==undefined?['cylinders']:[]),...(v.mileage?['mileageKm']:[]),...(v.body?['body']:[])].every(key=>verified.some(result=>result.key===key&&result.status==='filled'&&result.persisted)),`${platform.name}: manufacturer/model and existing supported fields survive final React verification`)
        check(actual.uploads===0&&actual.values.description===''&&v.make===expectedMake,`${platform.name}: no photos or unrelated descriptions touched; source make never rewritten`)
      }finally{target.remove()}
    }
    fresh(platform.html);const json=doc.querySelector('.StockWaveInfo')
    if(json){const data=JSON.parse(json.textContent!);data.make='Ford';data.designatedDescriptionEnrichment.make='Chevrolet';json.textContent=JSON.stringify(data)}
    else {const row=doc.createElement('div');row.className='field';row.innerHTML='<label>Manufacturer</label><span>Ford</span>';doc.querySelector('.section.details')!.append(row)}
    let rejected=false;try{platform.parse()}catch{rejected=true}check(rejected,`${platform.name}: conflicting manufacturers remain unsafe and are not guessed`)
    fresh(platform.html);const missing=doc.querySelector('.StockWaveInfo')
    if(missing){const data=JSON.parse(missing.textContent!);delete data.make;delete data.designatedDescriptionEnrichment.make;missing.textContent=JSON.stringify(data)}
    else for(const node of doc.querySelectorAll('h1.description'))node.textContent=node.textContent!.replace(' BMW ',' Unknown Maker ')
    rejected=false;try{platform.parse()}catch{rejected=true}check(rejected,`${platform.name}: absent reliable manufacturer never produces a fallback guess`)
  }}finally{source.remove()}
}
