import {parseManheim24Search,inspectManheim24SearchSelection,inspectManheim24SearchPhotos} from '@auto-importer/parsers/manheim24-search'
import {parseSiteManheim,inspectSiteManheimSelection,inspectSiteManheimPhotos} from '@auto-importer/parsers/site-manheim'
import {parseManheim24,inspectManheim24Selection,inspectManheim24Photos} from '@auto-importer/parsers'
import {parseSearchManheim,inspectSearchManheimSelection,inspectSearchManheimPhotos} from '@auto-importer/parsers/search-manheim'
import type {NormalizedVehicle} from '@auto-importer/shared'
import {vehicleSources} from '../services/sourceRegistry'
export interface VehicleAdapter {
  id:NormalizedVehicle['source']
  rootSelector:string
  parse(doc:Document,url?:string):NormalizedVehicle
  selection(doc:Document,url?:string):{root:Element;key:string}
  photos(doc:Document,url?:string):ReturnType<typeof inspectManheim24Photos>
}
export const manheim24Adapter:VehicleAdapter={...vehicleSources[0],parse:parseManheim24,selection:inspectManheim24Selection,photos:inspectManheim24Photos}
export const searchManheimAdapter:VehicleAdapter={...vehicleSources[1],parse:parseSearchManheim,selection:inspectSearchManheimSelection,photos:inspectSearchManheimPhotos}

export const siteManheimAdapter:VehicleAdapter={...vehicleSources[2],parse:parseSiteManheim,selection:inspectSiteManheimSelection,photos:inspectSiteManheimPhotos}

export const manheim24SearchAdapter:VehicleAdapter={...vehicleSources[3],parse:parseManheim24Search,selection:inspectManheim24SearchSelection,photos:inspectManheim24SearchPhotos}
