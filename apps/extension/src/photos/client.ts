import {PHOTO_DOWNLOAD_CONCURRENCY} from '@auto-importer/shared'
import {isPhotoErrorCode} from './checkpoints'
import type {PhotoTrace,PhotoErrorCode} from './checkpoints'
import type { PhotoMetadata,TimingStage } from '@auto-importer/shared'
import { extensionApi } from '../services/extensionApi'
class PhotoTransportError extends Error {readonly code:PhotoErrorCode;constructor(code:PhotoErrorCode){super('ფოტოების გადატანა ვერ დასრულდა');this.code=code}}
async function photoRequest<T>(message:{type:string;id:string;index:number;offset?:number},signal?:AbortSignal,timeoutMs=message.type==='PHOTO_PREPARE'?60000:10000):Promise<T>{
  let result:{ok?:boolean;value?:T;photoErrorCode?:unknown}|undefined
  try{
    signal?.throwIfAborted()
    result=await new Promise<typeof result>((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
      const abort=()=>{cleanup();reject(signal?.reason)}
      const timer=setTimeout(()=>{cleanup();reject(new PhotoTransportError('MESSAGE_TIMEOUT'))},timeoutMs)
      signal?.addEventListener('abort',abort,{once:true})
      try{Promise.resolve(extensionApi().runtime.sendMessage(message)).then(value=>{cleanup();resolve(value as typeof result)},error=>{cleanup();reject(error)})}catch(error){cleanup();reject(error)}
    })
  }catch(error){signal?.throwIfAborted();throw error instanceof PhotoTransportError?error:new PhotoTransportError('MESSAGE_FAILED')}
  if(!result || typeof result.ok!=='boolean')throw new PhotoTransportError('MESSAGE_FAILED')
  if(!result.ok)throw new PhotoTransportError(isPhotoErrorCode(result.photoErrorCode)?result.photoErrorCode:message.type==='PHOTO_PREPARE'?'BACKGROUND_PREPARATION_FAILED':'CHUNK_UNAVAILABLE')
  return result.value as T
}
export async function prepareFiles(id: string, total: number, progress: (ready: number, failed: number) => void, signal?: AbortSignal,indices?:number[],trace?:PhotoTrace,onTiming?:(stage:TimingStage,ms:number)=>void,options?:{messageTimeoutMs?:number}): Promise<{ files: File[]; errors: string[]; downloaded:number; failureCode?:PhotoErrorCode }> {
  if(!Number.isInteger(total) || total<0 || total>15)throw new Error('ფოტოების რაოდენობა არასწორია.')
  let failureCode:PhotoErrorCode|undefined
  const files: File[] = [], errors: string[] = []
  const selected=indices??Array.from({length:total},(_,i)=>i)
  if(selected.some(i=>!Number.isInteger(i)||i<0||i>=total)||new Set(selected).size!==selected.length)throw new Error('ფოტოს ნომერი არასწორია.')
  const timedRequest=async<T>(message:Parameters<typeof photoRequest>[0])=>{const started=performance.now();try{return await photoRequest<T>(message,signal,options?.messageTimeoutMs)}finally{onTiming?.('messaging',performance.now()-started)}}
  let next=0,ready=0,failed=0,downloaded=0,unavailable=false
  async function worker(){
  while(next<selected.length){
    const index=selected[next++]
    if(unavailable){errors[index]=`ფოტო ${index+1}: ფოტოების გადატანა ვერ დასრულდა`;failed++;progress(ready,failed);continue}
    let code:PhotoErrorCode='MESSAGE_FAILED'
    signal?.throwIfAborted()
    try {
      const metadata = await timedRequest<PhotoMetadata>({ type: 'PHOTO_PREPARE', id, index })
      signal?.throwIfAborted()
      code='INVALID_METADATA'
      if (metadata.size > 15 * 1024 * 1024 || metadata.index !== index) throw new Error('ფოტოს მეტამონაცემები არასწორია.')
      downloaded++
      const bytes = new Uint8Array(metadata.size)
      let offset = 0
      while (offset < metadata.size) {
        signal?.throwIfAborted()
        code='MESSAGE_FAILED'
        const base64 = await timedRequest<string>({ type: 'PHOTO_CHUNK', id, index, offset })
        code='INVALID_CHUNK'
        const decodeStarted=performance.now()
        const value = atob(base64)
        if (!value.length || offset + value.length > bytes.length) throw new Error('ფოტოს ნაწილი არასწორია.')
        for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
        offset += value.length
        onTiming?.('filePreparation',performance.now()-decodeStarted)
      }
      const fileStarted=performance.now()
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('')
      code='HASH_MISMATCH'
      if (hash !== metadata.sha256) throw new Error('ფოტოს მთლიანობის შემოწმება ვერ გაიარა.')
      signal?.throwIfAborted()
      code='FILE_CONVERSION_FAILED'
      files[index]=new File([bytes], metadata.name, { type: metadata.mime });ready++;onTiming?.('filePreparation',performance.now()-fileStarted)
    } catch (error) {
      code=error instanceof PhotoTransportError?error.code:code
      failureCode??=code
      // If none of the initial workers received even metadata, do not spend
      // another full timeout on each unsent batch after a lost worker/channel.
      if(code==='MESSAGE_TIMEOUT'&&downloaded===0)unavailable=true
      trace?.mark('PHOTO_PAYLOAD_RECEIVED',ready,{index,errorCode:code})
      signal?.throwIfAborted()
      errors[index]=`ფოტო ${index + 1}: ${error instanceof Error ? error.message : 'ჩამოტვირთვა ვერ მოხერხდა.'}`;failed++
    }
    progress(ready,failed)
  }}
  await Promise.all(Array.from({length:Math.min(PHOTO_DOWNLOAD_CONCURRENCY,selected.length)},()=>worker()))
  trace?.mark('PHOTO_PAYLOAD_RECEIVED',ready,failureCode?{errorCode:failureCode}:{})
  return { files:files.filter(Boolean), errors:errors.filter(Boolean),downloaded,failureCode }
}
