import {runPhotoDestinationTests} from './photoDestination.browser'
const outcomes:string[]=[]
try{await runPhotoDestinationTests((value,label)=>{if(!value)throw new Error(label);outcomes.push(label)});document.body.dataset.result='PASS';document.querySelector('pre')!.textContent=outcomes.join('\n')}
catch(error){document.body.dataset.result='FAIL';document.querySelector('pre')!.textContent='FAILED: '+(error instanceof Error?error.message:String(error))}
