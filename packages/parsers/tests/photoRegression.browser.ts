import {resolveSelectedPhotos} from '../../../apps/extension/src/content/photos'
import {uploadPhotos} from '../../../apps/extension/src/photos/upload'
import {parseManheim24,inspectManheim24Photos} from '../src/manheim24'

export async function runPhotoRegressionTests(html:string,check:(value:unknown,label:string)=>void){
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close()
  try{
    const original=parseManheim24(doc),structured=doc.querySelector('.StockWaveInfo')!,data=JSON.parse(structured.textContent!)
    data.images=[];delete data.mainImage;structured.textContent=JSON.stringify(data)
    const gallery=doc.querySelector('#fyusion-prism-viewer')!;gallery.replaceChildren()
    check(parseManheim24(doc).images.length===0,'photos: reproduce a valid prepared vehicle with zero lazy gallery photos')
    const pending=resolveSelectedPhotos(doc,{vin:original.vin,listingId:original.listingId},500)
    const image=doc.createElement('img');image.src='https://images.cdn.manheim.com/late-photo.jpg';gallery.append(image)
    const refreshed=await pending
    check(refreshed.images.length===1 && refreshed.images[0]===image.src,'photos: zero-photo payload can refresh current selected gallery after lazy rendering')
    gallery.replaceChildren();data.mainImage={largeUrl:'https://images.cdn.manheim.com/main-only.jpg'};structured.textContent=JSON.stringify(data)
    check(inspectManheim24Photos(doc).images[0]===data.mainImage.largeUrl,'photos: confirmed structured mainImage fallback works without rendered gallery')
    let rejected=false
    try{await resolveSelectedPhotos(doc,{vin:'2HGCM82633A004352'},20)}catch{rejected=true}
    check(rejected,'photos: changing vehicle cannot supply photos to an old transfer')
    delete data.mainImage;structured.textContent=JSON.stringify(data)
    rejected=false;try{await resolveSelectedPhotos(doc,{vin:original.vin},20)}catch{rejected=true}
    check(rejected,'photos: a permanently empty source returns an extraction error, never 0/0 success')

    doc.body.innerHTML='<input name="primaryFeatures.vinCode" value="unchanged"><input name="primaryFeatures.mileage" value="12345"><textarea>ხელით დაწერილი აღწერა</textarea><input type="checkbox" name="sale.isNegotiablePrice" checked><div data-testid="photo-video-container"><label data-testid="photo-video-label">ფოტო 0/15</label><div data-testid="photo-video-dropzone"><input type="file" multiple></div><div data-testid="photo-video-gallery"></div></div>'
    const input=doc.querySelector<HTMLInputElement>('input[type="file"]')!,container=doc.querySelector('[data-testid="photo-video-gallery"]')!,label=doc.querySelector('[data-testid="photo-video-label"]')!
    const files=Array.from({length:15},(_,i)=>new File([new Uint8Array([137,80,78,71,13,10,26,10])],`photo-${i}.png`,{type:'image/png'}))
    const initial=[...doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input:not([type="file"]),textarea')].map(node=>[node.value,(node as HTMLInputElement).checked])
    let attempts=0,submitted=0
    input.addEventListener('change',()=>{
      attempts++;const selected=[...input.files!]
      if(attempts===2)check(selected.length===3 && selected.every(file=>files.slice(12).some(original=>original.name===file.name)),'photos: partial retry submits only three failed photos')
      for(const file of selected){const loading=doc.createElement('div');loading.dataset.testid='photo-video-loading-local-'+attempts+'-'+file.name;container.append(loading)}
      label.textContent=`ფოტო ${container.children.length}/15`
      setTimeout(()=>{
        for(const file of selected){
          const id='local-'+attempts+'-'+file.name,loading=container.querySelector(`[data-testid="photo-video-loading-${id}"]`)!
          if(attempts===1 && files.findIndex(original=>original.name===file.name)>=12){loading.remove();continue}
          const item=doc.createElement('div');item.dataset.testid='photo-video-item-'+id
          const preview=doc.createElement('img');preview.dataset.testid='photo-video-image-'+id
          Object.defineProperties(preview,{currentSrc:{value:'https://static.tnet.ge/myauto/tmp/'+id+'.webp'},complete:{value:true},naturalWidth:{value:96}})
          item.append(preview);loading.replaceWith(item)
        }
        label.textContent=`ფოტო ${container.children.length}/15`
      },10)
    })
    const result=await uploadPhotos(doc,files,()=>{},{timeoutMs:2000,onSubmitted:count=>{submitted=count}})
    check(result.verified===15 && !result.errors.length && attempts===2 && submitted===15,'photos: 12 successful cards preserved; three failed IDs retry to 15 verified gallery images')
    check(JSON.stringify(initial)===JSON.stringify([...doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input:not([type="file"]),textarea')].map(node=>[node.value,(node as HTMLInputElement).checked])),'photos: upload leaves VIN, mileage, description and negotiable price unchanged')
    const duplicate=await uploadPhotos(doc,files,()=>{},{timeoutMs:20})
    check(duplicate.verified===0 && attempts===2,'photos: an existing completed gallery never receives a duplicate batch')
  }finally{frame.remove()}
}
