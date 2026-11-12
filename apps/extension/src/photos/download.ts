import { safePhotoUrl } from '@auto-importer/parsers'
import type { PhotoMetadata } from '@auto-importer/shared'

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024
export const MAX_TRANSFER_BYTES = 15 * MAX_PHOTO_BYTES
export const PHOTO_CHUNK_BYTES = 192 * 1024
export function imageMime(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return 'image/png'
  if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp'
}
export function base64Bytes(bytes: Uint8Array): string {
  let value = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(value)
}
class DownloadError extends Error { readonly retry: boolean; constructor(message: string, retry: boolean) { super(message); this.retry = retry } }
export async function downloadPhoto(url: string, index: number, fetcher: typeof fetch = fetch): Promise<{ blob: Blob; metadata: PhotoMetadata }> {
  if (safePhotoUrl(url) !== url) throw new Error('ფოტოს მისამართი დაუშვებელია ან შეიცავს დაუდასტურებელ ავტორიზაციის პარამეტრებს.')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, { credentials: 'include', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000), cache: 'no-store' })
      if (!response.ok) throw new DownloadError(
        response.status === 401 || response.status === 403 ? 'ფოტოზე წვდომა უარყოფილია. შეამოწმეთ თქვენი ავტორიზებული სესია; წვდომის შეზღუდვა არ გადალახულა.' : `ფოტოს სერვერმა დააბრუნა შეცდომა (${response.status}).`,
        response.status >= 500 || response.status === 429,
      )
      if (Number(response.headers.get('content-length')) > MAX_PHOTO_BYTES) throw new DownloadError('ფოტოს ზომა აღემატება 15 მბ-ს.', false)
      const reader = response.body?.getReader()
      if (!reader) throw new DownloadError('ფოტოს სერვერმა ფაილის ნაკადი არ დააბრუნა.', false)
      const parts: Uint8Array<ArrayBuffer>[] = []
      let size = 0
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_PHOTO_BYTES) throw new DownloadError('ფოტოს ზომა აღემატება 15 მბ-ს.', false)
          parts.push(new Uint8Array(value))
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const part of parts) { bytes.set(part, offset); offset += part.length }
      const mime = imageMime(bytes)
      if (!mime) throw new DownloadError('პასუხი მხარდაჭერილი ფოტო არ არის. ავტორიზაციის გვერდი ან სხვა ფაილი ფოტოდ არ ჩაითვალა.', false)
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      const sha256 = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
      const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
      return { blob: new Blob([bytes], { type: mime }), metadata: { index, name: `vehicle-${String(index + 1).padStart(2, '0')}.${extension}`, mime, size, sha256 } }
    } catch (error) {
      if (error instanceof DownloadError && !error.retry) throw error
      if (attempt === 2) throw new Error(error instanceof DownloadError ? error.message : 'ფოტოს ჩამოტვირთვა ვერ მოხერხდა დროის ამოწურვის, ქსელის, გადამისამართების ან ბრაუზერის წვდომის შეზღუდვის გამო.', { cause: error })
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
  throw new Error('ფოტოს მომზადება ვერ მოხერხდა.')
}
