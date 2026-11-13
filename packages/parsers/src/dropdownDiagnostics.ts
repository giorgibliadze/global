import { containsVinCode } from './vinPrivacy'
export interface DropdownDiagnostic {
  cacheHit?:boolean
  discoveryMs?:number;selectionMs?:number;matchingMs?:number;verificationMs?:number
  field:string;selector:string;controlType:'custom'|'combobox'|'native'|'unavailable'
  opened:boolean;optionCount:number;expected:string[];matched:boolean;verified:boolean
  outcome:'inspected'|'selected'|'unavailable'|'protected'|'ambiguous'|'not-discovered'|'not-matched'|'not-verified'|'interaction-error'
}
export function safeExpected(values:string[]):string[] {
  return values.slice(0,8).map(value=>{
    const separatedVin=/(?<![A-Z0-9])[A-HJ-NPR-Z0-9](?:[\s-]*[A-HJ-NPR-Z0-9]){16}(?![A-Z0-9])/g
    const privateValue=value.length>200 || containsVinCode(value,'') || containsVinCode(value.replace(/[\s-]/g,''),'')
      || [...value.normalize('NFKC').toUpperCase().matchAll(separatedVin)].some(match=>/\d/.test(match[0]))
      || /%[0-9a-f]{2}|&#|[\u200B-\u200D\uFEFF]|\b(?:Bearer|Cookie|authorization|session|access[_-]?token)\b/i.test(value)
    return privateValue?'[redacted]':value
  })
}
export function reportDropdown(diagnostic:DropdownDiagnostic) {
  // No option contents, form payloads, exceptions, VINs, URLs or arbitrary DOM attributes.
  console.info('[Auto Importer dropdown]',diagnostic)
}
