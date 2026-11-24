// User-confirmed MyAuto display labels. These are never option IDs or a closed allowlist:
// the live form remains authoritative when it adds manufacturers or model years.
export const myautoManufacturerLabels: readonly string[] = Object.freeze(`Alfa Romeo
Audi
BMW
Cadillac
Chevrolet
Chrysler
Citroen
Daewoo
Daihatsu
Dodge
Fiat
Ford
GMC
Honda
Hummer
Hyundai
Isuzu
Jaguar
Jeep
Kia
Lancia
Land Rover
Lexus
Mazda
Mercedes-Benz
Mercury
Mini
Mitsubishi
Nissan
Opel
Peugeot
Porsche
Renault
Rover
Saab
Seat
Skoda
Subaru
Suzuki
Toyota
Volkswagen
Volvo
VAZ
GAZ
Moskvich
Infiniti
Pontiac
Scion
Oldsmobile
Lincoln
Iveco
Ssangyong
Buick
Acura
Lamborghini
Ferrari
Maserati
Aston Martin
Saleen
Bentley
Rolls-Royce
Maybach
Chery
JAC
BYD
Roewe
Geely
Changfeng
Tata
Saturn
UAZ
ZAZ
Hafei
Great wall
Foton
Dongfeng
Tesla
Xingtai
Karsan
Changan
Lifan
MG
Hyster
Haval
Niewiadow
Fisker
Brilliance
CPI
DM Telai
Lotus
FAW
Bugatti
Zxauto
LTI
YTO
Soueast
Baic
Lonking
Mclaren
Proton
Iran Khodro
Smart
AMC
Dacia
Arcfox
Zeekr
Voyah
Hongqi
Huawei
Lixiang
Xpeng
Datsun
Saic Motor
Zukida
Mitsuoka
Genesis
Yuanxin Energy's
Euler
NIO
Linde
Shade Xtreme
Jetour
Hiphi
Aion
DS Automobiles
Renault Samsung
Neta
Exeed
Skywell
Huawei Inside
Avatr
Polestar
Dayun
Xiaomi
Izh
Lynk & Co
Gonow
Sena
Forthing
IM Motors
AIQAR
Vauxhall
Rivian
MPM
OMODA
Mahindra
Leapmotor
Aito
Wuling
Maxus
GWM
Wey
Baojun
Baw
Sunbeam
Bertone
Lucid
GAC
Vanderhall
Hycan
Cupra
Bestune
Kandi
VinFast
Denza
HIGER
KAIYI
INEOS`.split('\n'))
// Manufacturer-only aliases. Never map ambiguous conglomerates such as GM.
const manufacturerAliases:Readonly<Record<string,readonly string[]>>={
  Volkswagen:['VW'],Chevrolet:['Chevy'],Citroen:['Citroën'],Skoda:['Škoda'],'Mercedes-Benz':['Mercedes','Mercedes Benz'],BMW:['B.M.W.'],
}
const makeKey=(label:string)=>label.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[\s.\-\u2010-\u2015]+/g,'')
function manufacturerKey(source:string){
  const key=makeKey(source)
  if(!/\p{L}/u.test(key)||['unknown','na','n/a','notspecified','notavailable','none','null','undefined','unavailable'].includes(key))return ''
  const alias=Object.entries(manufacturerAliases).find(([,aliases])=>aliases.some(alias=>makeKey(alias)===key))
  return alias?makeKey(alias[0]):key
}
export function sameManufacturer(a:string,b:string){const key=manufacturerKey(a);return !!key&&key===manufacturerKey(b)}
export function manufacturerOptionLabel(source:string):string | undefined {
  return myautoManufacturerLabels.find(label=>sameManufacturer(label,source))
}
export function manufacturerOptionLabels(source:string):string[]{
  const canonical=manufacturerOptionLabel(source)
  if(!canonical)return []
  const aliases=manufacturerAliases[canonical]??[]
  return [...new Set([canonical,...aliases,canonical.replace(/[ -]/g,''),canonical.replace(/-/g,' '),canonical.replace(/-/g,' - '),...['-','–','—','‑'].map(dash=>canonical.split(/[ -]+/).join(dash))])]
}
// Locate only a whole manufacturer prefix. Its actual length matters for aliases:
// removing 'Mercedes' must never slice a model using 'Mercedes-Benz'.length.
export function manufacturerPrefix(text:string,expected?:string):{manufacturer:string;length:number}|undefined{
  const matches:{manufacturer:string;length:number}[]=[]
  for(const boundary of text.matchAll(/\s+/g)){
    if(boundary.index>Math.max(80,expected?.length??0))break
    const candidate=text.slice(0,boundary.index)
    if(expected?sameManufacturer(candidate,expected):!!manufacturerOptionLabel(candidate))matches.push({manufacturer:candidate,length:boundary.index+boundary[0].length})
  }
  return matches.at(-1)
}
export function knownMyautoYears(now = new Date()):number[] {
  const latest=Math.max(2026,now.getFullYear())
  return Array.from({length:latest-1990+1},(_,index)=>1990+index)
}
export function myautoCatalogHint(key:string,source:string,now = new Date()):string | undefined {
  if(key==='manufacturer')return manufacturerOptionLabel(source)
    ? 'მწარმოებელი მოწოდებულ სიაშია; ფორმაში მისი არჩევანი ვერ დადასტურდა.'
    : 'მწარმოებელი მოწოდებულ სიაში არ არის. სხვა მწარმოებელი არ არჩეულა.'
  if(key==='issueYear')return `მოწოდებული წლების დიაპაზონია 1990–${knownMyautoYears(now).at(-1)}. სხვა წელი არ არჩეულა.`
}
