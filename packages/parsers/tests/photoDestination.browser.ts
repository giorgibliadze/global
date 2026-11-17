import {TransferManager} from '../../../apps/extension/src/background/transfers'
import {IndexedPhotoStore} from '../../../apps/extension/src/photos/store'
import {parseManheim24} from '../src/manheim24'
import type {ExtensionApi} from '../../../apps/extension/src/services/extensionApi'
import type {TransferRecord,PhotoMetadata} from '@auto-importer/shared'
import {prepareFiles} from '../../../apps/extension/src/photos/client'
import {uploadPhotos} from '../../../apps/extension/src/photos/upload'
import {waitForUploader} from '../../../apps/extension/src/photos/readiness'
export async function runPhotoDestinationTests(check:(v:unknown,label:string)=>void){
  const original=Object.getOwnPropertyDescriptor(window,'chrome')
  let messages=0
  Object.defineProperty(window,'chrome',{configurable:true,value:{runtime:{sendMessage:()=>{messages++;return new Promise(()=>{})}}}})
  try{const result=await prepareFiles(crypto.randomUUID(),15,()=>{},undefined,undefined,undefined,undefined,{messageTimeoutMs:20});check(result.files.length===0&&result.failureCode==='MESSAGE_TIMEOUT'&&messages===4&&result.errors.length===15,'destination photos: nonresponding worker message is bounded and cannot stall preparation forever')}
  finally{if(original)Object.defineProperty(window,'chrome',original);else Reflect.deleteProperty(window,'chrome')}

  // Recreate the worker-owned manager/store against persisted session/IDB
  // state. This tests restart contracts, not stopping a live Chrome process.
  const html=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text(),vehicle=parseManheim24(new DOMParser().parseFromString(html,'text/html'))
  vehicle.images=vehicle.images.slice(0,1)
  const id=crypto.randomUUID(),store=new IndexedPhotoStore(),bytes=new Uint8Array([255,216,255,0]),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')
  const metadata:PhotoMetadata={index:0,name:'vehicle-'+id.slice(0,8)+'-1.jpg',mime:'image/jpeg',size:bytes.length,sha256}
  await store.put(id,new Blob([bytes],{type:'image/jpeg'}),metadata)
  const record:TransferRecord={id,vehicle,sourceTabId:1,destinationTabId:2,documentId:'photo-restart',createdAt:Date.now(),updatedAt:Date.now(),claimed:true,status:'running',stage:'uploading',activation:{schema:1,state:'TRANSFERRING'},fields:[],errors:[],photos:{total:1,prepared:1,uploaded:0,failed:0}}
  const memory:Record<string,unknown>={['job:'+id]:record},api={runtime:{getManifest:()=>({version:'fixture'})},storage:{session:{get:async(key:string|null)=>structuredClone(key===null?memory:{[key]:memory[key]}),set:async(value:Record<string,unknown>)=>{Object.assign(memory,value)},remove:async(key:string)=>{delete memory[key]}}}} as ExtensionApi
  let redownloads=0
  const restarted=new TransferManager(api,new IndexedPhotoStore(),async()=>{redownloads++;throw new Error('Cached photo must not redownload')})
  try{await restarted.validateState();const sender={id:'fixture',tab:{id:2,url:'https://myauto.ge/ka/add'},documentId:'photo-restart'}
    const recovered=await restarted.handle({type:'PHOTO_PREPARE',id,index:0},sender) as PhotoMetadata
    const chunk=await restarted.handle({type:'PHOTO_CHUNK',id,index:0,offset:0},sender) as string
    check(recovered.sha256===sha256&&atob(chunk).length===bytes.length&&redownloads===0,'destination photos: recreated worker manager recovers persistent photo bytes without redownloading')
  }finally{await store.remove(id)}
  for(const count of [1,5,15]){
    const frame=document.createElement('iframe');document.body.append(frame)
    const doc=frame.contentDocument!
    doc.body.innerHTML='<div data-testid="photo-video-container"><span data-testid="photo-video-label">ფოტო 0/15</span><div data-testid="photo-video-dropzone"><input type="file" multiple disabled></div><div data-testid="photo-video-gallery"></div></div>'
    const input=doc.querySelector<HTMLInputElement>('input')!,gallery=doc.querySelector('[data-testid="photo-video-gallery"]')!,label=doc.querySelector('[data-testid="photo-video-label"]')!
    if(count===5)(doc.querySelector('[data-testid="photo-video-container"]') as HTMLElement).style.display='none'
    const waiting=waitForUploader(doc,undefined,500);input.disabled=false;await waiting
    check(true,'destination photos '+count+': readiness observes enabled multi-file uploader without fixed delay')
    let submissions=0
    const source=Array.from({length:count},(_,index)=>new File([new Uint8Array(index===0?14*1024*1024:4)],'photo-'+index+'.jpg',{type:'image/jpeg'}))
    input.onchange=()=>{
      submissions++
      check(input.files?.length===count&&[...input.files!].every((file,index)=>file.size===source[index].size&&file.name===source[index].name),'destination photos '+count+': one batch preserves original order and large-file sizes')
      for(let i=0;i<count;i++){
        const node=doc.createElement('div');node.dataset.testid='photo-video-loading-test-'+i;gallery.append(node)
      }
      label.textContent=`ფოტო ${count}/15`
      queueMicrotask(()=>{
        for(let i=0;i<count;i++){
          const node=doc.createElement('div');node.dataset.testid='photo-video-item-test-'+i
          const image=doc.createElement('img');image.dataset.testid='photo-video-image-test-'+i
          // Server response creates the item. Thumbnail decoding is deliberately
          // unavailable: completion cannot depend on that separate CDN request.
          Object.defineProperties(image,{currentSrc:{value:'https://static.tnet.ge/myauto/tmp/test-'+i+'.jpg'},complete:{value:false},naturalWidth:{value:0}})
          node.append(image);gallery.querySelector('[data-testid="photo-video-loading-test-'+i+'"]')!.replaceWith(node)
        }
      })
    }
    try{const result=await uploadPhotos(doc,source,()=>{},{timeoutMs:500});check(result.verified===count&&submissions===1,'destination photos '+count+': accepted remote cards confirm without waiting for preview downloads')}
    finally{frame.remove()}
  }
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!
  doc.body.innerHTML='<div data-testid="photo-video-container"><span data-testid="photo-video-label">ფოტო 0/15</span><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>'
  const input=doc.querySelector<HTMLInputElement>('input')!,gallery=doc.querySelector('[data-testid="photo-video-gallery"]')!
  input.onchange=()=>{doc.querySelector('[data-testid="photo-video-label"]')!.textContent='ფოტო 1/15';const card=doc.createElement('div');card.dataset.testid='photo-video-item-local';card.innerHTML='<img data-testid="photo-video-image-local" src="data:image/jpeg;base64,/9j/">';gallery.append(card)}
  try{const result=await uploadPhotos(doc,[new File(['test'],'test.jpg',{type:'image/jpeg'})],()=>{},{timeoutMs:30});check(result.verified===0,'destination photos: base64/local previews never count as server acceptance')}finally{frame.remove()}
}
