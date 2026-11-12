import { parseManheim24 } from '@auto-importer/parsers'
import { operation, optionalExtensionApi } from '../services/extensionApi'

export function registerManheimParser() {
  const api = optionalExtensionApi()
  if (!api?.runtime?.onMessage) return
  api.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== api.runtime.id || operation(message) !== 'MANHEIM_PARSE') return
    try { reply({ ok: true, vehicle: parseManheim24(document) }) }
    catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : 'ავტომობილის ამოცნობა ვერ მოხერხდა.' }) }
  })
}
