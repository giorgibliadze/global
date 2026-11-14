import {claimMyautoTransfer,runMyautoTransfer} from './transfer'
import {transferLifecycle} from '../services/transferLifecycle'
import {pipelineLog} from '../services/diagnostics'

function failureNotice(){
  if(document.getElementById('auto-importer-error'))return
  const host=document.createElement('div');host.id='auto-importer-error'
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),message=document.createElement('div')
  style.textContent=':host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none}div{max-width:min(320px,calc(100vw - 32px));padding:10px 14px;border:1px solid #E2E8F0;border-radius:10px;background:#fff;color:#0F172A;box-shadow:0 4px 18px #0f172a20;font:12px/1.6 sans-serif}'
  message.lang='ka';message.setAttribute('role','alert');message.textContent='გადატანა ვერ შესრულდა. ხელახლა სცადეთ წყაროს გვერდიდან.'
  shadow.append(style,message);document.documentElement.append(host);setTimeout(()=>host.remove(),5000)
}
let receiving=false
async function start(){
  if(receiving||!/^\/ka\/add\/?$/.test(location.pathname))return
  receiving=true
  try{
    const transfer=await claimMyautoTransfer()
    if(!transfer)return
    const result=await runMyautoTransfer(document,transfer,()=>{})
    if(transferLifecycle(result)==='FAILED')failureNotice()
  }catch{pipelineLog(undefined,'claiming','failed');failureNotice()}
  finally{receiving=false}
}
let pathname=location.pathname
new MutationObserver(()=>{if(pathname===location.pathname)return;pathname=location.pathname;void start()}).observe(document.documentElement,{childList:true,subtree:true})
addEventListener('popstate',()=>void start())
void start()
