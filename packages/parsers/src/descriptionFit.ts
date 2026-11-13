import { sanitizeDescription } from './vinPrivacy'
export interface FittedDescription {text:string;omissions:string[];criticalOmitted:boolean}
// Fit whole statements, never truncate a damage sentence or a vehicle name.
// The complete source and prepared description remain in the transfer snapshot.
export function fitDescription(original:string,limit:number,vin:string):FittedDescription {
  const clean=sanitizeDescription(original,vin)
  if(limit<0 || clean.length<=limit)return {text:clean,omissions:[],criticalOmitted:false}
  const lines=clean.split('\n').map(line=>line.trim()).filter(Boolean)
  const important=(line:string)=>/დაზიან|მდგომარეობ|აღდგენით|აუქციონის შენიშვნები:|წყაროს დამატებითი აღწერა|\b(?:damage|salvage|flood)\b/i.test(line)
  const critical=lines.slice(1).filter(important)
  const normal=lines.slice(1).filter(line=>!important(line) && !/^აღჭურვილობა:|დამატებითი პაკეტების|დაუდასტურებელი თარგმანის/.test(line))
  const optional=lines.slice(1).filter(line=>!critical.includes(line) && !normal.includes(line))
  const chosen:string[]=[],omissions:string[]=[]
  const warning='მნიშვნელოვანი შენიშვნები სრულად ვერ დაეტია; გადაამოწმეთ წყაროს განცხადება.'
  const add=(line:string,reserve=0)=>{if([...chosen,line].join('\n').length+reserve>limit)return false;chosen.push(line);return true}
  if(!lines[0] || !add(lines[0]))return {text:'',omissions:['სრული დასახელება და აღწერა ველის ლიმიტში ვერ ეტევა.'],criticalOmitted:true}
  let criticalOmitted=false
  const needsWarning=[chosen[0],...critical].join('\n').length>limit
  for(const line of critical)if(!add(line,needsWarning?warning.length+1:0))criticalOmitted=true
  if(criticalOmitted){add(warning);omissions.push('მნიშვნელოვანი მდგომარეობის ან აუქციონის შენიშვნები სრულად ვერ დაეტია. სრული შენიშვნები გადაამოწმეთ წყაროს განცხადებაში.')}
  for(const line of normal)if(!add(line) && !omissions.includes('ზოგი დამატებითი მახასიათებელი აღწერაში ვერ დაეტია.'))omissions.push('ზოგი დამატებითი მახასიათებელი აღწერაში ვერ დაეტია.')
  for(const line of optional)if(!add(line) && !omissions.includes('აღჭურვილობის ან პაკეტების ნაწილი აღწერაში ვერ დაეტია.'))omissions.push('აღჭურვილობის ან პაკეტების ნაწილი აღწერაში ვერ დაეტია.')
  return {text:sanitizeDescription(chosen.join('\n'),vin),omissions,criticalOmitted}
}
