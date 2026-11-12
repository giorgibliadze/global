const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
export interface DropdownSelection { optionId: string; optionLabel: string; match: 'exact' | 'equivalent' }
export interface DropdownValue { allowReplaceSelection?: boolean; candidates: string[]; equivalents?: string[]; engineCc?: number; onSelected?: (selection: DropdownSelection) => void }
export function optionRank(label: string, value: DropdownValue): number {
  if (value.engineCc !== undefined) {
    const match = label.trim().match(/^(\d+(?:[.,]\d+)?)\s*(ლ|l|ლიტრი|სმ³|სმ3|cc|cm3|cm³)$/i)
    if (!match) return Infinity // A bare number does not establish the dropdown's unit.
    const cc = Number(match[1].replace(',', '.')) * (/^(ლ|l|ლიტრი)$/i.test(match[2]) ? 1000 : 1)
    if (Math.abs(cc-value.engineCc) >= 0.01) return Infinity
    return value.candidates.some(candidate => normalize(candidate) === normalize(label)) ? 0 : 1
  }
  if (value.candidates.some(candidate => normalize(candidate) === normalize(label))) return 0
  return value.equivalents?.some(candidate => normalize(candidate) === normalize(label)) ? 1 : Infinity
}
export function matchesOption(label: string, value: DropdownValue): boolean { return Number.isFinite(optionRank(label,value)) }
const shown = (el: HTMLElement) => {
  let current: Element | null = el
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current)
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden') return false
    current = current.parentElement
  }
  return true
}
export async function selectDropdown(doc: Document, key: string, value: DropdownValue, timeoutMs = 3000, signal?: AbortSignal): Promise<string | undefined> {
  const selector = `[data-testid="single-select-primaryFeatures.${key}"]`
  const valueSelector = `[data-testid="single-select-value-primaryFeatures.${key}"]`
  const selected = () => doc.querySelector(valueSelector)?.textContent?.trim() ?? ''
  function confirmSelection(): boolean {
    const optionId = doc.querySelector<HTMLInputElement>(`[data-testid="single-select-input-primaryFeatures.${key}"]`)?.value
    const label = selected(), rank = optionRank(label,value)
    if (!optionId || optionId.length > 200 || !Number.isFinite(rank)) return false
    value.onSelected?.({optionId,optionLabel:label,match:rank === 0 ? 'exact' : 'equivalent'})
    return true
  }
  signal?.throwIfAborted()
  if (confirmSelection()) return
  if (selected() && !value.allowReplaceSelection) return 'არსებული ჩამოსაშლელი არჩევანი არ გადაგვიწერია.'
  const trigger = doc.querySelector<HTMLElement>(`[data-testid="single-select-trigger-primaryFeatures.${key}"]`)
  if (!trigger || trigger.getAttribute('aria-disabled') === 'true') return 'ჩამოსაშლელი კონტროლი არ არის მზად ან მიუწვდომელია.'
  trigger.click()
  const started = Date.now()
  let chosen = false
  while (Date.now() - started < timeoutMs) {
    signal?.throwIfAborted()
    if (chosen && confirmSelection()) return
    const owner = doc.querySelector<HTMLElement>(selector)
    if (!owner) return 'ჩამოსაშლელი კონტროლი შეიცვალა.'
    // Only inspect actual accessible options owned by this confirmed component.
    // Portals require an explicit aria-controls relationship; never click global text matches.
    const controls = [owner, trigger, ...owner.querySelectorAll<HTMLElement>('[aria-controls]')]
    const scopes = new Set<Element>([owner])
    for (const control of controls) for (const id of (control.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean)) {
      const list = doc.getElementById(id)
      if (list?.getAttribute('role') === 'listbox') scopes.add(list)
    }
    const options = [...new Set([...scopes].flatMap(scope => [...scope.querySelectorAll<HTMLElement>('[role="option"]')]))].filter(shown)
    const eligible = options.filter(option => option.getAttribute('aria-disabled') !== 'true')
    const best = Math.min(...eligible.map(option => optionRank(option.getAttribute('aria-label') ?? option.textContent ?? '',value)))
    const matches = Number.isFinite(best) ? eligible.filter(option => optionRank(option.getAttribute('aria-label') ?? option.textContent ?? '',value) === best) : []
    if (!chosen && matches.length === 1) { matches[0].click(); chosen = true }
    else if (matches.length > 1) return 'ზუსტი ვარიანტი ერთმნიშვნელოვნად ვერ განისაზღვრა.'
    await new Promise(resolve => setTimeout(resolve, Math.min(100, timeoutMs)))
  }
  // Do not leave extension-opened menus covering subsequent controls.
  if (trigger.getAttribute('aria-expanded') === 'true') trigger.click()
  return chosen ? 'ვარიანტი დაჭერილია, მაგრამ არჩეული მნიშვნელობა ვერ დადასტურდა.' : 'ამ კონტროლს არ გამოუჩენია კუთვნილი ხელმისაწვდომი ვარიანტები ან ზუსტი შესაბამისობა. საჭიროა გახსნილი სიის DOM-ის შემოწმება.'
}
