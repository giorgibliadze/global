import { registerManheimParser } from '../../../apps/extension/src/content/manheim'
import { assertNormalizedVehicle } from '../src/validation'
import { TransferManager, vehicleSnapshot } from '../../../apps/extension/src/background/transfers'
import { IndexedPhotoStore } from '../../../apps/extension/src/photos/store'
import { downloadPhoto } from '../../../apps/extension/src/photos/download'
import { claimMyautoTransfer, runMyautoTransfer } from '../../../apps/extension/src/myauto/transfer'
import type { ExtensionApi, Sender } from '../../../apps/extension/src/services/extensionApi'
import type { TransferRecord } from '@auto-importer/shared'

export async function runReceiverTests(manheim:string, myauto:string, check:(value:unknown,label:string)=>void) {
  const source=new DOMParser().parseFromString(manheim,'text/html')
  let tabId=300
  // Keep one selected photo to exercise the full transport without duplicating 15 downloads.
  const record=source.querySelector('.StockWaveInfo')!, sourceData=JSON.parse(record.textContent!)
  sourceData.images=[];sourceData.comments='სერვისის ჩანაწერები ხელმისაწვდომია.'
  record.textContent=JSON.stringify(sourceData)
  for(const image of [...source.querySelectorAll('#fyusion-prism-viewer img')].slice(1))image.remove()
  let sourceListener: Parameters<ExtensionApi['runtime']['onMessage']['addListener']>[0]
  // Real chrome.storage.session reorders nested object properties during serialization.
  const storageRoundtrip=<T,>(value:T):T=>JSON.parse(JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item))
  const memory:Record<string,unknown>={}, photos=new IndexedPhotoStore()
  let sender:Sender={}, photoStarted:()=>void=()=>{}, unblock:()=>void=()=>{}
  let photoGate=Promise.resolve()
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
  const api:ExtensionApi={
    runtime:{id:'fixture',onMessage:{addListener(listener){sourceListener=listener}},sendMessage:async(message)=>{
      const input=message as Record<string,unknown>
      if(input.type==='PHOTO_PREPARE'){photoStarted();await photoGate}
      try{return {ok:true,value:await manager.handle(input,sender)}}catch{return{ok:false,error:'სატესტო მოთხოვნა ვერ შესრულდა.'}}
    }},
    tabs:{query:async()=>[],sendMessage:async(_id,message)=>new Promise(resolve=>{
      sourceListener(message,{id:'fixture'},response=>{
        const payload=JSON.parse(JSON.stringify(response))
        if(payload.ok){
          // Model Chrome's JSON message serialization, not structuredClone-only mocks.
          payload.vehicle.description=`აუქციონის შენიშვნა: VIN Code: ${payload.vehicle.vin}; სერვისის ჩანაწერები ხელმისაწვდომია.`
          assertNormalizedVehicle(payload.vehicle)
        }
        resolve(payload)
      })
    }),create:async()=>({id:++tabId})},
    storage:{session:{get:async key=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async data=>{Object.assign(memory,storageRoundtrip(data))},remove:async key=>{delete memory[key]}}},
  }
  const manager=new TransferManager(api,photos,(url,index)=>downloadPhoto(url,index,async()=>new Response(png)))
  const sourceSender:Sender={id:'fixture',tab:{id:1,url:'https://home.manheim24.com/landingPage#/results/fixture'}}
  const previous=Object.getOwnPropertyDescriptor(window,'chrome')
  Object.defineProperty(window,'chrome',{configurable:true,value:api})
  const completed:TransferRecord[]=[]
  try {
    registerManheimParser(source)
    const cacheFailure = new TransferManager(api,{
      get:photos.get.bind(photos),put:photos.put.bind(photos),bytes:photos.bytes.bind(photos),remove:photos.remove.bind(photos),
      prune:async()=>{throw new Error('synthetic optional photo cache failure')},
    })
    let previewWithCacheFailure=false
    try{previewWithCacheFailure=(await cacheFailure.review(sourceSender)).vehicle.model==='M5 Touring Wagon'}catch{ /* Expected to expose the pre-extraction failure in the old pipeline. */ }
    check(previewWithCacheFailure,'source preview: optional photo-cache cleanup failure cannot prevent extraction and payload review')
    for(const name of ['A','B','C']) {
      if(name==='B') {
        const element=source.querySelector('.StockWaveInfo')!,data=JSON.parse(element.textContent!)
        data.vin='2HGCM82633A004352'; data.designatedDescriptionEnrichment.vin=data.vin
        data.models=['M3'];data.designatedDescriptionEnrichment.model='M3'
        data.designatedDescriptionEnrichment.manheimStandardDescription.shortDescription='2026 BMW M3 Touring'
        element.textContent=JSON.stringify(data)
        source.querySelector('[data-testid="vdp-vin"]')!.textContent=data.vin
        source.querySelector('[data-testid="vdp-title-text"]')!.textContent='2026 BMW M3 Touring'
        for(const img of source.querySelectorAll('img'))img.src=img.src.replace('/fixture/','/fixture-b/')
      }
      if(name==='C'){const element=source.querySelector('.StockWaveInfo')!,data=JSON.parse(element.textContent!);data.trims=['Base','Other'];data.sourceTrim='Other';element.textContent=JSON.stringify(data)}
      const review=await manager.review(sourceSender)
      if(name==='C'){const element=source.querySelector('.StockWaveInfo')!,data=JSON.parse(element.textContent!);data.trims=['Base'];data.sourceTrim='Base';element.textContent=JSON.stringify(data)}
      const job=await manager.start(sourceSender,review.reviewId)
      check(vehicleSnapshot(review.vehicle)===vehicleSnapshot(storageRoundtrip(review.vehicle)),`receiver ${name}: Chrome storage key reordering cannot invalidate unchanged reviewed data`)
      if(name==='C')check(job.vehicle.trim===null && job.vehicle.fullModelName==='M3 Touring','receiver C: ambiguous trim permits independent transfer payload with full designation intact')
      check(job.vehicle.model===(name==='A'?'M5 Touring Wagon':'M3 Touring') && job.vehicle.vin.length===17,`receiver ${name}: valid selected vehicle produces intact exact-model/VIN payload`)
      sender={id:'fixture',tab:{id:job.destinationTabId,url:'https://myauto.ge/ka/add'},documentId:`receiver-${name}`}
      const claimed=(await claimMyautoTransfer(2,0))!
      check(claimed.id===job.id,`receiver ${name}: payload reaches destination through runtime message and tab-bound claim`)
      const frame=document.createElement('iframe');document.body.append(frame)
      const doc=frame.contentDocument!;doc.open();doc.write(myauto);doc.close()
      try {
        // A rejected optional VIN field must not stop the other fields or photo upload.
        const vin=doc.querySelector<HTMLInputElement>('[name="primaryFeatures.vinCode"]')!
        if(name==='A')vin.readOnly=true;else vin.remove()
        for(const [key,label] of [['manufacturer','BMW'],['model',job.vehicle.model!]]) {
          doc.querySelector(`[data-testid="single-select-primaryFeatures.${key}"]`)!.remove()
          const select=doc.createElement('select');select.name=`primaryFeatures.${key}`
          select.innerHTML='<option value=""></option>'
          const option=doc.createElement('option');option.value=`fixture-${name}-${key}`;option.text=label;select.append(option);doc.body.append(select)
        }
        const container=doc.querySelector('[data-testid="photo-video-container"]')!
        const input=doc.querySelector<HTMLInputElement>('[data-testid="photo-video-dropzone"] input[type="file"]')!
        input.addEventListener('change',()=>{
          check(input.files?.length===1,`receiver ${name}: real photo File reaches upload control`)
          container.querySelector('.fixture-photo-count')!.textContent='ფოტო 1/15'
          const img=doc.createElement('img')
          Object.defineProperties(img,{currentSrc:{value:`https://cdn.example.test/receiver-${name}.png`},complete:{value:true},naturalWidth:{value:640}})
          container.append(img)
        })
        const started=new Promise<void>(resolve=>{photoStarted=resolve})
        photoGate=new Promise<void>(resolve=>{unblock=resolve})
        let filled:()=>void=()=>{}
        const filledWhileDownloading=new Promise<void>(resolve=>{filled=resolve})
        const running=runMyautoTransfer(doc,claimed,progress=>{if(progress.fields.some(field=>field.key==='mileageKm' && field.persisted))filled()},{pageUrl:()=>sender.tab!.url!,dropdownTimeoutMs:20,uploadTimeoutMs:800})
        await started
        check(!doc.querySelector<HTMLSelectElement>('select[name="primaryFeatures.model"]')!.value,`receiver ${name}: photo download begins before dependent dropdowns finish`)
        let duplicateRejected=false
        try{await runMyautoTransfer(doc,claimed,()=>{},{pageUrl:()=>sender.tab!.url!})}catch{duplicateRejected=true}
        check(duplicateRejected,`receiver ${name}: one active pipeline owner per destination form`)
        await filledWhileDownloading
        const filledBeforePhotos=doc.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value!==''
        unblock()
        const result=await running
        check(filledBeforePhotos,`receiver ${name}: slow photo download cannot prevent vehicle fields being filled`)
        check(result.fields.some(f=>f.field==='მოდელი' && f.status==='filled') && result.fields.some(f=>f.field==='გარბენი' && f.status==='filled'),`receiver ${name}: supported exact model and mileage fields populated and verified`)
        const description=doc.querySelector<HTMLTextAreaElement>('[data-testid="description-textarea"]')!.value
        check(description==='',`receiver ${name}: description remains untouched while VIN stays in its dedicated field`)
        check(result.photos.uploaded===1 && result.fields.some(f=>f.field==='VIN' && f.status==='unfilled'),`receiver ${name}: missing/rejected VIN reported individually without blocking automatic photos`)
        completed.push(result)
      } finally {unblock();frame.remove()}
    }
    check(completed[0].id!==completed[1].id && completed[0].vehicle.model==='M5 Touring Wagon' && completed[1].vehicle.model==='M3 Touring' && completed[0].vehicle.vin!==completed[1].vehicle.vin,'receiver: vehicle A/B payloads, exact models and photo transfers remain independent')
    for(const record of completed)await manager.tabClosed(record.destinationTabId!)
    const runtime=api.runtime.sendMessage
    let attempts=0
    api.runtime.sendMessage=async message=>{if(++attempts===1)throw new Error('synthetic connection failure');return runtime(message)}
    check(await claimMyautoTransfer(2,0)===null && attempts===2,'receiver: transient runtime error retries; ordinary visits without a job remain untouched')
    api.runtime.sendMessage=async()=>{throw new Error('synthetic connection failure')}
    let reported=false
    try{await claimMyautoTransfer(2,0)}catch(error){reported=error instanceof Error && error.message.includes('MyAuto-სთან დაკავშირება')}
    check(reported,'receiver: persistent claim/messaging failure is reported in Georgian rather than swallowed')
    api.runtime.sendMessage=runtime
  } finally {
    if(previous)Object.defineProperty(window,'chrome',previous);else Reflect.deleteProperty(window,'chrome')
  }
}
