import { createServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import ts from 'typescript'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><meta charset="utf-8"><pre></pre><script>addEventListener("error",e=>{document.body.dataset.result="FAIL";document.querySelector("pre").textContent=e.message||"Module load failed"});addEventListener("unhandledrejection",e=>{document.body.dataset.result="FAIL";document.querySelector("pre").textContent=String(e.reason)})</script><script type="importmap">{"imports":{"@auto-importer/parsers":"/packages/parsers/src/manheim24","@auto-importer/parsers/myauto":"/packages/parsers/src/myauto","@auto-importer/parsers/validation":"/packages/parsers/src/validation","@auto-importer/parsers/normalization":"/packages/parsers/src/normalization","@auto-importer/shared":"/packages/shared/src/index"}}</script><script type="module" src="/packages/parsers/tests/workflow.browser.ts"></script>'); return }
    if (!['/packages/parsers/', '/apps/extension/src/background/', '/apps/extension/src/myauto/', '/apps/extension/src/content/manheim', '/apps/extension/src/services/extensionApi', '/apps/extension/src/services/diagnostics', '/apps/extension/src/services/domReady', '/apps/extension/src/photos/', '/packages/shared/'].some(prefix => path.startsWith(prefix))) throw new Error('Not a fixture')
    const file = resolve(root, '.' + path + (['.ts','.html'].includes(extname(path)) ? '' : '.ts'))
    if (!file.startsWith(root)) throw new Error('Invalid path')
    let text = await readFile(file, 'utf8')
    if (file.endsWith('.ts')) text = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
    res.setHeader('Content-Type', file.endsWith('.ts') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8')
    res.end(text)
  } catch { res.writeHead(404); res.end('Not found') }
})
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = await mkdtemp(join(tmpdir(), 'import-workflow-'))
let chromeProcess
try {
  const endpoint = await new Promise((resolve, reject) => {
    chromeProcess = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--no-proxy-server','--disable-background-networking',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'], { stdio:['ignore','ignore','pipe'] })
    let stderr = ''
    const timeout = setTimeout(() => reject(new Error('Chrome debug endpoint timed out')),15000)
    chromeProcess.stderr.on('data', chunk => {
      stderr += chunk
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
    chromeProcess.on('error',reject)
    chromeProcess.on('exit',code => { clearTimeout(timeout); reject(new Error(`Chrome exited ${code}`)) })
  })
  const socket = new WebSocket(endpoint)
  await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}) })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { const task=pending.get(message.id); pending.delete(message.id); message.error ? task?.reject(new Error(message.error.message)) : task?.resolve(message.result) }
  })
  const command = (method,params={},sessionId) => new Promise((resolve,reject) => {
    const id=++nextId; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params,sessionId}))
  })
  const {targetId}=await command('Target.createTarget',{url:`http://localhost:${server.address().port}/`})
  const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true})
  let status,report='No test report'
  for(let attempt=0;attempt<800;attempt++) {
    const result=await command('Runtime.evaluate',{expression:'JSON.stringify({status:document.body?.dataset.result,report:document.querySelector("pre")?.textContent})',returnByValue:true},sessionId)
    const state=JSON.parse(result.result.value ?? '{}')
    status=state.status; report=state.report ?? report
    if(status==='PASS'||status==='FAIL') break
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  console.log(report)
  socket.close()
  assert.equal(status,'PASS','Workflow fixture failed; see report above')
  console.log('Sanitized parser, binary photo transport/uploader and orchestration tests passed. This is not a live authenticated end-to-end test.')
} finally {
  chromeProcess?.kill()
  await new Promise(resolve=>setTimeout(resolve,300))
  server.close()
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})
}
