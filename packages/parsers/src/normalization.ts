import type { NormalizedVehicle } from '@auto-importer/shared'
export type DetailCategory = 'fuel' | 'transmission' | 'drivetrain' | 'color' | 'body' | 'interior' | 'condition' | 'equipment' | 'damage' | 'note'
export interface Translation { original: string; georgian: string; verified: boolean }
interface DictionaryEntry { originals: readonly string[]; georgian: string; myautoLabels?: readonly string[] }
const dictionaries: Record<DetailCategory, readonly DictionaryEntry[]> = {
  fuel: [
    {originals:['Gasoline','Petrol'],georgian:'ბენზინი'}, {originals:['Diesel'],georgian:'დიზელი'},
    {originals:['Hybrid','Gasoline Hybrid'],georgian:'ჰიბრიდი'},
    {originals:['Plug-in Hybrid','Gasoline Plug-In Hybrid'],georgian:'დამუხტვადი ჰიბრიდი',myautoLabels:['Plug-in Hybrid','დატენვადი ჰიბრიდი']},
    {originals:['Electric','Battery Electric'],georgian:'ელექტრო'},
  ],
  transmission: [{originals:['Automatic','Auto'],georgian:'ავტომატიკა'},{originals:['Manual'],georgian:'მექანიკა'},{originals:['CVT'],georgian:'ვარიატორი'}],
  drivetrain: [{originals:['FWD'],georgian:'წინა წამყვანი',myautoLabels:['წინა']},{originals:['RWD'],georgian:'უკანა წამყვანი',myautoLabels:['უკანა']},{originals:['AWD','4WD'],georgian:'სრული ამძრავი',myautoLabels:['4x4']}],
  color: [
    {originals:['Black'],georgian:'შავი'},{originals:['White'],georgian:'თეთრი'},{originals:['Silver'],georgian:'ვერცხლისფერი'},
    {originals:['Gray','Grey'],georgian:'ნაცრისფერი',myautoLabels:['რუხი']},{originals:['Blue'],georgian:'ლურჯი'},{originals:['Red'],georgian:'წითელი'},
    {originals:['Purple'],georgian:'იისფერი'},{originals:['Green'],georgian:'მწვანე'},{originals:['Yellow'],georgian:'ყვითელი'},
    {originals:['Orange'],georgian:'ნარინჯისფერი'},{originals:['Gold'],georgian:'ოქროსფერი'},{originals:['Pink'],georgian:'ვარდისფერი'},
    {originals:['Beige'],georgian:'ჩალისფერი'},{originals:['Burgundy'],georgian:'შინდისფერი'},{originals:['Brown'],georgian:'ყავისფერი'},
  ],
  body: [{originals:['Wagon'],georgian:'უნივერსალი'},{originals:['Sedan'],georgian:'სედანი'},{originals:['Hatchback'],georgian:'ჰეტჩბეკი'},{originals:['SUV'],georgian:'ჯიპი'},{originals:['Coupe'],georgian:'კუპე'},{originals:['Convertible'],georgian:'კაბრიოლეტი'},{originals:['Pickup'],georgian:'პიკაპი'}],
  interior: [{originals:['Leather'],georgian:'ტყავი'},{originals:['Cloth','Fabric'],georgian:'ქსოვილი',myautoLabels:['ნაჭერი']},{originals:['Alcantara'],georgian:'ალკანტარა'}],
  condition: [{originals:['With Condition Report'],georgian:'მდგომარეობის ანგარიში ხელმისაწვდომია'},{originals:['Used'],georgian:'მეორადი'},{originals:['New'],georgian:'ახალი'},{originals:['As Is'],georgian:'არსებული მდგომარეობით'}],
  equipment: [
    {originals:['Black Grille'],georgian:'შავი ცხაური'},{originals:['Black Side Windows Trim'],georgian:'გვერდითი ფანჯრების შავი მოპირკეთება'},
    {originals:['Body-Coloured Door Handles'],georgian:'ძარის ფერის კარის სახელურები'},{originals:['Cornering Lights'],georgian:'მოსახვევის განათება'},
    {originals:['Headlights-Automatic Highbeams'],georgian:'შორი განათების ავტომატური ფარები'},{originals:['LED Brakelights'],georgian:'სამუხრუჭე LED განათება'},
    {originals:['Light Tinted Glass'],georgian:'მსუბუქად შეფერილი მინები'},{originals:['Lip Spoiler'],georgian:'დაბალი პროფილის სპოილერი'},
    {originals:['1 12V DC Power Outlet'],georgian:'ერთი 12-ვოლტიანი მუდმივი დენის კვების ბუდე'},{originals:['Air Filtration'],georgian:'ჰაერის ფილტრაცია'},
    {originals:['Cargo Space Lights'],georgian:'საბარგულის განათება'},
  ],
  damage: [{originals:['Frame Damage'],georgian:'ჩარჩოს დაზიანება'},{originals:['Hail Damage'],georgian:'სეტყვით დაზიანება'},{originals:['Flood Damage'],georgian:'წყლით დაზიანება'},{originals:['Front End'],georgian:'წინა ნაწილის დაზიანება'},{originals:['Rear End'],georgian:'უკანა ნაწილის დაზიანება'}],
  note: [{originals:['Previous Canadian'],georgian:'ადრე კანადაში რეგისტრირებული'},{originals:['Live'],georgian:'მიმდინარე აუქციონი'},{originals:['Sold'],georgian:'გაყიდული'}],
}
const key = (value: string) => value.trim().replace(/\s+/g,' ').toLocaleLowerCase()
function entry(category: DetailCategory, original: string) { return dictionaries[category].find(e => e.originals.some(s => key(s) === key(original)) || key(e.georgian) === key(original)) }
export function translateDetail(category: DetailCategory, original: string): Translation {
  const found = entry(category,original)
  return { original, georgian: found?.georgian ?? original, verified: !!found }
}
export function myautoEquivalents(category: DetailCategory, original: string): string[] {
  const found = entry(category,original)
  return found ? [...new Set([...found.originals,found.georgian,...(found.myautoLabels ?? [])])].filter(s => key(s) !== key(original)) : []
}
export interface ReviewDetail { key: string; label: string; original?: string; georgian?: string; resolved: boolean }
export function reviewDetails(v: NormalizedVehicle): ReviewDetail[] {
  const rows: ReviewDetail[] = [
    {key:'vin',label:'VIN',original:v.vin,georgian:v.vin,resolved:!!v.vin},
    {key:'make',label:'მწარმოებელი',original:v.make,georgian:v.make,resolved:!!v.make},
    {key:'model',label:'მოდელი',original:v.fullModelName ?? v.model,georgian:v.fullModelName ?? v.model,resolved:!!(v.fullModelName ?? v.model)},
    {key:'trim',label:'კომპლექტაცია',original:v.trim ?? undefined,georgian:v.trim ?? undefined,resolved:!!v.trim},
    {key:'year',label:'წელი',original:v.year === undefined ? undefined : String(v.year),georgian:v.year === undefined ? undefined : String(v.year),resolved:v.year !== undefined},
    {key:'mileage',label:'გარბენი',original:String(v.raw.mileageDisplay || `${v.raw.odometer ?? ''} ${v.raw.odometerUnits ?? ''}`).trim() || undefined,georgian:v.mileageKm === undefined ? undefined : `${v.mileageKm.toLocaleString('ka-GE',{maximumFractionDigits:6})} კმ`,resolved:v.mileageKm !== undefined},
    {key:'engine',label:'ძრავის მოცულობა',original:typeof v.raw.engineDisplacement === 'string' ? v.raw.engineDisplacement : undefined,georgian:v.engineCc === undefined ? undefined : `${v.engineCc} სმ³`,resolved:v.engineCc !== undefined},
    {key:'cylinders',label:'ცილინდრები',original:typeof v.raw.engineType === 'string' ? v.raw.engineType : undefined,georgian:v.cylinders === undefined ? undefined : String(v.cylinders),resolved:v.cylinders !== undefined},
  ]
  for (const [name,label,category] of [
    ['fuel','საწვავი','fuel'],['transmission','გადაცემათა კოლოფი','transmission'],['drivetrain','წამყვანი თვლები','drivetrain'],
    ['exteriorColor','ძარის ფერი','color'],['interiorColor','სალონის ფერი','color'],['interiorMaterial','სალონის მასალა','interior'],['body','ძარის ტიპი','body'],['condition','მდგომარეობა','condition'],
  ] as const) {
    const value = v[name], translated = value ? translateDetail(category,value) : undefined
    rows.push({key:name,label,original:value,georgian:translated?.georgian,resolved:translated?.verified ?? false})
  }
  if (v.conditionGrade !== undefined) rows.push({key:'conditionGrade',label:'წყაროს მდგომარეობის შეფასება',original:String(v.conditionGrade),georgian:String(v.conditionGrade),resolved:true})
  if (v.price) rows.push({key:'price',label:'წყაროს მყისიერი შესყიდვის ფასი',original:`${v.price.amount} ${v.price.currency}`,georgian:`${v.price.amount} ${v.price.currency}`,resolved:true})
  for (const [key,label,value] of [
    ['frameDamage','ჩარჩოს დაზიანების მონიშვნა',v.damage?.frameDamageReported],
    ['salvage','აღდგენითი სტატუსის მონიშვნა',v.damage?.salvageReported],
  ] as const) rows.push({key,label,original:value === undefined ? undefined : String(value),georgian:value === undefined ? undefined : value ? 'წყაროში მონიშნულია' : 'წყაროში არ არის მონიშნული; ისტორიის სისუფთავეს არ ადასტურებს',resolved:value !== undefined})
  if (v.auction?.status) { const status=translateDetail('note',v.auction.status);rows.push({key:'auctionStatus',label:'აუქციონის სტატუსი',original:status.original,georgian:status.georgian,resolved:status.verified}) }
  return rows
}
export function descriptiveText(category: DetailCategory, original: string): string {
  const t = translateDetail(category,original)
  return t.verified ? t.georgian : `${original} (ორიგინალი; თარგმანი დაუდასტურებელია)`
}
