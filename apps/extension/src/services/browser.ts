import { detectWebsite } from './website'

// The popup only needs this small subset of the Chrome API.
interface ChromeApi {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ url?: string }>> }
  runtime: { getManifest(): { version: string } }
}
function getChrome(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome
}
export async function getCurrentWebsite() {
  const chrome = getChrome()
  if (!chrome?.tabs) throw new Error('Tab detection is unavailable.')
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return detectWebsite(tab?.url)
}
export function getExtensionVersion(): string {
  return getChrome()?.runtime?.getManifest().version ?? 'Preview'
}
