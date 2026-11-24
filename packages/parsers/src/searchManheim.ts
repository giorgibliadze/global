import {specificationCylinders,specificationOdometer,specificationEngine,specificationBody,specificationMaterial,specificationFuel} from './specNumbers'
import {sourceMileage,mileageDescription} from './mileage'
import {visible} from './manheimVisibility'
import {extractSiteManheimGallery} from './manheimSiteGallery'
import type {NormalizedVehicle} from '@auto-importer/shared'
import {extractOriginalIdentity} from './identity'
import {deduplicatePhotos,photoIdentity} from './photoUrls'
import {explicitSteering,sourceDoorCount} from './mandatorySpecifications'
import {sanitizeDescription} from './vinPrivacy'
import {translateDetail} from './normalization'
import {fitDescription} from './descriptionFit'

export const searchManheimRoot='[data-test-id="vehicle-details-view-container"]'
export {searchManheimRouteVin as searchManheimRoute} from '@auto-importer/shared'
import {searchManheimRouteVin as searchManheimRoute} from '@auto-importer/shared'

const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}
const value=(v:unknown):string|undefined=>typeof v==='string'&&v.trim()&&v.trim().length<=500&&!/^(?:not specified|unknown|n\/?a|null|undefined|none)$/i.test(v.trim())?v.trim():undefined

