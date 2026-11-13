import { createRoot } from 'react-dom/client'
import { claimMyautoTransfer, runMyautoTransfer, retryMyautoFields } from './transfer'
import styles from '../styles/ui.css?inline'
import { Summary } from './Summary'

async function receive() {
  if (!/^\/ka\/add\/?$/.test(location.pathname) || document.getElementById('auto-importer-results')) return
  const transfer = await claimMyautoTransfer()
  if (!transfer || document.getElementById('auto-importer-results')) return
  const { view } = createView()
  const render=(record:import('@auto-importer/shared').TransferRecord)=>view.render(<Summary record={record} onRetry={current=>retryMyautoFields(document,current,render)} />)
  await runMyautoTransfer(document,transfer,render)
}
function createView() {
  const host = document.createElement('div')
  host.id = 'auto-importer-results'
  host.style.setProperty('all', 'initial', 'important')
  host.style.setProperty('position', 'fixed', 'important')
  host.style.setProperty('z-index', '2147483647', 'important')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles + `.summary{position:fixed;right:16px;top:100px;width:min(360px,calc(100vw - 32px));max-height:calc(100dvh - 112px);overflow:auto;background:white;border:1px solid #E2E8F0;border-radius:16px;padding:20px;color:#0F172A;box-shadow:0 8px 30px #0f172a33;font:13px/1.6 sans-serif}.close{float:right;border:0;background:#F8FAFC;border-radius:6px;font-size:22px;cursor:pointer}h2{margin:0}ul{padding-left:18px}li{margin-top:12px}p{margin:6px 0;color:#475569}`
  const root = document.createElement('div')
  shadow.append(style, root)
  document.documentElement.append(host)
  const view = createRoot(root)
  return { host, view }
}
let receiving = false
async function start() {
  if (receiving || !/^\/ka\/add\/?$/.test(location.pathname) || document.getElementById('auto-importer-results')) return
  receiving = true
  try { await receive() }
  catch {
    const { host, view } = createView()
    view.render(<aside className="summary" lang="ka" role="alert">
      <button className="close" type="button" aria-label="შედეგების დახურვა" onClick={() => { view.unmount(); host.remove() }}>×</button>
      <h2>Auto Importer</h2>
      <p>MyAuto-სთან დაკავშირება ვერ მოხერხდა. გადატვირთეთ გაფართოება და გვერდი; შემდეგ დაიწყეთ ახალი გადატანა.</p>
    </aside>)
  } finally { receiving = false }
}
// MyAuto can enter /ka/add through SPA navigation after the content script loaded.
let pathname = location.pathname
new MutationObserver(() => {
  if (pathname === location.pathname) return
  pathname = location.pathname
  void start()
}).observe(document.documentElement, { childList:true, subtree:true })
addEventListener('popstate', () => void start())
void start()
