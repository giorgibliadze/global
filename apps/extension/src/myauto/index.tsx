import {pipelineLog} from '../services/diagnostics'
import {installMyautoReceiver} from './activation'

function failureNotice(photoFailure=false){
  if(document.getElementById('auto-importer-error'))return
  const host=document.createElement('div');host.id='auto-importer-error'
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),message=document.createElement('div')
  style.textContent=':host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none}div{max-width:min(320px,calc(100vw - 32px));padding:10px 14px;border:1px solid #E2E8F0;border-radius:10px;background:#fff;color:#0F172A;box-shadow:0 4px 18px #0f172a20;font:12px/1.6 sans-serif}'
  message.lang='ka';message.setAttribute('role','alert');message.textContent=photoFailure?'ფოტოების გადატანა ვერ დასრულდა':'გადატანა ვერ შესრულდა. ხელახლა სცადეთ წყაროს გვერდიდან.'
  shadow.append(style,message);document.documentElement.append(host)
  const cleanup=()=>{clearTimeout(timer);removeEventListener('pagehide',cleanup);host.remove()}
  const timer=setTimeout(cleanup,5000);addEventListener('pagehide',cleanup,{once:true})
}
try{installMyautoReceiver(document,{notice:failureNotice})}catch{pipelineLog(undefined,'claiming','failed')}
