import { assertNormalizedVehicle } from '@auto-importer/parsers/validation'
import { myautoFields } from '@auto-importer/parsers/myauto'
import type { NormalizedVehicle, PreparedFormField, PreparationSummary } from '@auto-importer/shared'
import { timingLog } from '../services/diagnostics'

const TTL=120000,LIMIT=20
export interface PreparedVehicle {vehicle:NormalizedVehicle;fields:PreparedFormField[];summary:PreparationSummary;key:string}
export class PreparedVehicles {
  private generations=new Map<number,string>()
  private entries=new Map<string,PreparedVehicle>()
  private active=new Map<number,string>()
  invalidate(tab:number,id:string){this.remove(tab);this.generations.set(tab,id);while(this.generations.size>LIMIT)this.remove(this.generations.keys().next().value!)}
  prepare(tab:number,id:string,vehicle:NormalizedVehicle,observedAt:number):PreparedVehicle|undefined {
    if(this.generations.get(tab)!==id)return
    assertNormalizedVehicle(vehicle)
    const started=performance.now(),fields=myautoFields(vehicle),normalizationMs=performance.now()-started
    const now=Date.now()
    const entry:PreparedVehicle={vehicle:structuredClone(vehicle),fields,key:`${tab}:`+(vehicle.listingId?`listing:${vehicle.listingId}`:`vin:${vehicle.vin}`),summary:{id,extractedAt:now,durationMs:Math.max(0,now-observedAt),normalizationMs,cacheHit:false}}
    this.entries.set(entry.key,entry);this.active.set(tab,entry.key)
    timingLog(id,'prefetchNormalization',normalizationMs);timingLog(id,'prefetch',entry.summary.durationMs)
    return structuredClone(entry)
  }
  get(tab:number,id:string):PreparedVehicle|undefined {
    const key=this.active.get(tab),entry=key?this.entries.get(key):undefined
    if(!entry || entry.summary.id!==id || this.generations.get(tab)!==id)return
    if(Date.now()-entry.summary.extractedAt>=TTL){this.entries.delete(key!);this.active.delete(tab);return}
    const result=structuredClone(entry);result.summary.cacheHit=true;return result
  }
  remove(tab:number){const key=this.active.get(tab);if(key)this.entries.delete(key);this.active.delete(tab);this.generations.delete(tab)}
}
