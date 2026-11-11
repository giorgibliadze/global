export const auctionSites = [
  { name: 'Manheim', domain: 'manheim.com' },
  { name: 'ADESA', domain: 'adesa.com' },
  { name: 'Edge Pipeline', domain: 'edgepipeline.com' },
] as const

export type Website = {
  kind: 'auction' | 'destination' | 'unsupported'
  hostname: string
  name: string
}

const matchesDomain = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`)

export function detectWebsite(url?: string): Website {
  const unsupported: Website = { kind: 'unsupported', hostname: '', name: 'უცნობი ვებსაიტი' }
  if (!url) return unsupported
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) return { ...unsupported, name: 'ბრაუზერის გვერდი' }
    const hostname = parsed.hostname.toLowerCase()
    const auction = auctionSites.find((site) => matchesDomain(hostname, site.domain))
    if (auction) return { kind: 'auction', hostname, name: auction.name }
    if (matchesDomain(hostname, 'myauto.ge')) return { kind: 'destination', hostname, name: 'MyAuto' }
    return { ...unsupported, hostname, name: hostname }
  } catch {
    return unsupported
  }
}
