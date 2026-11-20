import {edgeImageResponse} from './edgeImage'
import {edgePhotoUrl,edgePhotoRank} from '@auto-importer/parsers/edge-urls'
import {downloadPhoto} from '../photos/download'
import {isPhotoErrorCode,type PhotoTrace} from '../photos/checkpoints'
const allowed=new Set(['https://file3.autolookout.net','http://file3.autolookout.net','https://dxbrs3zlwqu4z.cloudfront.net'])
export function edgeDownloadUrl(value:string){
  const safe=edgePhotoUrl(value)
  if(!safe)throw Object.assign(new Error('EDGE ფოტოს მისამართი დაუდასტურებელია.'),{photoErrorCode:'URL_REJECTED'})
  const url=new URL(safe);url.protocol='https:';return url.href
}
// Only the resize instruction actually present in the supplied snapshots. A
// candidate is not a verified photo until its response bytes decode successfully.
export function edgeDownloadCandidates(value:string){
  const canonical=edgeDownloadUrl(value),url=new URL(canonical),rank=edgePhotoRank(canonical)
  const candidates:string[]=[]
  if(rank>0&&rank<1600*1200){
    const parts=url.pathname.split('/'),index=parts.findIndex(part=>{try{return /^;resolution:\d+x\d+;$/.test(atob(decodeURIComponent(part)))}catch{return false}})
    if(index>=0){parts[index]='O3Jlc29sdXRpb246MTYwMHgxMjAwOw==';url.pathname=parts.join('/');candidates.push(url.href)}
  }
  candidates.push(canonical)
  // A failed observed full-size URL may still have a working thumbnail variant.
  // As above, the server response must decode before this candidate is accepted.
  if(rank>100*75){
    const fallback=new URL(canonical),parts=fallback.pathname.split('/'),index=parts.findIndex(part=>{try{return /^;resolution:\d+x\d+;$/.test(atob(decodeURIComponent(part)))}catch{return false}})
    if(index>=0){parts[index]='O3Jlc29sdXRpb246MTAweDc1Ow==';fallback.pathname=parts.join('/');candidates.push(fallback.href)}
  }
  // Original HTTP is only a last fallback, never an invented HTTP downgrade.
  if(value.startsWith('http:'))candidates.push(value)
  return [...new Set(candidates)]
}
function diagnostic(trace:PhotoTrace|undefined,stage:string,index:number,started:number,details:Record<string,string|number|boolean>={}){
  if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV===true)console.debug('[Auto Importer EDGE]',{transferId:trace?.transferId??'pending',vehicleId:trace?.vehicleId??'pending',stage,index,timestamp:new Date().toISOString(),durationMs:Math.round(performance.now()-started),...details})
}
export const downloadEdgePhoto:typeof downloadPhoto=async(url,index,fetcher,trace,signal)=>{
  const candidates=edgeDownloadCandidates(url),started=performance.now(),failures:unknown[]=[]
  for(const [variant,candidate] of candidates.entries()){
    signal?.throwIfAborted()
    let status:number|undefined,origin=new URL(candidate).origin,rejected=false,imageRejected=false
    diagnostic(trace,'EDGE_PHOTO_URL_VALIDATED',index,started,{origin,variant})
    diagnostic(trace,'EDGE_PHOTO_DOWNLOAD_STARTED',index,started,{origin,variant})
    try{
      const prepared=await downloadPhoto(candidate,index,async(input,init)=>{
        const response=await(fetcher??fetch)(input,{...init,redirect:'follow'})
        const final=new URL(response.url||candidate);status=response.status;origin=final.origin
        if(!allowed.has(final.origin)||final.username||final.password||final.protocol==='http:'&&new URL(candidate).protocol!=='http:'){rejected=true;await response.body?.cancel().catch(()=>{});return new Response('',{status:400})}
        try{return await edgeImageResponse(response,candidate,signal)}catch{signal?.throwIfAborted();imageRejected=true;return new Response('',{status:400})}
      },trace,signal)
      try{
        const image=await createImageBitmap(prepared.blob)
        const valid=image.width>0&&image.height>0;image.close()
        if(!valid)throw new Error('Empty image')
        signal?.throwIfAborted()
      }catch(cause){throw Object.assign(new Error('EDGE ფოტო დაზიანებულია ან მისი ფორმატი ვერ იკითხება.',{cause}),{photoErrorCode:'INVALID_IMAGE_BYTES'})}
      diagnostic(trace,'EDGE_PHOTO_DOWNLOAD_SUCCESS',index,started,{origin,httpStatus:status??200,variant,bytes:prepared.blob.size})
      diagnostic(trace,'EDGE_PHOTO_BLOB_READY',index,started,{mime:prepared.metadata.mime,bytes:prepared.blob.size})
      return prepared
    }catch(error){
      signal?.throwIfAborted()
      const code=rejected?'URL_REJECTED':imageRejected?'INVALID_IMAGE_BYTES':error&&typeof error==='object'&&'photoErrorCode' in error&&isPhotoErrorCode(error.photoErrorCode)?error.photoErrorCode:'NETWORK_OR_TIMEOUT'
      failures.push(rejected?Object.assign(new Error('EDGE ფოტოს სერვერის გადამისამართება დაუშვებელია.',{cause:error}),{photoErrorCode:code}):imageRejected?Object.assign(new Error('EDGE image decoding failed',{cause:error}),{photoErrorCode:code}):error)
      diagnostic(trace,'EDGE_PHOTO_DOWNLOAD_FAILED',index,started,{origin,httpStatus:status??0,variant,errorCode:code,errorName:error instanceof Error?error.name:'Error',errorMessage:code})
      // No alternate URL retry after an authorization or redirect-policy rejection.
      if(status===401||status===403||code==='URL_REJECTED')break
    }
  }
  const last=failures.at(-1),code=last&&typeof last==='object'&&'photoErrorCode' in last&&isPhotoErrorCode(last.photoErrorCode)?last.photoErrorCode:'NETWORK_OR_TIMEOUT'
  throw Object.assign(new Error(code==='HTTP_AUTH'?'EDGE ფოტოზე წვდომა უარყოფილია. შეამოწმეთ ავტორიზაცია.':code==='INVALID_IMAGE_BYTES'?'EDGE ფოტო დაზიანებულია ან მხარდაჭერილი გამოსახულება არ არის.':'EDGE ფოტოს ჩამოტვირთვა ვერ მოხერხდა. გადამოწმება საჭიროა წყაროს CDN-ზე.',{cause:new AggregateError(failures,'EDGE photo candidates failed')}),{photoErrorCode:code})
}
// No changes to existing sources, shared downloader, concurrency or uploader.
export const downloadSourcePhoto:typeof downloadPhoto=(url,index,fetcher,trace,signal)=>trace?.platform==='EdgePipeline'?downloadEdgePhoto(url,index,fetcher,trace,signal):downloadPhoto(url,index,fetcher,trace,signal)
