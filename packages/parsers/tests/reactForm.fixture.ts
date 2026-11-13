// Test-only, bundled into the isolated Chrome harness. No React internals are used.
import { createElement, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
interface Configuration {batchedValidation?:boolean;model:string;make?:string;year?:string;resetAfterUpload?:boolean;rejectField?:string;pointerOnly?:boolean;failFuel?:boolean}
interface Selection {label:string;id:string}
declare global {
  interface Window {
    fixtureConfiguration?:Configuration
    fixtureState?:{values:Record<string,string>;selected:Record<string,Selection|undefined>;photos:number;uploads:number;published:number;renders:number}
    fixtureOpenCounts:Record<string,number>
    fixtureFailFuel:boolean
    fixtureForceRender?:()=>void
  }
}
const config=window.fixtureConfiguration ?? {model:'M5 Touring Wagon'}
window.fixtureOpenCounts={};window.fixtureFailFuel=!!config.failFuel
function Form() {
  const [values,setValues]=useState<Record<string,string>>({vin:'',trim:'',mileage:'',description:''})
  const [drafts,setDrafts]=useState<Record<string,string>>({})
  const [selected,setSelected]=useState<Record<string,Selection|undefined>>({})
  const [open,setOpen]=useState<string|undefined>()
  const [query,setQuery]=useState('')
  const [ready,setReady]=useState(false)
  const [photos,setPhotos]=useState<string[]>([])
  const [renders,setRenders]=useState(0)
  const [uploads,setUploads]=useState(0),[published,setPublished]=useState(0),[reset,setReset]=useState(false)
  const labels:Record<string,string>={manufacturer:config.make ?? 'BMW',model:config.model,issueYear:config.year ?? '2026',fuelType:'დამუხტვადი ჰიბრიდი',engineVolume:'4.4',cylinders:'8',vehicleCategory:'უნივერსალი'}
  useEffect(()=>{if(!selected.manufacturer)return;const timer=setTimeout(()=>setReady(true),40);return()=>clearTimeout(timer)},[selected.manufacturer])
  useEffect(()=>{
    window.fixtureState={values,selected,photos:photos.length,uploads,published,renders}
    window.fixtureForceRender=()=>{setDrafts({});setRenders(value=>value+1)}
  })
  function text(key:string,name:string,textarea=false) {
    return createElement(textarea?'textarea':'input',{
      maxLength:textarea?4000:undefined,
      key,name,value:drafts[key] ?? values[key] ?? '',type:textarea?undefined:'text',
      'data-testid':key==='description'?'description-textarea':undefined,
      onChange:(event:{currentTarget:HTMLInputElement|HTMLTextAreaElement})=>{
        const value=event.currentTarget.value
        // Mileage deliberately commits only on blur, like a form/mask draft adapter.
        if((config.batchedValidation && key!=='vin') || key==='mileage' || key===config.rejectField)setDrafts(previous=>({...previous,[key]:value}))
        else setValues(previous=>({...previous,[key]:value}))
      },
      onBlur:(event:{currentTarget:HTMLInputElement|HTMLTextAreaElement})=>{
        const value=event.currentTarget.value
        if(config.batchedValidation && key!=='vin')queueMicrotask(()=>setValues({...values,[key]:value}))
        else if(key==='mileage' && key!==config.rejectField)setValues(previous=>({...previous,[key]:value}))
        setDrafts(previous=>{const copy={...previous};delete copy[key];return copy});setRenders(previous=>previous+1)
      },
    })
  }
  function dropdown(key:string) {
    const disabled=key==='model'&&!ready
    return createElement('div',{key,'data-testid':`single-select-primaryFeatures.${key}`},
      createElement('button',{type:'button',disabled,'data-testid':`single-select-trigger-primaryFeatures.${key}`,'aria-haspopup':'listbox','aria-controls':`react-options-${key}`,'aria-expanded':open===key,'aria-disabled':disabled?'true':undefined,
        onBlur:()=>setRenders(value=>value+1),onKeyDown:(event:{key:string})=>{if(event.key==='Escape')setOpen(undefined)},
        onClick:()=>{window.fixtureOpenCounts[key]=(window.fixtureOpenCounts[key] ?? 0)+1;setOpen(previous=>previous===key?undefined:key);setQuery('')},
      },createElement('span',{'data-testid':`single-select-value-primaryFeatures.${key}`},selected[key]?.label ?? '')),
      createElement('input',{type:'hidden',readOnly:true,value:selected[key]?.id ?? '','data-testid':`single-select-input-primaryFeatures.${key}`}),
      open===key && createElement('input',{type:'search',role:'searchbox',value:query,'data-testid':`single-select-search-primaryFeatures.${key}`,onChange:(event:{currentTarget:HTMLInputElement})=>setQuery(event.currentTarget.value)}),
    )
  }
  const options=open?createPortal(createElement('div',{role:'listbox',id:`react-options-${open}`},
    !(open==='fuelType' && window.fixtureFailFuel) && labels[open].toLowerCase().includes(query.toLowerCase()) && createElement('button',{type:'button',role:'option','data-value':`fixture-${open}`,onPointerDown:(event:{currentTarget:HTMLButtonElement})=>{event.currentTarget.dataset.fixturePointer='true'},onClick:(event:{currentTarget:HTMLButtonElement})=>{
      if(config.pointerOnly && event.currentTarget.dataset.fixturePointer!=='true')return
      delete event.currentTarget.dataset.fixturePointer
      const key=open
      if(key==='manufacturer')setReady(false)
      setSelected(previous=>({...previous,[key]:{label:labels[key],id:`fixture-${key}`},...(key==='manufacturer'?{model:undefined}:{})}));setOpen(undefined)
    }},labels[open])),document.body):null
  const choices=[['gearTypeId','2'],['driveTypeId','3'],['vehicleColorId','19'],['saloonColorId','16'],['saloonMaterialId','1']].map(([key,id])=>createElement('button',{type:'button',key,'data-testid':`single-checkbox-primaryFeatures.${key}-${id}`,onClick:()=>setSelected(previous=>({...previous,[key]:{label:id,id}}))},createElement('input',{type:'hidden',readOnly:true,value:selected[key]?.id ?? '','data-testid':`single-checkbox-input-primaryFeatures.${key}-${id}`})))
  return createElement('form',{onSubmit:(event:{preventDefault:()=>void})=>{event.preventDefault();setPublished(value=>value+1)}},
    text('vin','primaryFeatures.vinCode'),...Object.keys(labels).map(dropdown),text('trim','primaryFeatures.customModel'),text('mileage','primaryFeatures.mileage'),
    createElement('span',{'data-testid':'single-select-value-primaryFeatures.mileageType'},'კმ'),text('description','description',true),...choices,
    createElement('div',{'data-testid':'photo-video-container'},createElement('span',{className:'fixture-photo-count'},`ფოტო ${photos.length}/15`),
      createElement('div',{'data-testid':'photo-video-dropzone'},createElement('input',{type:'file',multiple:true,onChange:(event:{currentTarget:HTMLInputElement})=>{
        const files=event.currentTarget.files;if(!files)return
        setUploads(value=>value+1);setPhotos([...files].map(file=>file.name));setDrafts({})
        if(config.resetAfterUpload && !reset){setReset(true);setValues(previous=>({...previous,mileage:''}));setSelected(previous=>({...previous,engineVolume:undefined}))}
      }})),...photos.map(name=>createElement('img',{key:name,src:'https://cdn.example.test/'+name,alt:''}))),
    createElement('button',{type:'button',id:'fixture-other-field',onClick:()=>{setDrafts({});setRenders(value=>value+1)}},'სხვა ველი'),
    createElement('button',{type:'submit',id:'fixture-publish'},'გამოქვეყნება'),options,
  )
}
const host=document.createElement('div');host.id='fixture-react-form';document.body.replaceChildren(host)
createRoot(host).render(createElement(Form))
