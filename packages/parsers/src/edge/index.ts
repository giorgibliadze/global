import {explicitSteering} from '../mandatorySpecifications'
import type {NormalizedVehicle} from '@auto-importer/shared'
import {manufacturerPrefix,sameManufacturer} from '../myautoCatalog'
import {engineToCc} from '../units'
import {edgeDetailId} from './urls'
import {edgeGallery} from './gallery'
import {edgeValue as clean,normalizeEdgeVehicle} from './normalization'
const fields=(root:Element)=>{
  const values=new Map<string,string>()
  for(const node of root.querySelectorAll('.section.details .field')){const label=clean(node.querySelector(':scope > label')?.textContent),value=clean(node.querySelector(':scope > span')?.textContent);if(label&&value){if(values.has(label)&&values.get(label)!==value)throw new Error('ავტომობილის ველები ჯერ ახლდება.');values.set(label,value)}}
  return values
}
// EDGE-only specification readers. Other vehicle fields keep their existing path.
function cylinderCount(structured:string|undefined,title:string,fuel:string|undefined){
  if(/^(?:electric|battery electric(?: vehicle)?|fully electric|BEV)$/i.test(fuel??'')||!fuel&&/\b(?:electric|BEV)\b/i.test(title)&&!/\bhybrid\b/i.test(title))return
  const read=(text:string,allowNumber:boolean)=>{
    if(allowNumber&&/^\d{1,2}$/.test(text)){const value=Number(text);return value>=1&&value<=12?value:undefined}
    const values=new Set<number>()
    for(const match of text.matchAll(/(?<![\w.])(\d{1,2})\s*(?:-\s*)?cyl(?:inders?)?\b\.?/gi)){const value=Number(match[1]);if(value>=1&&value<=12)values.add(value)}
    // Uppercase engine layouts in titles; model designations such as 128i or
    // lowercase i4 are not cylinder evidence. Structured labels are unambiguous.
    const layouts=allowNumber?/(?<![\w.])[VILH]\s*(\d{1,2})(?![\w.])/gi:/(?<![\w.])[VILH]\s*(\d{1,2})(?![\w.])/g
    for(const match of text.matchAll(layouts)){const value=Number(match[1]);if(value>=1&&value<=12)values.add(value)}
    for(const match of text.matchAll(/(?<![\w.])Flat\s*-\s*(\d{1,2})(?![\w.])/gi)){const value=Number(match[1]);if(value>=1&&value<=12)values.add(value)}
    return values.size===1?[...values][0]:undefined
  }
  return (structured?read(structured,true):undefined)??read(title,false)
}
function odometerValue(input:string|undefined):NormalizedVehicle['mileage']{
  if(!input)return
  const text=input.replace(/^(?:Odometer Reading|Vehicle Mileage|Mileage|Odometer|Miles)\s*:\s*/i,'').replace(/\s*\([A-Za-z][A-Za-z\s-]*\)\s*(?=(?:mi|miles?|km|kilometers?|kilometres?)?\s*$)/i,' ').trim()
  const match=text.match(/^([\d][\d,\s]*?)\s*(mi|miles?|km|kilometers?|kilometres?)?$/i)
  if(!match)return
  const numeric=match[1].trim().replace(/,\s+/g,',')
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)$/.test(numeric))return
  const value=Number(numeric.replace(/[,\s]/g,''))
  if(!Number.isSafeInteger(value)||value<0)return
  return {value,unit:/^(?:km|kilometers?|kilometres?)$/i.test(match[2]??'')?'km':'mi'}
}
function displacementCc(structured:string|undefined,title:string,fuel:string|undefined){
  if(/^(?:electric|battery electric(?: vehicle)?|fully electric|BEV)$/i.test(fuel??'')||!fuel&&/\b(?:electric|BEV)\b/i.test(title)&&!/\bhybrid\b/i.test(title))return
  const explicit=(text:string)=>{
    const values=new Set<number>()
    for(const match of text.matchAll(/(?<![\w.,])(\d+(?:\.\d+)?)\s*(L|liters?|litres?|cc|cm3|cm³)(?![\w])/gi)){
      const cc=engineToCc(match[0]);if(cc!==undefined&&cc>0)values.add(cc)
    }
    return values
  }
  if(structured){
    const values=explicit(structured)
    if(values.size)return values.size===1?[...values][0]:undefined
    // An explicitly labeled decimal displacement uses liters. Bare integers
    // without a unit remain ambiguous (e.g. 1998 is not assumed to mean liters).
    if(/^\d{1,2}\.\d{1,3}$/.test(structured)&&Number(structured)>0&&Number(structured)<=13)return engineToCc(structured+' L')
  }
  const values=explicit(title)
  for(const match of title.matchAll(/(?<![\w.,])(\d{1,2}\.\d{1,3})\s+(?=(?:\d{1,2}\s*-?\s*cyl(?:inders?)?\b|[VILH]\s*\d{1,2}\b|Flat-\d{1,2}\b))/gi)){
    if(Number(match[1])>0&&Number(match[1])<=13)values.add(engineToCc(match[1]+' L')!)
  }
  return values.size===1?[...values][0]:undefined
}
function titleCategory(title:string,structuredModel:string|undefined,trim:string|null){
  // A door/body specification is independent of manufacturer/model names.
  const names='(?:Sport Utility(?: Vehicle)?|Station Wagon|Pickup(?: Truck)?|Sedan|SUV|Coupe|Hatchback|Wagon|Minivan|Convertible|Van)'
  const doors=title.match(new RegExp('\\b\\d+\\s*-?\\s*(?:Doors?|DR|D)\\s+('+names+')\\b','i'))
  if(doors)return doors[1]
  if(!structuredModel)return
  const index=title.indexOf(' '+structuredModel+' ')
  if(index<0)return
  let tail=title.slice(index+structuredModel.length+2).trim()
  if(trim&&tail.startsWith(trim+' '))tail=tail.slice(trim.length).trim()
  tail=tail.replace(/^(?:AWD|FWD|RWD|4WD|4x4|2WD)\s+/i,'')
  const category=tail.match(new RegExp('^('+names+')\\b','i'))?.[1]
  if(!category)return
  const suffix=tail.slice(category.length).trim()
  // A bare body name, or one followed by explicit technical specifications,
  // is usable. An unverified trim such as 'Coupe Edition' is not body evidence.
  return !suffix||/^(?:\d+(?:\.\d+)?\s*(?:L|cc|cyl(?:inders?)?)\b|\d{1,2}\.\d+\s+(?:\d{1,2}\s*cyl|[VILH]\d)|[VILH]\d{1,2}\b|Gasoline\b|Diesel\b|Electric\b|Hybrid\b|Plug-in Hybrid\b)/i.test(suffix)?category:undefined
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
  if(get('Manufacturer')&&get('Make')&&!sameManufacturer(get('Manufacturer')!,get('Make')!))throw new Error('მწარმოებლის ჩანაწერები ერთმანეთს არ ემთხვევა.')
  const makePrefix=manufacturerPrefix(afterYear,structuredMake),make=structuredMake??makePrefix?.manufacturer
  if(!make||!makePrefix||!year||year!==titleYear)throw new Error('მწარმოებელი ან მოდელი საიმედოდ ვერ განისაზღვრა.')
  const cylindersText=get('Cylinders'),fuel=get('Fuel Type')
  const trim=get('Trim')??null,structuredModel=get('Model')
  let model=structuredModel
  if(!model){
    const remainder=afterYear.slice(makePrefix.length),body=get('Body Style'),drive=get('Drive Train')
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
  const odo=get('Odometer')??get('Odometer Reading')??get('Vehicle Mileage')??get('Mileage')??get('Miles')??clean(root.querySelector('.overview .odometer > span')?.textContent)??clean(root.querySelector('.overview .odometer')?.textContent)
  const mileage=odometerValue(odo)
  const interior=get('Interior Color / Material')?.split(/\s*\/\s*/),door=get('Doors'),displacement=get('Displacement')
  const raw:NormalizedVehicle['raw']={vin,make,model,year,fullModelName:model}
  for(const [key,value] of Object.entries({engineFuelType:fuel,sourceTrim:trim??undefined,odometer:mileage?.value,odometerUnits:mileage?.unit,engineDisplacement:displacement,engineType:cylindersText,transmission:get('Transmission'),driveTrain:get('Drive Train'),exteriorColor:get('Color'),interiorColor:clean(interior?.[0]),interiorType:clean(interior?.[1]),bodyStyle:get('Body Style')}))if(value!==undefined)raw[key]=value
  const photos=edgeGallery(root,s.id,vin,!textOnly),equipment=[...root.querySelectorAll('.section.options li')].map(n=>clean(n.textContent)).filter((x):x is string=>!!x).slice(0,500)
  return normalizeEdgeVehicle({source:'EdgePipeline',listingId:s.id,title,vin,make,model,fullModelName:model,baseModel:model,trim,year,original:{manufacturer:make,model,fullModelName:model,baseModel:model,trim,evidence:'selected-title'},mileage,engineCc:displacementCc(displacement,title,fuel),cylinders:cylinderCount(cylindersText,title,fuel),fuel,steeringWheel:explicitSteering(equipment),transmission:get('Transmission'),drivetrain:get('Drive Train'),body:get('Body Style')??get('Body Type')??get('Vehicle Category')??titleCategory(title,structuredModel,trim),bodyStyle:get('Body Style'),doorCount:door&&/^\d+$/.test(door)?Number(door):undefined,exteriorColor:get('Color'),interiorColor:clean(interior?.[0]),interiorMaterial:clean(interior?.[1]),equipment,images:textOnly||photos.galleryReady?photos.images:[],availableImageCount:photos.availableImageCount,raw,warnings:[]})
}

export const parseEdgePipelineText=(doc:Document,url=doc.URL)=>parseEdgePipeline(doc,url,true)
