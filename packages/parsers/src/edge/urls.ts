// Only the CDN observed in the two supplied EDGE snapshots. No path rewriting.
export function edgePhotoUrl(input:unknown):string|undefined{
  if(typeof input!=='string'||input.length>2000)return
  try{
    const u=new URL(input.startsWith('//')?'https:'+input:input)
    if(!['http:','https:'].includes(u.protocol)||!['file3.autolookout.net','dxbrs3zlwqu4z.cloudfront.net'].includes(u.hostname)||u.port||u.username||u.password||u.hash||u.search)return
    if(u.hostname==='dxbrs3zlwqu4z.cloudfront.net'&&u.protocol!=='https:')return
    const name=u.pathname.split('/').pop()??''
    const imagePath=/\.(?:jpe?g|png|webp|avif|gif|bmp)$/i.test(name)||!name.includes('.')&&/^[a-z0-9_%=+-]{1,256}$/i.test(name)
    if(!imagePath||/(?:^|[\/_.-])(?:icons?|logos?|avatars?|banners?|placeholders?|loading|spinner|no[-_]?image|no[-_]?photo)(?:[\/_.-]|$)/i.test(u.pathname))return
    return u.href
  }catch{return}
}
function transform(segment:string){
  try{const text=atob(decodeURIComponent(segment));const match=text.match(/^;resolution:(\d+)x(\d+);$/);return match?Number(match[1])*Number(match[2]):undefined}catch{return}
}
export function edgePhotoIdentity(url:string){
  const u=new URL(url)
  // Both 100x75 and 1600x1200 transform segments occur for the same originals
  // in the snapshots. Remove only that verified transform from comparison.
  return u.host+u.pathname.split('/').filter(part=>transform(part)===undefined).join('/')
}
export function edgePhotoRank(url:string){return Math.max(0,...new URL(url).pathname.split('/').map(part=>transform(part)??0))}
export function edgeDetailId(url:string):string|undefined{
  try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname==='www.edgepipeline.com'&&!u.port)return u.pathname.match(/^\/components\/vehicle\/detail\/([a-f0-9]{32})\/?$/)?.[1]}catch{/* Unsupported route. */}
}
