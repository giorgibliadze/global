// Reconstructed from public MyAuto handlers, not authenticated HTML/session data.
// The optional test runner supplies MyAuto's actual public React Hook Form module.
import {createElement as h,useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {useForm,useController,useWatch,FormProvider} from 'virtual:myauto-rhf'
const config=window.fixtureConfiguration ?? {model:'M5 Touring Wagon'}
const ids:Record<string,string>={listingLocation:'fixture-location',manufacturer:'fixture-manufacturer',model:'fixture-model',issueYear:'fixture-issueYear',fuelType:'fixture-fuelType',engineVolume:'fixture-engineVolume',cylinders:'fixture-cylinders',vehicleCategory:'fixture-vehicleCategory'}
const labels:Record<string,string>={listingLocation:config.locationLabel??'აშშ',manufacturer:config.make??'BMW',model:config.model,issueYear:config.year??'2026',fuelType:config.fuel??'დამუხტვადი ჰიბრიდი',engineVolume:config.engine??'4.4',cylinders:config.cylinders??'8',vehicleCategory:config.body??'უნივერსალი'}
if(config.mileageUnit){ids.mileageType='fixture-mileage-'+config.mileageUnit;labels.mileageType=config.mileageUnit==='mi'?'მილი':'კმ'}
window.fixtureOpenCounts={};window.fixtureFailFuel=!!config.failFuel
function Text({name}:{name:string}){
  const {field}=useController({name,defaultValue:''})
  return h('input',{...field,type:'text',inputMode:name.endsWith('mileage')?'numeric':undefined,onChange:(event:{target:HTMLInputElement})=>{
    if(name.endsWith('mileage'))Object.assign(event.target,{value:String(Number.isNaN(parseInt(event.target.value))?'':parseInt(event.target.value)).slice(0,6)})
    field.onChange(event)
  }})
}
function Select({name,disabled}:{name:string;disabled?:boolean}){
  const formName=name==='listingLocation'?'location.location':'primaryFeatures.'+name
  const {field}=useController({name:formName,defaultValue:null})
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[opens,setOpens]=useState(0)
  useEffect(()=>{window.fixtureOpenCounts={...window.fixtureOpenCounts,[name]:opens}},[name,opens])
  const selected=field.value as {id:string;title:string}|null
  if(name==='fuelType'&&window.fixtureFailFuel)return null
  const item=(name!=='fuelType' || !window.fixtureFailFuel) && labels[name].toLowerCase().includes(query.toLowerCase())
  return h('div',{'data-testid':'single-select-'+formName,className:disabled?'pointer-events-none':''},
    h('div',{'data-testid':'single-select-trigger-'+formName,onClick:()=>{setOpens(value=>value+1);setOpen(!open)}},
      h('input',{onBlur:field.onBlur,ref:field.ref,'data-testid':'single-select-input-'+formName,className:'opacity-0 pointer-events-none'}),
      h('span',{'data-testid':'single-select-value-'+formName,className:selected?'pt-[6px]':''},selected?.title ?? ''),
      h('input',{'data-testid':'single-select-search-'+formName,type:open?'text':'hidden',value:query,onInput:(event:{currentTarget:HTMLInputElement})=>setQuery(event.currentTarget.value)}),
      selected && name!=='mileageType' && h('span',{'data-testid':'single-select-clear-'+formName,onClick:(event:{stopPropagation:()=>void})=>{event.stopPropagation();field.onChange(null)}},'×'),name==='mileageType'&&h('span',{'data-testid':'single-select-dropdown-arrow-'+formName})),
    open && h('div',{'data-testid':'single-select-dropdown-'+formName},item?h('div',{'data-testid':'single-select-option-'+formName+'-'+ids[name],onClick:()=>{field.onChange({id:ids[name],title:labels[name]});setOpen(false);setQuery('')}},labels[name]):h('li',{'data-testid':'single-select-no-data-'+formName},'მონაცემები ვერ მოიძებნა')))
}
function Choices({name,id}:{name:string;id:string}){
  const {field}=useController({name:'primaryFeatures.'+name})
  return h('div',{'data-testid':`single-checkbox-primaryFeatures.${name}-${id}`,className:String(field.value)===id?'border-[#02cc59] bg-[#02cc59]/10':'border-[#e2e5eb]',onClick:()=>field.onChange(id)},h('input',{ref:field.ref,onBlur:field.onBlur,className:'opacity-0 pointer-events-none','data-testid':`single-checkbox-input-primaryFeatures.${name}-${id}`}))
}
function Description(){
  const {field}=useController({name:'primaryFeatures.description',defaultValue:{ka:'',en:'',ru:''}})
  const values=field.value as Record<string,string>
  return h('div',null,h('button',{type:'button','data-testid':'description-locale-tab-ka','aria-pressed':'true'},'ქართული'),h('textarea',{ref:field.ref,value:values.ka,maxLength:4000,'data-testid':'description-textarea',onBlur:field.onBlur,onChange:(event:{currentTarget:HTMLTextAreaElement})=>field.onChange({...values,ka:event.currentTarget.value.slice(0,4000)})}))
}
function Form(){
  const methods=useForm({defaultValues:{sale:{isNegotiablePrice:false,price:''},primaryFeatures:{vinCode:'',mileage:'',customModel:'',manufacturer:null,model:null,mileageType:config.mileageUnit?{id:'fixture-km',title:'კმ'}:undefined,description:{ka:'',en:'',ru:''}}}})
  const values=useWatch({control:methods.control}) as {primaryFeatures:Record<string,unknown>;sale?:{isNegotiablePrice?:boolean}}
  useEffect(()=>{if(values.sale?.isNegotiablePrice)methods.setValue('sale.price','')},[values.sale?.isNegotiablePrice,methods])
  const [ready,setReady]=useState(false),[modelReady,setModelReady]=useState(false),[renders,setRenders]=useState(0),[photos,setPhotos]=useState<string[]>([]),[uploads,setUploads]=useState(0),[published,setPublished]=useState(0),[reset,setReset]=useState(false)
  const manufacturer=(values.primaryFeatures.manufacturer as {id?:string}|null)?.id
  useEffect(()=>{const timer=setTimeout(()=>setReady(true),500);return()=>clearTimeout(timer)},[])
  useEffect(()=>{methods.setValue('primaryFeatures.model',null);const timer=setTimeout(()=>setModelReady(!!manufacturer),40);return()=>clearTimeout(timer)},[manufacturer,methods])
  useEffect(()=>{
    const current=methods.getValues().primaryFeatures as Record<string,unknown>
    window.fixtureState={values:{locationId:String((methods.getValues().location as {location?:{id:string}}|undefined)?.location?.id??''),steeringWheel:String(current.wheelTypeId??''),doorCount:String(current.doorTypeId??''),negotiable:String((methods.getValues().sale as {isNegotiablePrice:boolean}).isNegotiablePrice),transmission:String(current.gearTypeId??''),drivetrain:String(current.driveTypeId??''),exteriorColor:String(current.vehicleColorId??''),interiorColor:String(current.saloonColorId??''),interiorMaterial:String(current.saloonMaterialId??''),vin:String(current.vinCode??''),trim:String(current.customModel??''),mileage:String(current.mileage??''),description:(current.description as Record<string,string>).ka},selected:Object.fromEntries(Object.keys(ids).filter(key=>key!=='listingLocation').map(key=>[key,current[key]?{id:(current[key] as {id:string}).id,label:(current[key] as {title:string}).title}:undefined])),photos:photos.length,uploads,published,renders}
    window.fixtureForceRender=()=>setRenders(value=>value+1)
  })
  return h(FormProvider,{...methods},h('form',{onSubmit:(event:{preventDefault:()=>void})=>{event.preventDefault();setPublished(value=>value+1)},style:ready?{}:{visibility:'hidden',pointerEvents:'none'}},
    h('label',{'data-testid':'toggle-checkbox-label-sale.isNegotiablePrice'},h('input',{type:'checkbox',defaultChecked:false,...methods.register('sale.isNegotiablePrice')}),'ფასი შეთანხმებით'),h(Text,{name:'sale.price'}),
    h(Text,{name:'primaryFeatures.vinCode'}),h(Text,{name:'primaryFeatures.mileage'}),h(Text,{name:'primaryFeatures.customModel'}),h(Description),
    ...Object.keys(labels).map(name=>h(Select,{key:name,name,disabled:name==='model'&&!modelReady})),
    !config.mileageUnit&&h('span',{'data-testid':'single-select-value-primaryFeatures.mileageType'},'კმ'),
    ...[['wheelTypeId','0'],['wheelTypeId','1'],['doorTypeId','1'],['doorTypeId','2'],['doorTypeId','4'],['gearTypeId','2'],['driveTypeId','3'],['vehicleColorId','19'],['saloonColorId','16'],['saloonMaterialId','1']].map(([name,id])=>h(Choices,{key:name+'-'+id,name,id})),
    h('div',{'data-testid':'photo-video-container'},h('span',{className:'fixture-photo-count','data-testid':'photo-video-label'},`ფოტო ${photos.length}/15`),h('div',{'data-testid':'photo-video-dropzone'},h('input',{type:'file',multiple:true,onChange:(event:{currentTarget:HTMLInputElement})=>{setUploads(value=>value+1);setPhotos([...event.currentTarget.files!].map(file=>file.name));if(config.resetAfterUpload&&!reset){setReset(true);methods.setValue('primaryFeatures.mileage','');methods.setValue('primaryFeatures.engineVolume',null)}}})),h('div',{'data-testid':'photo-video-gallery'},...photos.map(name=>h('div',{key:name,'data-testid':'photo-video-item-local-'+name},h('img',{'data-testid':'photo-video-image-local-'+name,src:'https://cdn.example.test/'+name}))))),
    h('button',{type:'button',id:'fixture-other-field',onClick:()=>setRenders(value=>value+1)},'სხვა ველი')))
}
const style=document.createElement('style');style.textContent='.opacity-0{opacity:0}.pointer-events-none{pointer-events:none}';document.head.append(style)
const host=document.createElement('div');document.body.replaceChildren(host);createRoot(host).render(h(Form))
