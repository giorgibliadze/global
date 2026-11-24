import {runManufacturerTests} from './manufacturer.browser'
const pre=document.querySelector('pre')!
const check=(value:unknown,label:string)=>{pre.textContent+=label+'\n';if(!value)throw new Error('FAILED: '+label)}
try{await runManufacturerTests(check,new URL(location.href).searchParams.get('platform')??'edge');document.body.dataset.result='PASS'}catch(error){pre.textContent+='FAILED: '+(error instanceof Error?error.message:'fixture failed');document.body.dataset.result='FAIL'}
