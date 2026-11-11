import { detectWebsite } from './website'

// The popup only needs this small subset of the Chrome API.
interface ChromeApi {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ url?: string }>> }
  runtime: { getManifest(): { version: string }; getURL(path: string): string }
}
function getChrome(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome
}
export async function getCurrentWebsite() {
  const chrome = getChrome()
  if (!chrome?.tabs) throw new Error('აქტიური ჩანართის ამოცნობა ვერ მოხერხდა.')
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return detectWebsite(tab?.url)
}
export function getExtensionVersion(): string {
  return getChrome()?.runtime?.getManifest().version ?? 'სატესტო'
}

export function getExtensionAssetUrl(path: string): string {
  return getChrome()?.runtime?.getURL?.(path) ?? `/${path}`
}
