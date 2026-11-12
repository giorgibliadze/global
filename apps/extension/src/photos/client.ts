import type { PhotoMetadata } from '@auto-importer/shared'
import { request } from '../services/extensionApi'
export async function prepareFiles(id: string, total: number, progress: (ready: number, failed: number) => void, signal?: AbortSignal): Promise<{ files: File[]; errors: string[] }> {
  const files: File[] = [], errors: string[] = []
  for (let index = 0; index < total; index++) {
    signal?.throwIfAborted()
    try {
      const metadata = await request<PhotoMetadata>({ type: 'PHOTO_PREPARE', id, index })
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
      files.push(new File([bytes], metadata.name, { type: metadata.mime }))
    } catch (error) {
      signal?.throwIfAborted()
      errors.push(`ფოტო ${index + 1}: ${error instanceof Error ? error.message : 'ჩამოტვირთვა ვერ მოხერხდა.'}`)
    }
    progress(files.length, errors.length)
  }
  return { files, errors }
}
