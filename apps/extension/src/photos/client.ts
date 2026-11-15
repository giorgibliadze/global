import {isPhotoErrorCode} from './checkpoints'
import type {PhotoTrace,PhotoErrorCode} from './checkpoints'
import type { PhotoMetadata } from '@auto-importer/shared'
import { extensionApi } from '../services/extensionApi'
class PhotoTransportError extends Error {readonly code:PhotoErrorCode;constructor(code:PhotoErrorCode){super('ფოტოების გადატანა ვერ დასრულდა');this.code=code}}
async function photoRequest<T>(message:{type:string;id:string;index:number;offset?:number}):Promise<T>{
  let result:{ok?:boolean;value?:T;photoErrorCode?:unknown}|undefined
  try{result=await extensionApi().runtime.sendMessage(message) as typeof result}catch{throw new PhotoTransportError('MESSAGE_FAILED')}
  if(!result || typeof result.ok!=='boolean')throw new PhotoTransportError('MESSAGE_FAILED')
  if(!result.ok)throw new PhotoTransportError(isPhotoErrorCode(result.photoErrorCode)?result.photoErrorCode:message.type==='PHOTO_PREPARE'?'BACKGROUND_PREPARATION_FAILED':'CHUNK_UNAVAILABLE')
  return result.value as T
}
export async function prepareFiles(id: string, total: number, progress: (ready: number, failed: number) => void, signal?: AbortSignal,indices?:number[],trace?:PhotoTrace): Promise<{ files: File[]; errors: string[]; downloaded:number; failureCode?:PhotoErrorCode }> {
  if(!Number.isInteger(total) || total<0 || total>15)throw new Error('ფოტოების რაოდენობა არასწორია.')
  let failureCode:PhotoErrorCode|undefined
  const files: File[] = [], errors: string[] = []
  const selected=indices??Array.from({length:total},(_,i)=>i)
  if(selected.some(i=>!Number.isInteger(i)||i<0||i>=total)||new Set(selected).size!==selected.length)throw new Error('ფოტოს ნომერი არასწორია.')
  let next=0,ready=0,failed=0,downloaded=0
  async function worker(){
  while(next<selected.length){
    const index=selected[next++]
    let code:PhotoErrorCode='MESSAGE_FAILED'
    signal?.throwIfAborted()
    try {
      const metadata = await photoRequest<PhotoMetadata>({ type: 'PHOTO_PREPARE', id, index })
      signal?.throwIfAborted()
      code='INVALID_METADATA'
      if (metadata.size > 15 * 1024 * 1024 || metadata.index !== index) throw new Error('ფოტოს მეტამონაცემები არასწორია.')
      downloaded++
      const bytes = new Uint8Array(metadata.size)
      let offset = 0
      while (offset < metadata.size) {
        signal?.throwIfAborted()
        code='MESSAGE_FAILED'
        const base64 = await photoRequest<string>({ type: 'PHOTO_CHUNK', id, index, offset })
        code='INVALID_CHUNK'
        const value = atob(base64)
        if (!value.length || offset + value.length > bytes.length) throw new Error('ფოტოს ნაწილი არასწორია.')
        for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
        offset += value.length
      }
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('')
      code='HASH_MISMATCH'
      if (hash !== metadata.sha256) throw new Error('ფოტოს მთლიანობის შემოწმება ვერ გაიარა.')
      signal?.throwIfAborted()
      code='FILE_CONVERSION_FAILED'
      files[index]=new File([bytes], metadata.name, { type: metadata.mime });ready++
    } catch (error) {
      code=error instanceof PhotoTransportError?error.code:code
      failureCode??=code
      trace?.mark('PHOTO_PAYLOAD_RECEIVED',ready,{index,errorCode:code})
      signal?.throwIfAborted()
      errors[index]=`ფოტო ${index + 1}: ${error instanceof Error ? error.message : 'ჩამოტვირთვა ვერ მოხერხდა.'}`;failed++
    }
    progress(ready,failed)
  }}
  await Promise.all(Array.from({length:Math.min(3,selected.length)},()=>worker()))
  trace?.mark('PHOTO_PAYLOAD_RECEIVED',ready,failureCode?{errorCode:failureCode}:{})
  return { files:files.filter(Boolean), errors:errors.filter(Boolean),downloaded,failureCode }
}
