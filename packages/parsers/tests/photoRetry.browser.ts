import {retryPhotos} from '../../../apps/extension/src/photos/retry'
import {parseManheim24} from '../src/manheim24'
import {base64Bytes} from '../../../apps/extension/src/photos/download'
import type {TransferRecord} from '@auto-importer/shared'
export async function runPhotoRetryTest(html:string,check:(value:unknown,label:string)=>void){
  const vehicle=parseManheim24(new DOMParser().parseFromString(html,'text/html')),id=crypto.randomUUID()
  let record:TransferRecord={id,vehicle,status:'error',stage:'verifying',claimed:true,sourceTabId:1,createdAt:Date.now(),updatedAt:Date.now(),photos:{total:3,prepared:3,uploaded:2,failed:1,staged:true,issue:true},fields:[{key:'mileageKm',field:'გარბენი',status:'filled',persisted:true,reason:'ok'}],errors:[],photoReceipt:{confirmed:[{index:0,slot:'local-one'},{index:1,slot:'local-two'}],retryable:[2],uncertain:[]}}
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('')
  const previous=Object.getOwnPropertyDescriptor(window,'chrome');let requests=0,changes=0
  Object.defineProperty(window,'chrome',{configurable:true,value:{runtime:{sendMessage:async(message:Record<string,unknown>)=>{
    if(message.type==='PHOTO_RETRY_BEGIN')record={...record,status:'running'}
    else if(message.type==='PHOTO_PREPARE'){check(message.index===2,'photo-only retry: successful indices are never requested');requests++;return {ok:true,value:{index:2,name:`vehicle-${id.slice(0,8)}-3.png`,size:bytes.length,mime:'image/png',sha256}}}
    else if(message.type==='PHOTO_CHUNK')return {ok:true,value:base64Bytes(bytes)}
    else if(message.type==='PHOTO_REPORT'){record.photoReceipt=message.receipt as TransferRecord['photoReceipt'];record.photos.uploaded=record.photoReceipt!.confirmed.length;record.photos.issue=record.photos.uploaded<3}
    else if(message.type==='TRANSFER_FINISH'){record.status='review';record.fields=message.fields as TransferRecord['fields']}
    else throw new Error('Unexpected photo-only operation')
    return {ok:true,value:structuredClone(record)}
  }}}})
  const frame=document.createElement('iframe');document.body.append(frame);const doc=frame.contentDocument!
  doc.open();doc.write(`<input name="primaryFeatures.vinCode" value="${vehicle.vin}"><input name="primaryFeatures.mileage" value="12345"><textarea>მომხმარებლის აღწერა</textarea><input type="checkbox" name="sale.isNegotiablePrice" checked><div data-testid="photo-video-container"><label data-testid="photo-video-label">ფოტო 2/15</label><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>`);doc.close()
  const gallery=doc.querySelector('[data-testid="photo-video-gallery"]')!,label=doc.querySelector('[data-testid="photo-video-label"]')!
  const card=(slot:string)=>{const item=doc.createElement('div');item.dataset.testid='photo-video-item-'+slot;const image=doc.createElement('img');image.dataset.testid='photo-video-image-'+slot;Object.defineProperties(image,{currentSrc:{value:'https://static.tnet.ge/myauto/tmp/'+slot+'.webp'},complete:{value:true},naturalWidth:{value:96}});item.append(image);return item}
  gallery.append(card('local-one'),card('local-two'))
  doc.querySelector<HTMLInputElement>('input[type="file"]')!.onchange=()=>{changes++;const loading=doc.createElement('div');loading.dataset.testid='photo-video-loading-local-three';gallery.append(loading);label.textContent='ფოტო 3/15';setTimeout(()=>loading.replaceWith(card('local-three')),10)}
  try{
    const running=retryPhotos(doc,structuredClone(record),{pageUrl:()=> 'https://myauto.ge/ka/add',uploadTimeoutMs:1200})
    let blocked=false;try{await retryPhotos(doc,record)}catch{blocked=true}
    const result=await running
    check(blocked&&requests===1&&changes===1&&result.photos.uploaded===3&&!result.photos.issue,'photo-only retry: concurrent click blocked, one missing file completes the existing gallery')
    check(doc.querySelector<HTMLInputElement>('[name="primaryFeatures.mileage"]')!.value==='12345' && doc.querySelector('textarea')!.value==='მომხმარებლის აღწერა' && doc.querySelector<HTMLInputElement>('[name="sale.isNegotiablePrice"]')!.checked && result.fields[0].key==='mileageKm','photo-only retry: text, description, negotiable price and field results stay unchanged')
  }finally{frame.remove();if(previous)Object.defineProperty(window,'chrome',previous);else delete (window as {chrome?:unknown}).chrome}
}
