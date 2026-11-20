import type {NormalizedVehicle} from '@auto-importer/shared'
import {myautoManufacturerLabels} from '../myautoCatalog'
import {engineToCc} from '../units'
import {edgeDetailId} from './urls'
import {edgeGallery} from './gallery'
import {edgeValue as clean,normalizeEdgeVehicle} from './normalization'
const fields=(root:Element)=>{
  const values=new Map<string,string>()
  for(const node of root.querySelectorAll('.section.details .field')){const label=clean(node.querySelector(':scope > label')?.textContent),value=clean(node.querySelector(':scope > span')?.textContent);if(label&&value){if(values.has(label)&&values.get(label)!==value)throw new Error('ავტომობილის ველები ჯერ ახლდება.');values.set(label,value)}}
  return values
}
const selections=new WeakMap<Document,{id:string;vin:string;root:Element}>()
function selected(doc:Document,url=doc.URL){
  const id=edgeDetailId(url),canonical=edgeDetailId(doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content??'')
  const roots=doc.querySelectorAll('#vdp')
  if(!id||canonical!==id||roots.length!==1)throw new Error('გახსენით EDGE Pipeline-ის ავტომობილის დეტალები.')
  const root=roots[0],titles=[...root.querySelectorAll('h1.description')].map(n=>clean(n.textContent)).filter(Boolean)
  const vin=clean(root.querySelector('.overview .general-section .vin')?.textContent)?.replace(/^VIN\s*:\s*/i,'').replace(/\s/g,'')
  if(!vin||!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)||!titles.length||new Set(titles).size!==1)throw new Error('ავტომობილის საიდენტიფიკაციო მონაცემები ჯერ არ არის მზად.')
  const previous=selections.get(doc)
  if(previous&&previous.id!==id&&previous.vin===vin&&previous.root===root)throw new Error('ავტომობილის გვერდი ჯერ ახლდება.')
  selections.set(doc,{id,vin,root})
  const title=titles[0]!,values=fields(root)
  return {root,id,vin,title,values,key:JSON.stringify(['EdgePipeline',id,vin,title])}
}
export function inspectEdgeSelection(doc:Document,url=doc.URL){const {root,key}=selected(doc,url);return {root,key}}
export function inspectEdgePhotos(doc:Document,url=doc.URL){const s=selected(doc,url);return {vin:s.vin,listingId:s.id,...edgeGallery(s.root,s.id,s.vin)}}
export function parseEdgePipeline(doc:Document,url=doc.URL,textOnly=false):NormalizedVehicle{
  const s=selected(doc,url),{root,values,title,vin}=s,get=(key:string)=>values.get(key)
  const yearText=title.match(/^(\d{4})\s+/)?.[1],titleYear=yearText?Number(yearText):undefined
  const structuredYear=get('Model Year')??get('Year'),year=structuredYear&&/^\d{4}$/.test(structuredYear)?Number(structuredYear):titleYear
  const afterYear=yearText?title.slice(yearText.length).trim():''
  const structuredMake=get('Manufacturer')??get('Make')
  const make=structuredMake??[...myautoManufacturerLabels].sort((a,b)=>b.length-a.length).find(label=>afterYear.startsWith(label+' '))
  if(!make||!year||year!==titleYear||!afterYear.startsWith(make+' '))throw new Error('მწარმოებელი ან მოდელი საიმედოდ ვერ განისაზღვრა.')
  const cylindersText=get('Cylinders'),fuel=get('Fuel Type'),electric=/^electric$/i.test(fuel??'')
  const trim=get('Trim')??null,structuredModel=get('Model')
  let model=structuredModel
  if(!model){
    const remainder=afterYear.slice(make.length+1),body=get('Body Style'),drive=get('Drive Train')
    // Boundary comes from labeled metadata, not arbitrary word positions. Fuel,
    // cylinder and engine placeholders cannot prevent identifying the model.
    const boundary=body?' '+body:drive?' '+drive+' ':undefined
    const index=boundary?remainder.lastIndexOf(boundary):-1
    if(!body){model=remainder}else{
    if(index<=0)throw new Error('ავტომობილის მოდელი ვერ განისაზღვრა.')
    let designation=remainder.slice(0,index).trim()
    if(body){
      if(drive){if(!designation.endsWith(' '+drive))throw new Error('ავტომობილის მონაცემები ჯერ ახლდება.');designation=designation.slice(0,-drive.length).trim()}
      else designation=designation.replace(/\s+(?:AWD|FWD|RWD|4WD|4x4|2WD)$/i,'')
    }
    model=trim&&designation.endsWith(' '+trim)?designation.slice(0,-trim.length).trim():designation
    }
  }
  if(!model)throw new Error('ავტომობილის მოდელი ვერ განისაზღვრა.')
  const odo=clean(root.querySelector('.overview .odometer')?.textContent),match=odo?.match(/^Odometer:\s*(\d[\d,]*(?:\.\d+)?)\s*(mi|miles?|km)?$/i)
  // The user confirmed both supplied odometers are miles; explicit km wins.
  const mileage=match?{value:Number(match[1].replaceAll(',','')),unit:/^km$/i.test(match[2]??'')?'km' as const:'mi' as const}:undefined
  const interior=get('Interior Color / Material')?.split(/\s*\/\s*/),door=get('Doors'),displacement=get('Displacement')
  const raw:NormalizedVehicle['raw']={vin,make,model,year,fullModelName:model}
  for(const [key,value] of Object.entries({engineFuelType:fuel,sourceTrim:trim??undefined,odometer:mileage?.value,odometerUnits:mileage?.unit,engineDisplacement:displacement,engineType:cylindersText,transmission:get('Transmission'),driveTrain:get('Drive Train'),exteriorColor:get('Color'),interiorColor:clean(interior?.[0]),interiorType:clean(interior?.[1]),bodyStyle:get('Body Style')}))if(value!==undefined)raw[key]=value
  const photos=edgeGallery(root,s.id,vin,!textOnly),equipment=[...root.querySelectorAll('.section.options li')].map(n=>clean(n.textContent)).filter((x):x is string=>!!x).slice(0,500)
  return normalizeEdgeVehicle({source:'EdgePipeline',listingId:s.id,title,vin,make,model,fullModelName:model,baseModel:model,trim,year,original:{manufacturer:make,model,fullModelName:model,baseModel:model,trim,evidence:'selected-title'},mileage,engineCc:!electric&&displacement?engineToCc(displacement):undefined,cylinders:!electric&&cylindersText&&/^\d+$/.test(cylindersText)?Number(cylindersText):undefined,fuel,transmission:get('Transmission'),drivetrain:get('Drive Train'),body:get('Body Style')?.replace(/^\d+\s+Door\s+/i,''),bodyStyle:get('Body Style'),doorCount:door&&/^\d+$/.test(door)?Number(door):undefined,exteriorColor:get('Color'),interiorColor:clean(interior?.[0]),interiorMaterial:clean(interior?.[1]),equipment,images:textOnly||photos.galleryReady?photos.images:[],availableImageCount:photos.availableImageCount,raw,warnings:[]})
}

export const parseEdgePipelineText=(doc:Document,url=doc.URL)=>parseEdgePipeline(doc,url,true)
