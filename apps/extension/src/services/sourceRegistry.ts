import {edgeDetailId} from '@auto-importer/parsers/edge-urls'
import {searchManheimRouteVin,manheim24SearchRouteVin} from '@auto-importer/shared'
// Independent vehicle adapters. Website support is broader than implemented parsers.
export const vehicleSources=[
  {id:'Manheim24',rootSelector:'.VehicleDetails__container'},
  {id:'ManheimSearch',rootSelector:'[data-test-id="vehicle-details-view-container"]'},
  {id:'ManheimSite',rootSelector:'[data-test-id="vehicle-details-view-container"],.VehicleDetails__container'},
  {id:'Manheim24Search',rootSelector:'.VehicleDetails__container'},
  {id:'EdgePipeline',rootSelector:'#vdp'},
] as const
export function vehicleSource(url?:string){
  try{
    const u=new URL(url!)
    if(u.protocol!=='https:')return
    if(u.hostname==='www.edgepipeline.com')return vehicleSources[4]
    if(u.hostname==='search.manheim24.com')return vehicleSources[3]
    if(u.hostname==='manheim24.com'||u.hostname.endsWith('.manheim24.com'))return vehicleSources[0]
    if(u.hostname==='search.manheim.com')return vehicleSources[1]
    if(u.hostname==='site.manheim.com')return vehicleSources[2]
  }catch{/* Unsupported page. */}
}
export const supportsVehicleHostname=(hostname?:string)=>!!hostname&&!!vehicleSource(`https://${hostname}`)

// URL eligibility is only a first gate. DOM identity must still be verified.
export function vehicleDetailUrl(url?:string){
  const source=vehicleSource(url)
  return source?.id==='EdgePipeline'&&!!edgeDetailId(url!)||source?.id==='Manheim24Search'&&!!manheim24SearchRouteVin(url!)||source?.id==='ManheimSite'||source?.id==='Manheim24'||source?.id==='ManheimSearch'&&!!searchManheimRouteVin(url!)
}
