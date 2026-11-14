import type {NormalizedVehicle,ListingLocation} from '@auto-importer/shared'

// Labels supplied by the user. IDs are read from the LIVE matching option,
// never inferred from list order or persisted as a catalogue ID.
export const locationOptions=`გზაში საქ.-სკენ|საქართველო|თბილისი|ქუთაისი|ბათუმი|ფოთი|რუსთავი|რუსთავის ავტობაზრობა|კავკასიის ავტომარკეტი|დუშეთი|კასპი|ბორჯომი|ახმეტა|ზესტაფონი|საგარეჯო|ქობულეთი|გურჯაანი|ახალციხე|სოხუმი|მარტვილი|ჭიათურა|ჩხოროწყუ|თელავი|ლაგოდეხი|მცხეთა|ცხინვალი|ახალქალაქი|გორი|ხაშური|ამბროლაური|ოზურგეთი|ზუგდიდი|სენაკი|სიღნაღი|ქარელი|მარნეული|გარდაბანი|სამტრედია|მესტია|საჩხერე|ხობი|თიანეთი|ფოთის "გეზ"-ი|ბათუმის "გეზ"-ი|ყვარელი|ტყიბული|დედოფლისწყარო|ონი|ბოლნისი|წყალტუბო|თეთრიწყარო|ხარაგაული|წალკა|წალენჯიხა|წეროვანი|ლანჩხუთი|სართიჭალა|ხონი|ნინოწმინდა|ასპინძა|აბაშა|ცაგერი|ჩაქვი|ჩოხატაური|თერჯოლა|ლეჩხუმი|დმანისი|ურეკი|გუდაური|ვანი|ბაღდათი|საზღვარგარეთი|აშშ|გერმანია|იაპონია|ევროპა|საფრანგეთი|დუბაი|სამხ. კორეა|იტალია|ჰოლანდია|ირლანდია|ინგლისი|ესპანეთი|რუსეთი|სხვა|უკრაინა|ჩინეთი|კანადა|თურქეთი|პოლონეთი|სომხეთი`.split('|')
const key=(value:string)=>value.normalize('NFKC').trim().toLowerCase().replace(/\./g,'').replace(/[\s_-]+/g,' ')
const aliases:Record<string,string[]>={
  'აშშ':['United States','United States of America','USA','US','U.S.A.','U.S.'],
  'გერმანია':['Germany','Deutschland','DE','DEU'], 'იაპონია':['Japan','JP','JPN'],
  'სამხ. კორეა':['South Korea','Republic of Korea','Korea, Republic of','KR','KOR'],
  'კანადა':['Canada','CA','CAN'],'დუბაი':['Dubai'],'საფრანგეთი':['France','FR','FRA'],
  'იტალია':['Italy','IT','ITA'],'ჰოლანდია':['Netherlands','Holland','NL','NLD'],
  // UK-wide evidence alone does not prove England; its equivalence must be
  // established separately. An explicit user choice of ინგლისი is supported.
  'ინგლისი':['England'],'ირლანდია':['Ireland','IE'],'ესპანეთი':['Spain','ES'],
  'რუსეთი':['Russia','Russian Federation','RU'],'ჩინეთი':['China','CN'],
  'უკრაინა':['Ukraine','UA'],'თურქეთი':['Turkey','Türkiye','TR'],'პოლონეთი':['Poland','PL'],
  'სომხეთი':['Armenia','AM'],'ევროპა':['Europe'],'საქართველო':['Georgia','GE','GEO'],
  'თბილისი':['Tbilisi','Tiflis'],'ფოთი':['Poti'],'ბათუმი':['Batumi'],'რუსთავი':['Rustavi'],'ქუთაისი':['Kutaisi'],
}
export function locationLabel(value:unknown):string|undefined{
  if(typeof value!=='string' || value.length>500)return
  const normalized=key(value)
  return locationOptions.find(label=>key(label)===normalized || aliases[label]?.some(alias=>key(alias)===normalized))
}
export function exactLocation(value:unknown):value is string{return typeof value==='string' && locationOptions.includes(value)}
export function resolveListingLocation(vehicle:NormalizedVehicle,override?:string,preference?:string):ListingLocation{
  const transit=vehicle.location?.shipping?.verified && vehicle.location.shipping.status==='in-transit' && locationLabel(vehicle.location.shipping.destination)==='საქართველო'
  if(exactLocation(override))return override==='გზაში საქ.-სკენ'&&!transit?{source:'unresolved',original:override}:{label:override,source:'override'}
  if(exactLocation(preference))return preference==='გზაში საქ.-სკენ'&&!transit?{source:'unresolved',original:preference}:{label:preference,source:'default'}
  const evidence=vehicle.location
  const shipping=evidence?.shipping
  if(shipping?.verified && shipping.status==='in-transit')return locationLabel(shipping.destination)==='საქართველო'
    ?{label:'გზაში საქ.-სკენ',source:'shipping',original:shipping.destination}:{source:'unresolved',original:shipping.destination}
  if(evidence?.physicalVerified){
    const city=locationLabel(evidence.physicalCity),country=locationLabel(evidence.physicalCountry)
    const georgianCity=!!city && locationOptions.slice(2,locationOptions.indexOf('საზღვარგარეთი')).includes(city)
    if(georgianCity && country && country!=='საქართველო' || city==='დუბაი' && country)return {source:'unresolved',original:[evidence.physicalCity,evidence.physicalCountry].filter(Boolean).join(', ')}
    // A physical country/city string cannot establish transit status.
    const label=[georgianCity||city==='დუბაი'?city:undefined,country].find(value=>value && value!=='გზაში საქ.-სკენ')
    if(label)return {label,source:'physical',original:[evidence.physicalCity,evidence.physicalCountry].filter(Boolean).join(', ')}
  }
  if(evidence?.atAuction){const label=locationLabel(evidence.auctionCountry);if(label && label!=='გზაში საქ.-სკენ')return {label,source:'auction',original:evidence.auctionCountry}}
  return {source:'unresolved',original:evidence?.physicalCountry??evidence?.auctionCountry}
}
