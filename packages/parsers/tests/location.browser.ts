import {locationLabel,resolveListingLocation} from '../src/listingLocation'
import {locationField,fillLocation,readLocation} from '../src/locationField'
import {parseManheim24} from '../src/manheim24'
import {getLocationPreference,setLocationPreference} from '../../../apps/extension/src/services/locationPreferences'
import type {ExtensionApi,StorageArea} from '../../../apps/extension/src/services/extensionApi'

export async function runLocationTests(html:string,check:(value:unknown,label:string)=>void){
  for(const [source,label] of [['USA','აშშ'],['United States','აშშ'],['US','აშშ'],['Germany','გერმანია'],['Japan','იაპონია'],['South Korea','სამხ. კორეა'],['Canada','კანადა'],['Dubai','დუბაი'],['France','საფრანგეთი'],['Italy','იტალია'],['Netherlands','ჰოლანდია'],['England','ინგლისი'],['Tbilisi','თბილისი'],['Poti','ფოთი'],['Batumi','ბათუმი'],['Rustavi','რუსთავი'],['სამხ. კორეა','სამხ. კორეა']] as const)check(locationLabel(source)===label,`location: exact alias ${source} → ${label}`)
  check(locationLabel('Unknown Country')===undefined && locationLabel('United Kingdom')===undefined,'location: unknown countries and unverified UK-to-England equivalence stay unresolved')
  const vehicle=parseManheim24(new DOMParser().parseFromString(html,'text/html'))
  check(resolveListingLocation({...vehicle,location:{auctionCountry:'US',atAuction:false}}).label===undefined,'location: auction country alone is not physical vehicle location')
  check(resolveListingLocation({...vehicle,location:{auctionCountry:'US',atAuction:true}}).label==='აშშ','location: explicit at-auction status can confirm auction country')
  const physical={...vehicle,location:{physicalCountry:'US',physicalVerified:true}}
  check(resolveListingLocation(physical).label==='აშშ','location: verified pickup/physical country is mapped')
  check(resolveListingLocation(physical,'ბათუმი','თბილისი').source==='override' && resolveListingLocation(physical,undefined,'თბილისი').label==='თბილისი','location: per-transfer override > saved default > verified source')
  check(resolveListingLocation({...physical,location:{physicalCountry:'US',physicalVerified:true,shipping:{status:'in-transit',destination:'Georgia',verified:true}}}).label==='გზაში საქ.-სკენ','location: verified transit specifically to Georgia selects transit')
  check(resolveListingLocation(physical,undefined,'გზაში საქ.-სკენ').label===undefined,'location: a transit preference does not fabricate shipping status')
  const memory:Record<string,unknown>={}
  const area:StorageArea={get:async name=>name?{[name]:memory[name]}:{...memory},set:async value=>{Object.assign(memory,value)},remove:async name=>{delete memory[name]}}
  const api:ExtensionApi={runtime:{id:'fixture',sendMessage:async()=>undefined,onMessage:{addListener(){}}},tabs:{query:async()=>[],sendMessage:async()=>undefined,create:async()=>({})},storage:{local:area,session:area}}
  await setLocationPreference(api,'თბილისი')
  check(await getLocationPreference({...api,storage:{...api.storage,local:{...area}}})==='თბილისი','location: default persists across service instances in durable extension storage')
  await setLocationPreference(api,'აშშ');check(await getLocationPreference(api)==='აშშ','location: default can be changed')
  await setLocationPreference(api,'');check(await getLocationPreference(api)===undefined,'location: default can be cleared')

  const frame=document.createElement('iframe');frame.style.width='1280px';document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write('<form><div data-testid="single-select-location.location"><div data-testid="single-select-trigger-location.location"><input data-testid="single-select-input-location.location"><span data-testid="single-select-value-location.location"></span></div></div><input name="other"></form>');doc.close()
  try{
    const owner=doc.querySelector<HTMLElement>('[data-testid="single-select-location.location"]')!,trigger=owner.querySelector<HTMLElement>('[data-testid="single-select-trigger-location.location"]')!
    let state:{id:string;label:string}|undefined,opens=0,clicks=0
    const render=()=>{
      owner.querySelector('[data-testid="single-select-value-location.location"]')!.textContent=state?.label??''
      owner.querySelector('[data-testid="single-select-clear-location.location"]')?.remove()
      if(state){const clear=doc.createElement('span');clear.dataset.testid='single-select-clear-location.location';owner.append(clear)}
    }
    trigger.onclick=()=>{
      const old=owner.querySelector('[data-testid="single-select-dropdown-location.location"]');if(old){old.remove();return}
      opens++
      const menu=doc.createElement('div');menu.dataset.testid='single-select-dropdown-location.location'
      const header=doc.createElement('div');header.className='opacity-40';header.dataset.testid='single-select-option-location.location-group';header.textContent='საზღვარგარეთი';menu.append(header)
      for(const [label,id] of [['აშშ','live-us'],['თბილისი','live-tbilisi']]){
        const option=doc.createElement('div');option.dataset.testid='single-select-child-option-location.location-'+id;option.textContent=label
        option.onclick=()=>{clicks++;state={id,label};render();menu.remove()};menu.append(option)
      }
      owner.append(menu)
    }
    const result=await fillLocation(doc,locationField({label:'აშშ',source:'physical'}))
    doc.querySelector<HTMLInputElement>('[name="other"]')!.focus();render()
    check(result.optionId==='live-us' && readLocation(doc,result).persisted && owner.querySelector<HTMLInputElement>('input')!.value==='' && opens===1 && clicks===1,'location: actual child option commits; survives focus/rerender without fabricating hidden input IDs')
    const manual=await fillLocation(doc,locationField({label:'თბილისი',source:'override'}))
    check(manual.code==='protected' && clicks===1 && opens===1,'location: even explicit override never overwrites a manual MyAuto selection')
    state=undefined;render()
    const unsupported=await fillLocation(doc,locationField({label:'საზღვარგარეთი',source:'default'}))
    check(!unsupported.persisted && clicks===1 && !owner.querySelector('[data-testid="single-select-dropdown-location.location"]'),'location: nonselectable group heading stays manual and menu closes')
    const missing=await fillLocation(doc,locationField({source:'unresolved',original:'Unknown Country'}))
    check(missing.code==='manual' && missing.sourceValue==='Unknown Country' && opens===2,'location: unresolved source is reported without opening a dropdown')
  }finally{frame.remove()}
}
