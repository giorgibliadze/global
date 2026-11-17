import {vehicleDetailUrl,vehicleSource} from './sourceRegistry'
import { detectWebsite } from './website'

// The popup only needs this small subset of the Chrome API.
interface ChromeApi {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?:number;url?: string }>>;sendMessage?(tabId:number,message:unknown):Promise<unknown> }
  runtime: { getManifest(): { version: string }; getURL(path: string): string }
}
function getChrome(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome
}
export async function getCurrentWebsite() {
  const chrome = getChrome()
  if (!chrome?.tabs) throw new Error('აქტიური ჩანართის ამოცნობა ვერ მოხერხდა.')
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const website=detectWebsite(tab?.url),source=vehicleSource(tab?.url)
  if(!source||!vehicleDetailUrl(tab?.url)||tab?.id===undefined||!chrome.tabs.sendMessage)return website
  try{
    const response=await chrome.tabs.sendMessage(tab.id,{type:'VEHICLE_STATUS'}) as {ok?:boolean;value?:{source?:string;vehicle?:boolean}}
    return {...website,transferReady:response?.ok===true&&response.value?.source===source.id&&response.value.vehicle===true}
  }catch{return {...website,transferReady:false}}
}
export function getExtensionVersion(): string {
  return getChrome()?.runtime?.getManifest().version ?? 'სატესტო'
}

export function getExtensionAssetUrl(path: string): string {
  return getChrome()?.runtime?.getURL?.(path) ?? `/${path}`
}
