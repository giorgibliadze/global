// Pre-standard chassis numbers are accepted only for an independently identified
// EDGE listing and a pre-1981 source year. Modern/other-platform rules stay strict.
export function edgeLegacyIdentity(vin:unknown,year:unknown,listingId:unknown){
  return typeof vin==='string'&&/^[A-Z0-9]{5,16}$/.test(vin)&&!/^(?:UNKNOWN|UNAVAILABLE|PENDING|NOTAVAILABLE|NULL|NONE|UNDEFINED)$/.test(vin)&&typeof year==='number'&&Number.isInteger(year)&&year>=1886&&year<1981&&typeof listingId==='string'&&/^[a-f0-9]{32}$/.test(listingId)
}
