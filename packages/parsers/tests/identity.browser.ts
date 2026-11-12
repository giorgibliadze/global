import { parseManheim24 } from '../src/manheim24'
import { translateDetail, reviewDetails } from '../src/normalization'
import { matchesOption, selectDropdown } from '../src/dropdowns'
import { fillMyautoForm, myautoFields, vehicleDescription, verifyMyautoFields } from '../src/myauto'
import { TransferManager } from '../../../apps/extension/src/background/transfers'
import { IndexedPhotoStore } from '../../../apps/extension/src/photos/store'
import type { ExtensionApi, Sender } from '../../../apps/extension/src/services/extensionApi'

export async function runIdentityTests(manheim: string,myauto: string,check: (value: unknown,label: string) => void) {
  const doc = () => new DOMParser().parseFromString(manheim,'text/html')
  const element = (d:Document) => d.querySelector('.StockWaveInfo')!
  const change = (d:Document,fn:(data:Record<string,unknown>)=>void) => {const data=JSON.parse(element(d).textContent!);fn(data);element(d).textContent=JSON.stringify(data)}
  const original = parseManheim24(doc())
  check(original.make==='BMW' && original.model==='M5 Touring Wagon' && original.trim==='Base' && original.body==='Wagon' && original.original.catalogModel==='M5','exact full structured designation preserved independently of catalog model/trim/body')
  check(original.raw.models instanceof Array && original.raw.models[0]==='M5' && original.raw.structuredShortDescription==='2026 BMW M5 Touring Wagon','original catalog and full structured display evidence preserved for debugging')
  const explicitFull=doc();change(explicitFull,data=>{(data.designatedDescriptionEnrichment as Record<string,unknown>).model='M5 Touring Wagon'})
  check(parseManheim24(explicitFull).model==='M5 Touring Wagon','explicit full structured model is not shortened to the broader catalog label')
  const coarseFamily=doc();change(coarseFamily,data=>{data.models=['5 Series'];(data.designatedDescriptionEnrichment as Record<string,unknown>).model='5 Series'})
  check(parseManheim24(coarseFamily).model==='M5 Touring Wagon' && parseManheim24(coarseFamily).original.catalogModel==='5 Series','full VIN-matched structured designation is preserved even when catalog taxonomy is a broader family')
  const hidden = doc()
  const copy = hidden.querySelector('.VehicleDetails__container')!.cloneNode(true) as HTMLElement;copy.hidden=true;hidden.body.prepend(copy)
  const hiddenVin=hidden.createElement('span');hiddenVin.dataset.testid='vdp-vin';hiddenVin.style.display='none';hiddenVin.textContent='2HGCM82633A004352';hidden.querySelector('.VehicleDetails__container:not([hidden])')!.prepend(hiddenVin)
  check(parseManheim24(hidden).vin===original.vin,'hidden vehicle roots and stale hidden detail fields ignored')
  const conflicts = doc();change(conflicts,data=>{(data.designatedDescriptionEnrichment as Record<string,unknown>).vin='2HGCM82633A004352'})
  let rejected=false;try{parseManheim24(conflicts)}catch{rejected=true}check(rejected,'stale enrichment VIN cannot supply identity to a different detail vehicle')
  const absent = doc();change(absent,data=>{delete data.make;delete data.models;data.designatedDescriptionEnrichment={vin:data.vin}})
  rejected=false;try{parseManheim24(absent)}catch{rejected=true}check(rejected,'missing reliable manufacturer/model blocks transfer; title is not used as a guessed fallback')
  const numeric = doc();change(numeric,data=>{
    data.make='FIAT';data.models=['500L'];data.trims=['4.4i Black Edition'];data.sourceTrim='4.4i Black Edition';data.year='2025'
    data.designatedDescriptionEnrichment={vin:data.vin,make:'FIAT',model:'500L',trim:'4.4i Black Edition',year:2025,manheimStandardDescription:{shortDescription:'2025 FIAT 500L'}}
  });numeric.querySelector('[data-testid="vdp-title-text"]')!.textContent='2025 FIAT 500L'
  const numericVehicle=parseManheim24(numeric)
  check(numericVehicle.model==='500L' && numericVehicle.trim==='4.4i Black Edition' && numericVehicle.engineCc===4400,'numeric model/trim strings never converted as engine or mileage values')
  for(const [category,source,expected] of [
    ['fuel','Gasoline','ბენზინი'],['fuel','Diesel','დიზელი'],['fuel','Hybrid','ჰიბრიდი'],['fuel','Gasoline Plug-In Hybrid','დამუხტვადი ჰიბრიდი'],['fuel','Electric','ელექტრო'],
    ['transmission','Automatic','ავტომატიკა'],['transmission','Manual','მექანიკა'],['transmission','CVT','ვარიატორი'],
    ['drivetrain','FWD','წინა წამყვანი'],['drivetrain','RWD','უკანა წამყვანი'],['drivetrain','AWD','სრული ამძრავი'],['drivetrain','4WD','სრული ამძრავი'],
    ['color','Black','შავი'],['color','White','თეთრი'],['color','Silver','ვერცხლისფერი'],['color','Gray','ნაცრისფერი'],['color','Blue','ლურჯი'],['color','Red','წითელი'],
    ['body','Wagon','უნივერსალი'],['interior','Leather','ტყავი'],['equipment','Cornering Lights','მოსახვევის განათება'],['damage','Hail Damage','სეტყვით დაზიანება'],['note','Previous Canadian','ადრე კანადაში რეგისტრირებული'],
  ] as const) check(translateDetail(category,source).georgian===expected,`typed dictionary: ${category}/${source}`)
  const unknown=translateDetail('equipment','BMW Black Carbon Package 500L')
  check(!unknown.verified && unknown.georgian===unknown.original,'unknown package names preserved whole; no word-by-word replacement')
  const description=vehicleDescription(original)
  check(description.includes('BMW M5 Touring Wagon') && description.includes('კომპლექტაცია: Base') && description.includes('საწვავი: დამუხტვადი ჰიბრიდი') && description.includes('სალონის ფერი: შავი') && description.includes('დაუდასტურებელი თარგმანის მქონე ოფციები'),'Georgian description uses verified terminology and preserves uncertain original option names')
  check(reviewDetails(original).find(row=>row.key==='model')?.georgian==='M5 Touring Wagon','review never translates or renames vehicle model')
  check(!matchesOption('5 Series',{candidates:[original.model!]}) && !matchesOption('M5',{candidates:[original.model!]}),'catalog prefix and similar model families are not valid replacements')
  const frame=document.createElement('iframe');document.body.append(frame);const d=frame.contentDocument!;d.open();d.write(myauto);d.close()
  const makeRoot=d.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.manufacturer"]')!
  const modelRoot=d.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.model"]')!
  let wrongClicks=0
  function options(root:HTMLElement,values:Array<[string,string]>) {
    const trigger=root.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
    trigger.onclick=()=>{
      const old=root.querySelector('[role="listbox"]');if(old)old.remove()
      const menu=d.createElement('div');menu.setAttribute('role','listbox')
      for(const [label,id] of values){const option=d.createElement('div');option.setAttribute('role','option');option.textContent=label;option.onclick=()=>{
        if(label==='5 Series'||label==='M5')wrongClicks++
        root.querySelector<HTMLElement>('[data-testid^="single-select-value-"]')!.textContent=label
        root.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=id;menu.remove()
      };menu.append(option)}root.append(menu)
    }
  }
  options(makeRoot,[['BMW','fixture-make-id']]);options(modelRoot,[['5 Series','fixture-wrong-family'],['M5','fixture-short-model'],['M5 Touring Wagon','fixture-exact-model']])
  const vinInput=d.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!
  vinInput.addEventListener('input',()=>{
    makeRoot.querySelector('[data-testid^="single-select-value-"]')!.textContent='BMW'
    makeRoot.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value='fixture-make-id'
    modelRoot.querySelector('[data-testid^="single-select-value-"]')!.textContent='5 Series'
    modelRoot.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value='fixture-wrong-family'
  },{once:true})
  const result=await fillMyautoForm(d,original,{allowAutofillCorrection:true,dropdownTimeoutMs:200})
  check(wrongClicks===0 && result.find(r=>r.field==='მოდელი')?.optionId==='fixture-exact-model' && result.find(r=>r.field==='მწარმოებელი')?.optionId==='fixture-make-id','VIN decoder broad-model substitution corrected only to exact full model; accepted IDs recorded separately')
  check(original.model==='M5 Touring Wagon' && original.trim==='Base' && d.querySelector<HTMLInputElement>('[name="primaryFeatures.customModel"]')?.value==='Base','MyAuto accepted IDs never replace source identity; confirmed customModel field remains trim')
  modelRoot.querySelector('[data-testid^="single-select-value-"]')!.textContent='';modelRoot.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=''
  options(modelRoot,[['5 Series','wrong-family'],['M5','wrong-short-model']])
  const unresolved=await fillMyautoForm(d,original,{dropdownTimeoutMs:40})
  check(wrongClicks===0 && unresolved.find(r=>r.field==='მოდელი')?.status==='unfilled','no exact model leaves unresolved; neither unrelated option nor trim field is used as a model fallback')
  const fuel=d.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.fuelType"]')!
  options(fuel,[['ბენზინი','fixture-equivalent'],['Gasoline','fixture-exact']])
  const reason=await selectDropdown(d,'fuelType',{candidates:['Gasoline'],equivalents:['ბენზინი']},200)
  check(reason===undefined && fuel.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value==='fixture-exact','exact dropdown label takes priority over a verified equivalent')
  fuel.querySelector('[data-testid^="single-select-value-"]')!.textContent='';fuel.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=''
  options(fuel,[['დამუხტვადი ჰიბრიდი','fixture-phev']])
  const phev=myautoFields(original).find(field=>field.field==='fuel')!
  check(await selectDropdown(d,'fuelType',phev.optionValue!,200)===undefined && fuel.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value==='fixture-phev','translated description and accepted PHEV option value are kept distinct')
  const changed=verifyMyautoFields(d,original,result)
  check(changed.find(r=>r.field==='მოდელი')?.status==='unfilled','final verification notices changed label/ID after dependent controls rerender')
  frame.remove()

  let source=doc(),opens=0
  const memory:Record<string,unknown>={}
  const api={runtime:{id:'fixture'},tabs:{query:async()=>[{id:1,url:'https://home.manheim24.com/landingPage'}],sendMessage:async()=>({ok:true,vehicle:parseManheim24(source)}),create:async()=>({id:++opens+100})},storage:{session:{get:async(key:string|null)=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async(v:Record<string,unknown>)=>{Object.assign(memory,structuredClone(v))},remove:async(key:string)=>{delete memory[key]}}}} as unknown as ExtensionApi
  const manager=new TransferManager(api,new IndexedPhotoStore()),sender:Sender={id:'fixture',tab:{id:1,url:'https://home.manheim24.com/landingPage'}}
  const reviewed=await manager.review(sender)
  check(opens===0 && reviewed.vehicle.original.model==='M5 Touring Wagon','review displays reliable original identity without opening or filling MyAuto')
  source=numeric
  rejected=false;try{await manager.start(sender,reviewed.reviewId)}catch{rejected=true}
  check(rejected && opens===0,'switching vehicles after review cannot transfer previous vehicle data')
  const fresh=await manager.review(sender);const transferred=await manager.start(sender,fresh.reviewId)
  check(opens===1 && transferred.vehicle.model==='500L' && transferred.vehicle.trim==='4.4i Black Edition','new review transfers fresh exact model/trim after SPA switch')
  await manager.tabClosed(transferred.destinationTabId!)
}
