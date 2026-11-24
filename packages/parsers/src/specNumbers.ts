// Source specification values only; callers retain platform identity, units and DOM scope.
export function specificationCylinders(fuel:unknown,title:string,...sources:unknown[]):number|undefined{
  const fuelText=typeof fuel==='string'&&!/^(?:-+|\?+|unknown|n\/?a)$/i.test(fuel.trim())?fuel.trim():undefined
  if(fuelText&&/^(?:electric|battery electric(?: vehicle)?|fully electric|BEV)$/i.test(fuelText)||!fuelText&&/\b(?:electric|BEV)\b/i.test(title)&&!/\bhybrid\b/i.test(title))return
  const read=(input:unknown,titleOnly=false)=>{
    if(typeof input==='number')return Number.isInteger(input)&&input>=1&&input<=12?input:undefined
    if(typeof input!=='string'||input.length>1000)return
    const text=input.trim(),values=new Set<number>()
    if(!titleOnly&&/^\d{1,2}$/.test(text)){const n=Number(text);return n>=1&&n<=12?n:undefined}
    const add=(value:string)=>{const n=Number(value);if(n>=1&&n<=12)values.add(n)}
    for(const match of text.matchAll(/(?<![\w.])(\d{1,2})\s*-?\s*cyl(?:inders?)?\b/gi))add(match[1])
    const layouts=titleOnly?/(?<![\w.])(?:[VILH]\s*-?\s*|Flat\s*-\s*)(\d{1,2})(?![\w.])/g:/(?<![\w.])(?:[VILH]\s*-?\s*|Flat\s*-\s*)(\d{1,2})(?![\w.])/gi
    for(const match of text.matchAll(layouts))add(match[1])
    return values.size===1?[...values][0]:undefined
  }
  for(const source of sources){const value=read(source);if(value!==undefined)return value}
  return read(title,true)
}
export function specificationOdometer(input:unknown):{value:number;unit?:'mi'|'km'}|undefined{
  if(typeof input==='number')return Number.isSafeInteger(input)&&input>=0?{value:input}:undefined
  if(typeof input!=='string'||input.length>1000)return
  const text=input.replace(/\s+/g,' ').trim().replace(/^•\s*/,'').replace(/^(?:Odometer Reading|Vehicle Mileage|Mileage|Odometer|Miles)\s*:\s*/i,'').replace(/\s*\([A-Za-z][A-Za-z -]*\)\s*/g,' ').trim()
  const match=text.match(/^(\d[\d, ]*?)\s*(mi|miles?|km|kilometers?|kilometres?)?$/i)
  if(!match)return
  const number=match[1].trim().replace(/, +/g,',')
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)$/.test(number))return
  const value=Number(number.replace(/[, ]/g,''))
  if(!Number.isSafeInteger(value)||value<0)return
  return {value,unit:match[2]?/^mi/i.test(match[2])?'mi':'km':/^Miles\s*:/i.test(input.trim())?'mi':undefined}
}

// Explicit displacement only; no inference from model, power or battery size.
export function specificationEngine(input:string|undefined,fuel:string|undefined):number|undefined{
  if(/^(?:electric|battery electric(?: vehicle)?|fully electric|BEV)$/i.test(fuel??'')||!input)return
  const values=new Set<number>()
  for(const match of input.matchAll(/(?<![\w.,])(\d+(?:\.\d+)?)\s*(L|liters?|litres?|cc|cm3|cm³)(?!\w)/gi)){
    const value=Number(match[1])*(/^l/i.test(match[2])?1000:1)
    if(value>0&&Number.isFinite(value))values.add(Math.round(value))
  }
  if(values.size)return values.size===1?[...values][0]:undefined
  return /^\d{1,2}\.\d{1,3}$/.test(input)&&Number(input)>0&&Number(input)<=13?Math.round(Number(input)*1000):undefined
}
export function specificationBody(value:string|undefined):string|undefined{
  if(!value)return
  const body=value.replace(/^\d+\s*-?\s*(?:Doors?|DR|D)\s+/i,'')
  return /^pickup truck$/i.test(body)?'Pickup':/^sport utility(?: vehicle)?$/i.test(body)?'SUV':/^station wagon$/i.test(body)?'Wagon':body
}
export const specificationTransmission=(value:string|undefined)=>value?.replace(/^\d+-Speed\s+(Automatic|Manual|CVT|Tiptronic)$/i,'$1')
export const specificationMaterial=(value:string|undefined)=>/^Fabric$/i.test(value??'')?'Cloth':value
export const specificationFuel=(value:string|undefined)=>/^Premium Unleaded Gasoline$/i.test(value??'')?'Gasoline':value
