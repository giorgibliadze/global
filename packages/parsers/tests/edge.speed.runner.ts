import {runEdgeTests} from './edge.browser'
import {runEdgeSpeed} from './edge.speed.browser'
const pre=document.querySelector('pre')!
const check=(value:unknown,label:string)=>{pre.textContent+=label+'\n';if(!value)throw new Error('FAILED: '+label)}
try{
  await runEdgeSpeed(check)
  for(let trial=0;trial<5;trial++)await runEdgeTests(check,record=>{check(true,'EDGE pipeline timing: '+JSON.stringify({trial:trial+1,...record}))})
  document.body.dataset.result='PASS'
}catch(error){pre.textContent+='FAILED: '+(error instanceof Error?error.message:'fixture failed');document.body.dataset.result='FAIL'}
