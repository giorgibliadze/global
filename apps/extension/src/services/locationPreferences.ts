import {exactLocation} from '@auto-importer/parsers/location'
import type {ExtensionApi} from './extensionApi'
const preferenceKey='auto-importer:listing-location:v1'
export async function getLocationPreference(api:ExtensionApi):Promise<string|undefined>{
  const value=(await api.storage.local?.get(preferenceKey))?.[preferenceKey]
  return exactLocation(value)?value:undefined
}
export async function setLocationPreference(api:ExtensionApi,value:unknown):Promise<string|undefined>{
  if(value!==undefined && value!=='' && !exactLocation(value))throw new Error('მდებარეობის ვარიანტი არასწორია.')
  const store=api.storage.local
  if(!store)throw new Error('მდებარეობის პარამეტრის შენახვა მიუწვდომელია.')
  if(!value){await store.remove(preferenceKey);return}
  await store.set({[preferenceKey]:value});return value as string
}
