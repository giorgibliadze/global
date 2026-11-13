// Description-only privacy boundary. Original vehicle identity and the VIN field remain unchanged.
const labelPattern = /(?<![\p{L}\p{N}])(?:VIN(?:[\s\-_:]*(?:Code|კოდი))?|Vehicle[\s_-]+Identification[\s_-]+Number|შასის\s+ნომერი|საიდენტიფიკაციო\s+ნომერი)(?![\p{L}\p{N}])[ \t:：=#-]*/giu
interface Shadow { text: string; ranges: Array<{start:number;end:number}> }
function shadowOf(input:string): Shadow {
  const ranges: Shadow['ranges']=[], output:string[]=[]
  const entities:Record<string,string>={'&nbsp;':' ','&colon;':':','&Tab;':'\t','&NewLine;':'\n','&hyphen;':'-','&ZeroWidthSpace;':''}
  for(let index=0;index<input.length;) {
    const rest=input.slice(index)
    const encoded=rest.match(/^(?:&#(?:x[0-9a-f]+|\d+);?|%[0-9a-f]{2}|&(?:nbsp|colon|Tab|NewLine|hyphen|ZeroWidthSpace);)/i)?.[0]
    const literal=String.fromCodePoint(input.codePointAt(index)!)
    let decoded=literal,length=literal.length
    if(encoded) {
      length=encoded.length
      if(encoded.startsWith('&#')) {
        const numeric=encoded.replace(/^&#/,'').replace(/;$/,'')
        const code=/^x/i.test(numeric)?parseInt(numeric.slice(1),16):parseInt(numeric,10)
        decoded=code>=0 && code<=0x10ffff?String.fromCodePoint(code):encoded
      } else if(encoded.startsWith('%')) decoded=String.fromCharCode(parseInt(encoded.slice(1),16))
      else decoded=entities[encoded] ?? encoded
    }
    const normalized=decoded.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').toUpperCase()
    for(let unit=0;unit<normalized.length;unit++) {output.push(normalized[unit]);ranges.push({start:index,end:index+length})}
    index+=length
  }
  return {text:output.join(''),ranges}
}
export function sanitizeDescription(input:string,knownVin?:string):string {
  const shadow=shadowOf(input), cuts:Array<{start:number;end:number}>=[]
  const mark=(start:number,end:number)=>{if(end>start && shadow.ranges[start] && shadow.ranges[end-1])cuts.push({start:shadow.ranges[start].start,end:shadow.ranges[end-1].end})}
  if(knownVin) {
    const canonical=knownVin.replace(/[\s\-\u200B-\u200D\uFEFF]/g,'').toUpperCase()
    if(/^[A-Z0-9]{6,64}$/.test(canonical)) {
      const pattern=new RegExp([...canonical].join('[\\s-]*'),'g')
      for(const match of shadow.text.matchAll(pattern)) mark(match.index,match.index+match[0].length)
    }
  }
  // Other VINs can arrive in notes; never require a label or the selected vehicle's VIN.
  for(const match of shadow.text.matchAll(/(?<![A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])/g)) {
    if(/\d/.test(match[0]))mark(match.index,match.index+match[0].length)
  }
  for(const match of shadow.text.matchAll(/(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{8})[ \t-]+([A-HJ-NPR-Z0-9]{9})(?![A-Z0-9])/g)) {
    if(/\d/.test(match[1]+match[2]))mark(match.index,match.index+match[0].length)
  }
  const labelledVin = /(?<![\p{L}\p{N}])(?:VIN(?:[\s\-_:]*(?:Code|კოდი))?|Vehicle[\s_-]+Identification[\s_-]+Number|შასის\s+ნომერი|საიდენტიფიკაციო\s+ნომერი)[ \t:：=#-]+([A-HJ-NPR-Z0-9](?:[ \t-]*[A-HJ-NPR-Z0-9]){16})(?![A-Z0-9])/giu
  for(const match of shadow.text.matchAll(labelledVin)) mark(match.index,match.index+match[0].length)
  for(const match of shadow.text.matchAll(labelPattern)) mark(match.index,match.index+match[0].length)
  if(!cuts.length)return input
  cuts.sort((a,b)=>a.start-b.start)
  let offset=0
  return input.split('\n').map(rawLine=>{
    const line=rawLine.replace(/\r$/,''),start=offset,end=start+line.length
    offset+=rawLine.length+1
    let text='',cursor=0,changed=false
    for(const cut of cuts) {
      if(cut.end<=start || cut.start>=end)continue
      const left=Math.max(0,cut.start-start),right=Math.min(line.length,cut.end-start)
      if(left>cursor)text+=line.slice(cursor,left)
      cursor=Math.max(cursor,right);changed=true
    }
    text+=line.slice(cursor)
    if(!changed)return line
    text=text.replace(/:[ \t]*[;,]+[ \t]*/g,': ').replace(/([;,])[ \t]*[;,]+/g,'$1').replace(/^[ \t:：;,|=#-]+/g,'').trim()
    return text && !/^[\p{P}\p{S}\s]+$/u.test(text)?text:undefined
  }).filter((line):line is string=>line!==undefined).join('\n')

}

export function containsVinCode(value:string,knownVin:string):boolean {
  const text=shadowOf(value).text,vin=knownVin.replace(/[\s\-\u200B-\u200D\uFEFF]/g,'').toUpperCase()
  if(/^[A-Z0-9]{6,64}$/.test(vin) && new RegExp([...vin].join('[\\s-]*')).test(text))return true
  return [...text.matchAll(/(?<![A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])/g)].some(match=>/\d/.test(match[0]))
}
