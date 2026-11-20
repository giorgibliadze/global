import {runEdgeTests} from './edge.browser'
const pre=document.querySelector('pre')!
const check=(value:unknown,label:string)=>{pre.textContent+=label+'\n';if(!value)throw new Error('FAILED: '+label)}
try{await runEdgeTests(check);document.body.dataset.result='PASS'}catch(error){pre.textContent+='FAILED: '+(error instanceof Error?error.message:'fixture failed');document.body.dataset.result='FAIL'}
