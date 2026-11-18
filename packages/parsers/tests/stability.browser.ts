import {runSessionStress} from './sessionStress.browser'
import {VehiclePreparation} from '../../../apps/extension/src/content/preparation'
import {registerManheimParser} from '../../../apps/extension/src/content/manheim'
import {manheim24Adapter,siteManheimAdapter,searchManheimAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {TransferManager,COMPLETED_TRANSFER_LIMIT} from '../../../apps/extension/src/background/transfers'
import {downloadPhoto} from '../../../apps/extension/src/photos/download'
import {IndexedPhotoStore} from '../../../apps/extension/src/photos/store'
import type {ExtensionApi} from '../../../apps/extension/src/services/extensionApi'
import type {TransferRecord} from '@auto-importer/shared'
export async function runStabilityTests(check:(v:unknown,label:string)=>void){
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),modern=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  let transitions=0,peak=0,active=0,calls=0
  for(const [adapter,html] of [[manheim24Adapter,legacy],[siteManheimAdapter,modern],[searchManheimAdapter,modern]] as const){
    const frame=document.createElement('iframe');document.body.append(frame)
    const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
    const view=doc.defaultView!,Native=view.MutationObserver
    class CountedObserver extends Native{private watching=false;override observe(target:Node,options:MutationObserverInit){if(!this.watching){this.watching=true;active++;peak=Math.max(peak,active)}super.observe(target,options)}override disconnect(){if(this.watching){this.watching=false;active--}super.disconnect()}}
    Object.defineProperty(view,'MutationObserver',{configurable:true,value:CountedObserver})
    let route=adapter.id==='ManheimSearch'?'https://search.manheim.com/results#/details/SALKZ9F90RA229948/OVE':adapter.id==='ManheimSite'?'https://site.manheim.com/selected':'https://home.manheim24.com/landingPage#/results/stress'
    let invalid=false,parses=0
    const api={runtime:{id:'fixture',sendMessage:async()=>{calls++;if(invalid)throw new Error('Extension context invalidated.');return {ok:true,value:true}}}} as unknown as ExtensionApi
    const prep=new VehiclePreparation(doc,api,()=>route,{...adapter,parse:(d,u)=>{parses++;return adapter.parse(d,u)}})
    try{
      for(let index=0;index<40;index++){
        const node=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!),vin=index%2?'2HGCM82633A004352':'3HGCM82633A004352'
        data.vin=vin;data.id=adapter.id+'-stress-'+index;if(data.designatedDescriptionEnrichment)data.designatedDescriptionEnrichment.vin=vin
        const change=(url:string)=>{const u=new URL(url);u.pathname='/stress-'+index+u.pathname.replace(/^\/stress-\d+/,'');return u.href}
        for(const image of data.images??[]){if(image.largeUrl)image.largeUrl=change(image.largeUrl);if(image.smallUrl)image.smallUrl=change(image.smallUrl)}
        doc.querySelectorAll<HTMLImageElement>('#fyusion-prism-viewer img[src]').forEach(image=>{image.src=change(image.src)})
        node.textContent=JSON.stringify(data);doc.querySelector('[data-testid="vdp-vin"]')!.textContent=vin
        const root=doc.querySelector(adapter.rootSelector)!;if(root.hasAttribute('data-vin')){root.setAttribute('data-vin',vin);root.setAttribute('data-key',data.id)}
        if(adapter.id==='ManheimSearch')route='https://search.manheim.com/results#/details/'+vin+'/OVE'
        const value=await prep.resolve(),count=parses
        check(value.vehicle.source===adapter.id&&value.vehicle.vin===vin&&value.vehicle.images.length===15,'stress '+adapter.id+' transition '+index+': current identity and 15 photos isolated')
        await prep.resolve();await prep.resolve()
        if(parses!==count)throw new Error('Warm unchanged vehicle was reparsed')
        transitions++
      }
      invalid=true;doc.querySelector('.StockWaveInfo')!.append(doc.createTextNode(' '))
      try{await prep.resolve()}catch{/* Expected invalidated context. */}
      const stoppedAt=calls
      for(let i=0;i<10;i++){doc.querySelector('.StockWaveInfo')!.append(doc.createTextNode(' '));await Promise.resolve()}
      check(calls===stoppedAt,'stability '+adapter.id+': invalidated context stops API retries and disconnects observer')
    }finally{prep.dispose();frame.remove()}
  }
  check(transitions===120&&active===0&&peak<=3,'stress: 120 source transitions completed with bounded observers and zero active observers after cleanup')
  const doc=new DOMParser().parseFromString(legacy,'text/html'),listeners=new Set<unknown>(),old=Object.getOwnPropertyDescriptor(window,'chrome')
  const api={runtime:{id:'fixture',sendMessage:async()=>({ok:true}),onMessage:{addListener:(listener:unknown)=>listeners.add(listener),removeListener:(listener:unknown)=>listeners.delete(listener)}}} as unknown as ExtensionApi
  Object.defineProperty(window,'chrome',{configurable:true,value:api})
  try{const a=registerManheimParser(doc),b=registerManheimParser(doc);check(a===b&&listeners.size===1,'stability: repeated parser initialization registers exactly one runtime listener');a?.();b?.();check(listeners.size===0,'stability: parser cleanup is idempotent and removes listener')}finally{if(old)Object.defineProperty(window,'chrome',old);else Reflect.deleteProperty(window,'chrome')}
  const vehicle=manheim24Adapter.parse(doc),memory:Record<string,unknown>={}
  const record=(i:number,running=false):TransferRecord=>({id:crypto.randomUUID(),vehicle,sourceTabId:i,destinationTabId:1000+i,documentId:'fixture-'+i,createdAt:Date.now()-(running?40*60000:i),updatedAt:Date.now()-i,status:running?'running':'review',claimed:true,stage:running?'uploading':'review',fields:[],errors:[],photos:{total:15,prepared:15,uploaded:running?0:15,failed:0},activation:{schema:1,state:running?'TRANSFERRING':'COMPLETED'}})
  for(let i=1;i<=100;i++){const value=record(i);memory['job:'+value.id]=value;memory['receiver:'+value.destinationTabId]={documentId:value.documentId,at:Date.now()}}
  const live=record(200,true);memory['job:'+live.id]=live
  const removed:string[]=[]
  const manager=new TransferManager({storage:{session:{get:async(key:string|null)=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async(values:Record<string,unknown>)=>{Object.assign(memory,values)},remove:async(key:string)=>{delete memory[key]}}}} as ExtensionApi,{get:async()=>undefined,put:async()=>{},bytes:async()=>0,remove:async(id)=>{removed.push(id)},prune:async()=>{}})
  await manager.prune()
  check(Object.keys(memory).filter(key=>key.startsWith('job:')).length===COMPLETED_TRANSFER_LIMIT+1&&!removed.includes(live.id),'stability: completed history bounded at 20; recently active long-running transfer preserved')
  check(Object.keys(memory).filter(key=>key.startsWith('receiver:')).length===COMPLETED_TRANSFER_LIMIT,'stability: discarded completed records release receiver bindings')
  const controller=new AbortController();let attempts=0
  const downloading=downloadPhoto('https://images.cdn.manheim.com/stability.jpg',0,async(_url,init)=>{attempts++;return new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true})})},undefined,controller.signal)
  controller.abort();let aborted=false;try{await downloading}catch{aborted=true}
  check(aborted&&attempts===1,'stability: cancelled photo fetch aborts once without transient retries')
  const store=new IndexedPhotoStore(),id=crypto.randomUUID();await store.put(id,new Blob(['fixture']),{index:0,name:'fixture.jpg',mime:'image/jpeg',size:7,sha256:'0'.repeat(64)})
  const stored=(await store.get(id,0))!;stored.createdAt=Date.now()-40*60000
  await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('auto-importer-temporary-photos',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(stored);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(new Error('fixture aging failed'))}}})
  await store.prune(new Set([id]),Date.now());check(!!await store.get(id,0),'stability: owned active photo data survives age-based maintenance');await store.remove(id)
  await runSessionStress(check)
}
