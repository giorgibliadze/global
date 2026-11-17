import {runSearch24SnapshotTests} from './search24Snapshot.browser'
const results:string[]=[]
try{await runSearch24SnapshotTests((value,label)=>{if(!value)throw new Error(label);results.push(label)});document.body.dataset.result='PASS';document.querySelector('pre')!.textContent=results.join('\n')}
catch(error){document.body.dataset.result='FAIL';document.querySelector('pre')!.textContent=results.join('\n')+'\nFAILED: '+(error instanceof Error?error.message:String(error))}
