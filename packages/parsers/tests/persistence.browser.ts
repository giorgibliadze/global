import { writeControlledInput, probePersistence } from '../src/inputInteraction'
import { waitForDomReady } from '../../../apps/extension/src/services/domReady'

export async function runPersistenceTests(check:(value:unknown,label:string)=>void) {
  const frame=document.createElement('iframe');document.body.append(frame)
  const doc=frame.contentDocument!
  doc.body.innerHTML='<input name="primaryFeatures.mileage"><textarea data-testid="description-textarea"></textarea><button type="submit">გამოქვეყნება</button>'
  const input=()=>doc.querySelector<HTMLInputElement>('input')!
  let draft='',committed='',inputs=0,submitted=0
  doc.querySelector('button')!.onclick=()=>{submitted++}
  input().addEventListener('input',()=>{inputs++;draft=input().value})
  input().addEventListener('blur',()=>{committed=draft;input().value=committed})
  check(await writeControlledInput(doc,input,'196362'),'native input adapter commits blur-dependent state')
  input().value=committed
  check(committed==='196362' && inputs===1 && submitted===0,'blur state survives rerender without submit or unnecessary retry')
  input().addEventListener('blur',()=>{input().value=''})
  check(!await writeControlledInput(doc,input,'196362'),'rejected controlled value is never reported persisted')
  check(inputs===3,'rejected field has bounded retries')
  check(!await probePersistence(doc,input,()=>input().value==='196362'),'post-fill reset fails persistence verification')
  const readyController=new AbortController()
  const ready=waitForDomReady(doc,()=>!!doc.getElementById('late-control'),readyController.signal,500)
  const late=doc.createElement('input');late.id='late-control';doc.body.append(late)
  await ready
  check(true,'form readiness resolves from a DOM mutation without a startup sleep')
  const cancelled=new AbortController()
  const waiting=waitForDomReady(doc,()=>false,cancelled.signal,500).then(()=>false,()=>true)
  cancelled.abort()
  check(await waiting,'cancelled form readiness disconnects without continuing stale work')
  const stale=new AbortController()
  input().value=''
  input().addEventListener('beforeinput',()=>stale.abort(),{once:true})
  let aborted=false
  try{await writeControlledInput(doc,input,'123',stale.signal)}catch{aborted=true}
  check(aborted && input().value==='','superseded input work cannot write after beforeinput cancellation')
  frame.remove()
}
