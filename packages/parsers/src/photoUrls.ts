import {edgePhotoUrl} from './edge/urls'
export function safePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return
  try {
    const u = new URL(value)
    if(['file3.autolookout.net','dxbrs3zlwqu4z.cloudfront.net'].includes(u.hostname))return edgePhotoUrl(value)
    if (u.protocol !== 'https:' || u.username || u.password || u.hash) return
    if (!['i.fyuse.com', 'images.cdn.manheim.com', 'images--cdn.manheim24.com'].includes(u.hostname)) return
    if (!/\.(jpe?g|png|webp)$/i.test(u.pathname) || /\/(tags|icons|logos)\//i.test(u.pathname)) return
    // Fyusion's documented thumbnail transform; preserve all other allowed parameters.
    u.searchParams.delete('size')
    // Never persist/transmit signed URLs, authentication parameters, or arbitrary query data.
    if ([...u.searchParams.keys()].some(k => !['w', 'h', 'width', 'height', 'quality', 'format', 'fit', 'auto', 'crop'].includes(k))) return
    return u.href
  } catch { return }
}
// Identity excludes known image rendering transforms, not the vehicle/photo path.
export function photoIdentity(url:string):string {
  const u=new URL(url)
  return u.hostname+u.pathname.replace(/\/(?:1080p|720p|480p)\//,'/')
}
export function deduplicatePhotos(values: unknown[], limit = 15): string[] {
  const found = new Map<string, { url: string; rank: number }>()
  for (const value of values) {
    const url = safePhotoUrl(value)
    if (!url) continue
    const u = new URL(url)
    const key = photoIdentity(url)
    const rank = /\/1080p\//.test(u.pathname) ? 3 : /\/720p\//.test(u.pathname) ? 2 : 1
    if (!found.has(key) || found.get(key)!.rank < rank) found.set(key, { url, rank })
  }
  return [...found.values()].slice(0, limit).map(v => v.url)
}

