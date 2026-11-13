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
const normalizeLabel=(label:string)=>label.trim().replace(/\s+/g,' ').toLowerCase()
export function manufacturerOptionLabel(source:string):string | undefined {
  return myautoManufacturerLabels.find(label=>normalizeLabel(label)===normalizeLabel(source))
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