const field=(root:Element,id:string)=>{
  const nodes=[...root.querySelectorAll(`[data-testid="${id}"]`)].filter(visible)
  if(nodes.length>1)throw new Error('ავტომობილის ველები ჯერ ახლდება.')
  return value(nodes[0]?.textContent?.replace(/\s+/g,' ').replace(/^•\s*/,''))
}
type DetailSource='ManheimSearch'|'ManheimSite'
function selected(doc:Document,url:string,source:DetailSource='ManheimSearch'){
  let site=false,routeVin=searchManheimRoute(url)
  if(source==='ManheimSite')try{const u=new URL(url);site=u.protocol==='https:'&&u.hostname==='site.manheim.com';routeVin=u.hash.match(/^#\/details\/([A-HJ-NPR-Z0-9]{17})\/[A-Z0-9_-]+/i)?.[1].toUpperCase()}catch{/* Not the supported host. */}
  if(source==='ManheimSite'?!site:!routeVin)throw new Error('გახსენით ავტომობილის დეტალები Manheim-ის ძიების გვერდზე.')
  const roots=[...doc.querySelectorAll(searchManheimRoot)].filter(visible)
  if(roots.length!==1)throw new Error('ავტომობილის დეტალები ჯერ არ არის მზად.')
  const root=roots[0],vin=root.getAttribute('data-vin'),listingId=value(root.getAttribute('data-key')),title=field(root,'vdp-title-text')
  if(!vin||!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)||(routeVin&&vin!==routeVin)||!listingId||!title)throw new Error('არჩეული ავტომობილის გვერდი ჯერ ახლდება.')
  const entries=root.querySelectorAll('[data-test-id="stockwave-info"].StockWaveInfo')
  if(entries.length!==1)throw new Error('ავტომობილის სტრუქტურირებული მონაცემები ჯერ არ არის მზად.')
  let data:Record<string,unknown>
  try{data=object(JSON.parse(entries[0].textContent??''))}catch{throw new Error('ავტომობილის მონაცემები ვერ წაიკითხა.')}
  if(data.vin!==vin||data.id!==listingId||(field(root,'vdp-vin')??vin).replace(/\s/g,'')!==vin)throw new Error('ავტომობილის საიდენტიფიკაციო მონაცემები ერთმანეთს არ ემთხვევა.')
  const identity=extractOriginalIdentity(data,title,vin)
  return {root,vin,listingId,title,data,identity,source,key:JSON.stringify([source,listingId,vin,title])}
}
export function inspectSearchManheimSelection(doc:Document,url=doc.URL,source:DetailSource='ManheimSearch'){const {root,key}=selected(doc,url,source);return {root,key}}
type PhotoOwner={key:string;photos:Set<string>;forbidden:Set<string>}
const photoOwners:Record<DetailSource,WeakMap<Document,PhotoOwner>>={ManheimSearch:new WeakMap(),ManheimSite:new WeakMap()}
function photos(selection:ReturnType<typeof selected>){
  const {root,data,key}=selection
  const records=Array.isArray(data.images)?data.images.map(object):[]
  const sorted=records.every(row=>typeof row.sequence==='number'&&Number.isInteger(row.sequence)&&row.sequence>0)?[...records].sort((a,b)=>Number(a.sequence)-Number(b.sequence)):records
  const structured=deduplicatePhotos(sorted.map(row=>row.largeUrl??row.smallUrl),Infinity)
  const gallery=structured.length>=15?{images:[] as string[],galleryCount:undefined as number|undefined,ready:true}:extractSiteManheimGallery(root,key)
  const main=deduplicatePhotos([object(data.mainImage).largeUrl??object(data.mainImage).smallUrl])
  // A partial metadata array must not mask a complete, correctly scoped gallery.
  const useGallery=gallery.images.length>0&&gallery.images.length>=structured.length
  const images=useGallery?gallery.images:structured.length?structured:main
  const owners=photoOwners[selection.source],previous=owners.get(root.ownerDocument)
  const forbidden=previous?.key===key?previous.forbidden:previous?.photos??new Set<string>()
  const stale=images.some(url=>forbidden.has(photoIdentity(url)))
  if(images.length&&!stale)owners.set(root.ownerDocument,{key,photos:new Set([...structured,...gallery.images,...main].map(photoIdentity).filter(identity=>!forbidden.has(identity))),forbidden})
  const availableImageCount=Math.max(images.length,gallery.galleryCount??0)
  return {images:stale?[]:images.slice(0,15),availableImageCount,galleryCount:gallery.galleryCount,galleryReady:!stale&&images.length>0&&(useGallery?gallery.ready:(images.length>=15||(gallery.galleryCount!==undefined&&gallery.galleryCount>0&&images.length>=gallery.galleryCount))),galleryStale:stale}
}
export function inspectSearchManheimPhotos(doc:Document,url=doc.URL,source:DetailSource='ManheimSearch'){
  const selection=selected(doc,url,source)
  return {vin:selection.vin,listingId:selection.listingId,...photos(selection)}
}
function sellerText(input:unknown,vin:string){
  if(typeof input!=='string'||input.length>30000||/(?:Bearer\s+[a-z0-9._-]{20,}|eyJ[a-z0-9_-]{20,}\.[a-z0-9_-]{20,})/i.test(input))return {text:'',labels:new Map<string,string>()}
  const doc=new DOMParser().parseFromString(input.replace(/<br\s*\/?\s*>/gi,'\n'),'text/html')
  doc.querySelectorAll('script,style,iframe,form').forEach(node=>node.remove())
  const text=doc.body.textContent??'',lines=text.split('\n').map(line=>line.trim()).filter(Boolean)
  // Seller specifications are optional. A copied other-vehicle block cannot override identity.
  if(lines.some(line=>/^VIN\s*:/i.test(line)&&line.replace(/^VIN\s*:\s*/i,'').replace(/\s/g,'')!==vin))return {text:'',labels:new Map<string,string>()}
  const labels=new Map<string,string>()
  for(const name of ['Engine Size','Color','Interior','Fuel','Gear Box','Doors','Cylinders']){
    const found=lines.filter(line=>line.startsWith(name+':')).map(line=>value(line.slice(name.length+1))).filter((v):v is string=>!!v)
    if(new Set(found).size===1)labels.set(name,found[0])
  }
  return {text:sanitizeDescription(text,vin).slice(0,12000),labels}
}
export function searchManheimDescription(v:NormalizedVehicle,limit=1000){
  const lines=[v.title,mileageDescription(v),v.engineCc!==undefined?`ძრავის მოცულობა: ${v.engineCc} სმ³`:'',v.fuel?`საწვავი: ${translateDetail('fuel',v.fuel).georgian}`:'',v.transmission?`ტრანსმისია: ${translateDetail('transmission',v.transmission).georgian}`:'',v.drivetrain?`წამყვანი თვლები: ${translateDetail('drivetrain',v.drivetrain).georgian}`:'','მონაცემები გადმოტანილია Manheim-დან და საჭიროებს გადამოწმებას.']
  return fitDescription(sanitizeDescription(lines.filter(Boolean).join('\n'),v.vin),limit,v.vin).text
}
export function parseSearchManheim(doc:Document,url=doc.URL,source:DetailSource='ManheimSearch'):NormalizedVehicle{
  const selection=selected(doc,url,source),{root,data,vin,listingId,title,identity}=selection
  const enrichment=object(data.designatedDescriptionEnrichment),powertrain=object(enrichment.powertrain),engine=object(powertrain.engine),body=object(enrichment.bodyDescription)
  const seller=sellerText(data.comments??data.remarks,vin),label=(key:string)=>seller.labels.get(key)
  const mileageDisplay=field(root,'vdp-decription-info'),display=specificationOdometer(mileageDisplay),structuredMileage=specificationOdometer(data.odometer)
  const odometer=structuredMileage?.value??display?.value
  if(structuredMileage&&display&&structuredMileage.value!==display.value)throw new Error('გარბენის მონაცემები ერთმანეთს არ ემთხვევა.')
  const unit=value(data.odometerUnits)??structuredMileage?.unit??display?.unit
  const mileage=sourceMileage(odometer,unit,display?.unit?`${display.value} ${display.unit}`:undefined)
  const engineDisplay=value(data.engineDisplacement)??field(root,'card-view-engine-displacement')??label('Engine Size')
  const engineDescription=value(engine.primaryDescription)??value(data.engineType)??label('Engine Size')
  const engineCc=specificationEngine(engineDisplay,value(data.engineFuelType)??label('Fuel'))??specificationEngine(engineDescription,value(data.engineFuelType)??label('Fuel'))
  const cylinders=specificationCylinders(value(data.engineFuelType)??label('Fuel'),title,label('Cylinders'),engineDescription,value(data.engineType))
  const transmissionSource=value(data.transmission)??label('Gear Box')
  const transmission=transmissionSource?.match(/^(?:\d+-Speed\s+)?(Automatic|Manual|CVT|Tiptronic)$/i)?.[1]??transmissionSource
  const fuelSource=value(data.engineFuelType)??label('Fuel'),fuel=specificationFuel(fuelSource)
  const equipment=Array.isArray(enrichment.installedEquipment)?enrichment.installedEquipment.map(row=>value(object(row).primaryDescription)).filter((v):v is string=>!!v).slice(0,500):[]
  const interior=label('Interior'),material=value(data.interiorType)??interior?.match(/\b(Semi-Aniline Leather|Leather|Cloth|Alcantara)\b/i)?.[1]
  const doorCount=sourceDoorCount(data.doorCount??body.passengerDoors,data.doors??label('Doors'))
  const readOverview=(selector:string)=>value(root.querySelector(selector)?.textContent)
  const exteriorColor=value(data.exteriorColor)??readOverview('.overview__value.exterior__value')??label('Color')
  const interiorColor=value(data.interiorColor)??readOverview('.overview__value.interior__value')
  const photoSelection=photos(selection),warnings=[...identity.warnings]
  if(odometer!==undefined&&mileage===undefined)warnings.push('გარბენის ერთეული უცნობია; გადაამოწმეთ წყარო.')
  const raw:NormalizedVehicle['raw']={title,vin,make:identity.original.manufacturer,model:identity.original.model,fullModelName:identity.original.model}
  const originals={odometer,odometerUnits:unit,mileageDisplay,engineDisplacement:label('Engine Size')??engineDisplay,engineType:engineDescription,engineFuelType:fuelSource,transmission:transmissionSource,driveTrain:value(data.driveTrain)??value(object(powertrain.drivetrain).type),exteriorColor:label('Color')??exteriorColor,interiorColor:interior??interiorColor,interiorType:material,doorCount,description:seller.text||undefined}
  for(const [key,v] of Object.entries(originals))if(v!==undefined)raw[key]=v
  const vehicle:NormalizedVehicle={source,listingId,title,vin,original:identity.original,make:identity.original.manufacturer,model:identity.original.model,fullModelName:identity.original.fullModelName,baseModel:identity.original.baseModel,trim:identity.original.trim,year:identity.year,mileage,engineCc,cylinders,fuel,transmission,drivetrain:originals.driveTrain,exteriorColor,interiorColor,interiorMaterial:material==='Semi-Aniline Leather'?'Leather':specificationMaterial(material),body:specificationBody(value(data.bodyStyle)??value(body.primaryBodyStyle)??readOverview('.overview__value.bodyStyle__value')),bodyStyle:value(data.bodyStyle)??value(body.primaryBodyStyle),doorCount,steeringWheel:explicitSteering(equipment),equipment,images:photoSelection.galleryReady?photoSelection.images:[],availableImageCount:photoSelection.availableImageCount,raw,warnings}
  vehicle.description=searchManheimDescription(vehicle)
  return vehicle
}
