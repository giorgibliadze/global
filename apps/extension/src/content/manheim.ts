import { pipelineLog } from '../services/diagnostics'
import { parseManheim24 } from '@auto-importer/parsers'
import { operation, optionalExtensionApi } from '../services/extensionApi'

export function registerManheimParser(doc: Document = document) {
  const api = optionalExtensionApi()
  if (!api?.runtime?.onMessage) return
  api.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== api.runtime.id || operation(message) !== 'MANHEIM_PARSE') return
    const id=(message as {transferId?:unknown}).transferId
    pipelineLog(id,'extracting','started')
    try { const vehicle=parseManheim24(doc); pipelineLog(id,'extracting','completed'); reply({ ok: true, vehicle }) }
    catch (error) { pipelineLog(id,'extracting','failed'); reply({ ok: false, error: error instanceof Error ? error.message : 'ავტომობილის ამოცნობა ვერ მოხერხდა.' }) }
  })
}
