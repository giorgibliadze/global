const signatures=new WeakMap<Document,string>()
export function edgeGalleryDiagnostic(doc:Document,listingId:string,counts:{discovered:number;validUnique:number;selected:number;ready:boolean;stale:boolean;source:'runtime'|'dom'},started:number){
  if((import.meta as ImportMeta&{env?:{DEV:boolean}}).env?.DEV!==true)return
  const signature=JSON.stringify([listingId,counts])
  if(signatures.get(doc)===signature)return
  signatures.set(doc,signature)
  // No VIN, image URLs, exception text, credentials or arbitrary source data.
  for(const [stage,photoCount] of [['EDGE_GALLERY_FOUND',1],['EDGE_GALLERY_TOTAL',counts.discovered],['EDGE_PHOTO_CANDIDATES',counts.discovered],['EDGE_PHOTO_UNIQUE',counts.validUnique]])console.debug('[Auto Importer EDGE]',{stage,transferId:'pending',vehicleId:listingId,timestamp:new Date().toISOString(),photoCount,durationMs:Math.round(performance.now()-started)})
  console.debug('[Auto Importer EDGE]',{stage:'EDGE_GALLERY',listingId,timestamp:new Date().toISOString(),durationMs:Math.round(performance.now()-started),...counts})
}
