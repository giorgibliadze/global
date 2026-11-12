export interface UploadResult { verified: number; errors: string[] }
export const photoContainerSelector = '[data-testid="photo-video-container"]'
export const photoInputSelector = '[data-testid="photo-video-dropzone"] input[type="file"]'
export function photoCount(container: Element): number | undefined {
  const match = container.textContent?.match(/ფოტო\s*(\d+)\s*\/\s*15/)
  return match ? Number(match[1]) : undefined
}
function potentialPreviews(container: Element): HTMLImageElement[] {
  return [...container.querySelectorAll<HTMLImageElement>('img')].filter(img => {
    try {
      const url = new URL(img.currentSrc || img.src)
      return !url.pathname.startsWith('/build/assets/') && !/\.svg$/i.test(url.pathname) && ['https:','blob:','data:'].includes(url.protocol)
    } catch { return false }
  })
}
function remotePreviews(container: Element): HTMLImageElement[] {
  return potentialPreviews(container).filter(img => {
    try { return new URL(img.currentSrc || img.src).protocol === 'https:' && img.complete && img.naturalWidth >= 128 } catch { return false }
  })
}
export function assertFreshMyauto(doc: Document) {
  for (const selector of ['input[name="primaryFeatures.vinCode"]','input[name="primaryFeatures.customModel"]','input[name="primaryFeatures.mileage"]','[data-testid="description-textarea"]']) {
    if (doc.querySelector<HTMLInputElement>(selector)?.value.trim()) throw new Error('ახალი ფორმა უკვე შეიცავს მონაცემებს. არსებული განცხადება არ გადაგვიწერია. გახსენით სუფთა ფორმა და დაიწყეთ ახალი გადატანა.')
  }
  if (doc.querySelector('[data-testid="single-select-value-primaryFeatures.manufacturer"]')?.textContent?.trim()) throw new Error('ახალ ფორმაში მწარმოებელი უკვე არჩეულია. არსებული მონაცემები არ გადაგვიწერია.')
  const container = doc.querySelector(photoContainerSelector)
  if (container && ((photoCount(container) ?? 0) > 0 || remotePreviews(container).length > 0)) throw new Error('ფორმაში ფოტოები უკვე არის. ავტომობილების ფოტოები არ შეირევა.')
}
async function uploadAttempt(doc: Document, files: File[], progress: (confirmed: number) => void, options: { timeoutMs?: number; signal?: AbortSignal; guard?: () => void } = {}): Promise<UploadResult> {
  if (!files.length) return { verified: 0, errors: ['არცერთი ფოტო არ მომზადდა. ატვირთვა არ დაწყებულა.'] }
  if (files.length > 15) return { verified: 0, errors: ['ფოტოების რაოდენობა აღემატება 15-ს.'] }
  const container = doc.querySelector(photoContainerSelector)
  const input = doc.querySelector<HTMLInputElement>(photoInputSelector)
  if (!container || !input || input.disabled || !doc.defaultView?.DataTransfer) return { verified: 0, errors: ['MyAuto-ს დადასტურებული ფაილის ამრჩევი ან ბრაუზერის ფაილების გადაცემის მექანიზმი მიუწვდომელია.'] }
  // The saved form confirms the container and count but not an uploaded gallery layout.
  // Verify observed new remote previews AND the site's own count; FileList alone is never success.
  const beforeCount = photoCount(container)
  if (beforeCount !== 0 || remotePreviews(container).length) return { verified: 0, errors: ['ფოტოების სია ცარიელი არ არის ან საწყისი რაოდენობა ვერ დადასტურდა. ხელახალი ატვირთვა შეჩერებულია დუბლირების თავიდან ასაცილებლად.'] }
  const initial = new Set([...container.querySelectorAll<HTMLImageElement>('img')].map(img => img.currentSrc || img.src))
  options.guard?.(); options.signal?.throwIfAborted()
  try {
    const transfer = new doc.defaultView.DataTransfer()
    for (const file of files) transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }))
    input.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }))
  } catch { return { verified: 0, errors: ['ბრაუზერმა ფაილების მინიჭება არ დაუშვა. ატვირთვა არ დადასტურებულა.'] } }
  await new Promise(resolve => setTimeout(resolve, 50))
  const start = Date.now()
  let stableSince = 0
  while (Date.now() - start < (options.timeoutMs ?? 45000)) {
    options.signal?.throwIfAborted(); options.guard?.()
    const current = doc.querySelector(photoContainerSelector)
    if (!current) return { verified: 0, errors: ['ატვირთვის კომპონენტი გვერდიდან გაქრა.'] }
    const explicitError = [...current.querySelectorAll('[role="alert"], [aria-invalid="true"]')].some(el => !!el.textContent?.trim())
    if (explicitError) return { verified: 0, errors: ['MyAuto-ს ატვირთვის კომპონენტმა შეცდომა აჩვენა. ავტომატური ხელახალი მინიჭება არ შესრულდა შესაძლო დუბლირების გამო.'] }
    const previews = new Set(remotePreviews(current).filter(img => !initial.has(img.currentSrc || img.src)).map(img => img.currentSrc || img.src))
    const count = photoCount(current)
    const busy = !!current.querySelector('[aria-busy="true"], [role="progressbar"], progress')
    if (previews.size === files.length && count === files.length && !busy) {
      stableSince ||= Date.now()
      if (Date.now() - stableSince >= Math.min(1000, (options.timeoutMs ?? 45000) / 4)) {
        progress(files.length)
        return { verified: files.length, errors: [] }
      }
    } else stableSince = 0
    // An immediate blob preview is not evidence of server upload completion.
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return { verified: 0, errors: ['ფაილები გადაეცა ამრჩევს, მაგრამ MyAuto-ს რაოდენობითა და ჩატვირთული სერვერული პრევიუებით ატვირთვა ვერ დადასტურდა. საჭიროა ატვირთული გალერეის DOM-ის ცოცხალი შემოწმება; მხოლოდ ლოკალური პრევიუ წარმატებად არ ჩაითვალა.'] }
}

export async function uploadPhotos(doc: Document, files: File[], progress: (confirmed: number) => void, options: { timeoutMs?: number; signal?: AbortSignal; guard?: () => void } = {}): Promise<UploadResult> {
  let last: UploadResult = { verified: 0, errors: [] }
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await uploadAttempt(doc, files, progress, options)
    if (last.verified > 0) return last
    const container = doc.querySelector(photoContainerSelector)
    const input = doc.querySelector<HTMLInputElement>(photoInputSelector)
    // Retry only after the SITE acknowledges failure and clears its queue and all previews.
    // Unknown/pending state must never be retried automatically and duplicate photos.
    const acknowledged = container?.querySelector('[role="alert"]')?.textContent?.trim()
    const safeRetry = acknowledged && container && photoCount(container) === 0 && potentialPreviews(container).length === 0 && input?.files?.length === 0 && !container.querySelector('[aria-busy="true"], [role="progressbar"], progress')
    if (!safeRetry || attempt === 1) return last
    options.signal?.throwIfAborted(); options.guard?.()
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return last
}
