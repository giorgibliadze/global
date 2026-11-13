import type { PhotoMetadata } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
export async function prepareFiles(id: string, total: number, progress: (ready: number, failed: number) => void, signal?: AbortSignal): Promise<{ files: File[]; errors: string[] }> {
  if(!Number.isInteger(total) || total<0 || total>15)throw new Error('ფოტოების რაოდენობა არასწორია.')
  const files: File[] = [], errors: string[] = []
  let next=0,ready=0,failed=0
  async function worker(){
  while(next<total){
    const index=next++
    signal?.throwIfAborted()
    try {
      const metadata = await request<PhotoMetadata>({ type: 'PHOTO_PREPARE', id, index })
      signal?.throwIfAborted()
      if (metadata.size > 15 * 1024 * 1024 || metadata.index !== index) throw new Error('ფოტოს მეტამონაცემები არასწორია.')
      const bytes = new Uint8Array(metadata.size)
      let offset = 0
      while (offset < metadata.size) {
        signal?.throwIfAborted()
        const base64 = await request<string>({ type: 'PHOTO_CHUNK', id, index, offset })
        const value = atob(base64)
        if (!value.length || offset + value.length > bytes.length) throw new Error('ფოტოს ნაწილი არასწორია.')
        for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
        offset += value.length
      }
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('')
      if (hash !== metadata.sha256) throw new Error('ფოტოს მთლიანობის შემოწმება ვერ გაიარა.')
      signal?.throwIfAborted()
      files[index]=new File([bytes], metadata.name, { type: metadata.mime });ready++
    } catch (error) {
      signal?.throwIfAborted()
      errors[index]=`ფოტო ${index + 1}: ${error instanceof Error ? error.message : 'ჩამოტვირთვა ვერ მოხერხდა.'}`;failed++
    }
    progress(ready,failed)
  }}
  await Promise.all(Array.from({length:Math.min(3,total)},()=>worker()))
  return { files:files.filter(Boolean), errors:errors.filter(Boolean) }
}
