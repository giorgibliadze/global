import {edgePhotoUrl,edgePhotoIdentity,edgePhotoRank} from './urls'
export interface EdgeRuntimePhoto {full?:string;img?:string;thumb?:string}
// Deduplicate the complete bounded Fotorama dataset without a source photo cap. Read only
// documented image properties; no captions, arbitrary page state or credentials.
export function collectEdgeRuntimePhotos(data:unknown){
  const found=new Map<string,{photo:EdgeRuntimePhoto;rank:number}>()
  let invalid=0
  if(!Array.isArray(data)||data.length>1000)return {photos:[] as EdgeRuntimePhoto[],unique:0,frames:0,invalid:0}
  for(const row of data){
    if(!row||typeof row!=='object'){invalid++;continue}
    const item=row as Record<string,unknown>
    if(item.video)continue
    const candidates=(['full','img','thumb'] as const).flatMap((key,index)=>{const url=edgePhotoUrl(item[key]);return url?[{url,key,rank:(3-index)*1e12+edgePhotoRank(url)*2+(new URL(url).protocol==='https:'?1:0)}]:[]}).sort((a,b)=>b.rank-a.rank)
    const best=candidates[0]
    if(!best){if(!item.video)invalid++;continue}
    const identity=edgePhotoIdentity(best.url),old=found.get(identity)
    if(!old||best.rank>old.rank)found.set(identity,{photo:{[best.key]:best.url},rank:best.rank})
  }
  return {photos:[...found.values()].map(item=>item.photo),unique:found.size,frames:data.length,invalid}
}
