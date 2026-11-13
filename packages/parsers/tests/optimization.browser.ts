import { discoverDropdownOptions, selectDropdown } from '../src/dropdowns'
import { readDropdownCache, writeDropdownCache, invalidateDropdownCache, OPTION_CACHE_TTL_MS } from '../src/dropdownCache'
import { parseManheim24 } from '../src/manheim24'
import { TransferManager } from '../../../apps/extension/src/background/transfers'
import { IndexedPhotoStore } from '../../../apps/extension/src/photos/store'
import { downloadPhoto } from '../../../apps/extension/src/photos/download'
import { prepareFiles } from '../../../apps/extension/src/photos/client'
import { retryMyautoFields } from '../../../apps/extension/src/myauto/transfer'
import type { ExtensionApi, Sender } from '../../../apps/extension/src/services/extensionApi'
import type { TransferRecord, FieldResult } from '@auto-importer/shared'

export async function runOptimizationTests(manheim:string,myauto:string,check:(value:unknown,label:string)=>void) {
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(myauto);doc.close()
  try {
    const owner=doc.querySelector<HTMLElement>('[data-testid="single-select-primaryFeatures.manufacturer"]')!,trigger=owner.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
    trigger.tabIndex=0
    trigger.onclick=()=>{
      if(trigger.getAttribute('aria-expanded')==='true'){doc.getElementById('inspected-options')?.remove();trigger.setAttribute('aria-expanded','false');return}
      const list=doc.createElement('div');list.id='inspected-options';list.setAttribute('role','listbox');doc.body.append(list)
      trigger.setAttribute('aria-owns',list.id);trigger.setAttribute('aria-expanded','true')
      for(const [label,id,disabled] of [['Ford','ford-id',false],['BMW','bmw-id',false],['Unavailable','disabled-id',true]] as const){const option=doc.createElement('div');option.setAttribute('role','option');option.textContent=label;option.dataset.value=id;if(disabled){option.setAttribute('aria-disabled','true');option.style.pointerEvents='none'};option.onclick=()=>{
        owner.querySelector('[data-testid^="single-select-value-"]')!.textContent=label;owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=id;list.remove();trigger.setAttribute('aria-expanded','false')
      };list.append(option)}
    }
    const found=await discoverDropdownOptions(doc,'manufacturer',400)
    check(!found.error && found.complete && found.options.length===3 && found.options.find(option=>option.label==='Unavailable')?.disabled,'optimization: reusable inspection reads owned portal labels, actual metadata and disabled state')
    check(!doc.getElementById('inspected-options') && !owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value,'optimization: inspection closes safely without changing the selected value')
    const cached=readDropdownCache(doc,'manufacturer')!
    check(cached.options.some(option=>option.value==='ford-id') && !JSON.stringify(cached).includes('HTMLElement'),'optimization: option cache contains data only, not live DOM references')
    let hit=false
    check(await selectDropdown(doc,'manufacturer',{candidates:['Ford'],onDiagnostic:diagnostic=>{hit=!!diagnostic.cacheHit}},400)===undefined && hit,'optimization: cached options are reused as hints while fresh DOM selection is still verified')
    owner.querySelector('[data-testid^="single-select-value-"]')!.textContent='';owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value=''
    trigger.onclick=()=>{const list=doc.createElement('div');list.setAttribute('role','listbox');owner.append(list);const option=doc.createElement('div');option.setAttribute('role','option');option.textContent='Ford';list.append(option);option.onclick=()=>{owner.querySelector('[data-testid^="single-select-value-"]')!.textContent='Ford';owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value='new-live-id';list.remove()}}
    let liveId=''
    check(await selectDropdown(doc,'manufacturer',{candidates:['Ford'],onSelected:selection=>{liveId=selection.optionId}},400)===undefined && liveId==='new-live-id','optimization: cached option IDs never override newly rendered live selection values')
    writeDropdownCache(doc,'model',[{label:'Full Ford Model',disabled:false,value:'ford-model'}])
    check(!!readDropdownCache(doc,'model'),'optimization: model cache is scoped to current manufacturer')
    owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value='bmw-id'
    check(!readDropdownCache(doc,'model'),'optimization: changing parent selection invalidates model context immediately')
    writeDropdownCache(doc,'model',[{label:'BMW model',disabled:false}])
    doc.documentElement.lang='en'
    check(!readDropdownCache(doc,'model'),'optimization: locale changes invalidate option cache')
    writeDropdownCache(doc,'model',[{label:'Localized model',disabled:false}])
    const root=doc.querySelector('[data-testid="single-select-primaryFeatures.model"]')!;root.replaceWith(root.cloneNode(true))
    check(!readDropdownCache(doc,'model'),'optimization: replacement controls cannot reuse stale cached options')
    writeDropdownCache(doc,'model',[{label:'Versioned model',disabled:false}]);(doc.querySelector('form') ?? doc.body).setAttribute('data-form-version','v2')
    check(!readDropdownCache(doc,'model'),'optimization: declared form version changes invalidate cached options')
    writeDropdownCache(doc,'model',[{label:'Expiring model',disabled:false}])
    check(!readDropdownCache(doc,'model',performance.now()+OPTION_CACHE_TTL_MS+1),'optimization: stale option entries expire without persisting vehicle information')
    writeDropdownCache(doc,'model',[{label:'Fresh model',disabled:false}]);invalidateDropdownCache(doc)
    check(!readDropdownCache(doc,'model'),'optimization: explicit context invalidation clears discovery data')
    writeDropdownCache(doc,'model',[{label:'1HGCM82633A004352',disabled:false},{label:'Safe model',disabled:false}])
    check(readDropdownCache(doc,'model')?.options.length===1,'optimization: VIN-shaped values never enter dropdown option cache')
  } finally {frame.remove()}

  const vehicle=parseManheim24(new DOMParser().parseFromString(manheim,'text/html'));vehicle.images=vehicle.images.slice(0,6)
  const memory:Record<string,unknown>={},store=new IndexedPhotoStore(),calls:number[]=[]
  let active=0,maxActive=0,opens=0
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
  let sender:Sender={id:'fixture',tab:{id:40,url:'https://home.manheim24.com/landingPage'}}
  const api={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:async(message:Record<string,unknown>)=>{
    try{return{ok:true,value:await manager.handle(message,sender)}}catch{return{ok:false,error:'სატესტო ოპერაცია უარყოფილია.'}}
  }},tabs:{query:async()=>[],sendMessage:async()=>({ok:true,vehicle}),create:async()=>({id:++opens+400})},storage:{session:{get:async(key:string|null)=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async(data:Record<string,unknown>)=>{Object.assign(memory,structuredClone(data))},remove:async(key:string)=>{delete memory[key]}}}} as ExtensionApi
  const manager=new TransferManager(api,store,async(url,index)=>{
    calls.push(index);active++;maxActive=Math.max(maxActive,active)
    try{await new Promise(resolve=>setTimeout(resolve,30));return await downloadPhoto(url,index,async()=>new Response(png))}finally{active--}
  })
  const reviewed=await manager.review(sender),record=await manager.start(sender,reviewed.reviewId)
  sender={id:'fixture',tab:{id:record.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:'optimization-document'}
  const claimed=await manager.handle({type:'TRANSFER_CLAIM'},sender) as TransferRecord
  const old=Object.getOwnPropertyDescriptor(window,'chrome');Object.defineProperty(window,'chrome',{configurable:true,value:api})
  try {
    const duplicates=Promise.all([manager.handle({type:'PHOTO_PREPARE',id:claimed.id,index:0},sender),manager.handle({type:'PHOTO_PREPARE',id:claimed.id,index:0},sender)])
    const prepared=await prepareFiles(claimed.id,6,()=>{});await duplicates
    check(prepared.files.length===6 && prepared.errors.length===0 && calls.length===6 && new Set(calls).size===6,'optimization: concurrent duplicate photo requests download each image once')
    check(maxActive===3 && prepared.files.every((file,index)=>file.name.endsWith(`-${index+1}.png`)),'optimization: photo concurrency is bounded at three and original image order is preserved')
    const seeded:FieldResult[]=[{key:'make',field:'მწარმოებელი',status:'filled',reason:'დადასტურებულია.',optionId:'fixture-bmw',optionLabel:'BMW',match:'exact'},
      {key:'fuel',field:'საწვავი',status:'unfilled',reason:'დროებით მიუწვდომელია.',code:'unavailable',retryable:true},
      {key:'model',field:'მოდელი',status:'unfilled',reason:'ზუსტი ვარიანტი არ არის.',code:'unresolved',retryable:false}]
    const finished=await manager.handle({type:'TRANSFER_FINISH',id:claimed.id,fields:seeded,errors:['ფოტოების ატვირთვა ამ სატესტო ოპერაციაში არ შესრულებულა.'],uploaded:0},sender) as TransferRecord
    const retryFrame=document.createElement('iframe');document.body.append(retryFrame)
    const d=retryFrame.contentDocument!;d.open();d.write(myauto);d.close()
    try {
      d.querySelector('[data-testid="single-select-value-primaryFeatures.manufacturer"]')!.textContent='BMW'
      d.querySelector<HTMLInputElement>('[data-testid="single-select-input-primaryFeatures.manufacturer"]')!.value='fixture-bmw'
      let fuelOpens=0,otherOpens=0
      for(const trigger of d.querySelectorAll<HTMLElement>('[data-testid^="single-select-trigger-"]'))trigger.onclick=()=>{otherOpens++}
      const owner=d.querySelector('[data-testid="single-select-primaryFeatures.fuelType"]')!,trigger=owner.querySelector<HTMLElement>('[data-testid^="single-select-trigger-"]')!
      trigger.onclick=()=>{fuelOpens++;const menu=d.createElement('div');menu.setAttribute('role','listbox');owner.append(menu);const option=d.createElement('div');option.setAttribute('role','option');option.textContent='დამუხტვადი ჰიბრიდი';menu.append(option);option.onclick=()=>{
        owner.querySelector('[data-testid^="single-select-value-"]')!.textContent=option.textContent;owner.querySelector<HTMLInputElement>('[data-testid^="single-select-input-"]')!.value='verified-fuel';menu.remove()
      }}
      const retried=await retryMyautoFields(d,finished,()=>{},{pageUrl:()=>sender.tab!.url!,dropdownTimeoutMs:250})
      check(fuelOpens===1 && otherOpens===0 && retried.fields.some(field=>field.key==='fuel' && field.status==='filled'),'optimization: field retry touches only transient fuel failure and preserves successful manufacturer')
      check(calls.length===6 && opens===1 && retried.id===record.id && retried.photos.uploaded===finished.photos.uploaded,'optimization: field retry creates no tab, downloads no photos and preserves prior photo state')
      check(retried.fields.find(field=>field.key==='model')?.code==='unresolved','optimization: unsupported exact models are not retried or replaced')
    } finally {retryFrame.remove()}
    await manager.tabClosed(record.destinationTabId!)
  } finally {if(old)Object.defineProperty(window,'chrome',old);else Reflect.deleteProperty(window,'chrome')}
}
