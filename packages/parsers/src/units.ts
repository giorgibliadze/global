// Exact, platform-independent numeric conversions. Never infer missing units.
export const milesToKm = (miles: number) => miles * 1.609344
export function engineToCc(value: string): number | undefined {
  const m = value.match(/^\s*(\d+(?:\.\d+)?)\s*(L|liters?|litres?|cc|cm3|cm³)\s*$/i)
  return m ? Math.round(Number(m[1]) * (/^l/i.test(m[2]) ? 1000 : 1)) : undefined
}

