// Controlled fixture benchmarks only; no authenticated sites or private data.
import {spawn} from 'node:child_process'
import {writeFile,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const baseline=process.env.AUTO_BASELINE_DIST
if(!baseline)throw new Error('Set AUTO_BASELINE_DIST to the preserved baseline build.')
const runs=Number(process.env.AUTO_PERF_RUNS??3)
if(!Number.isInteger(runs)||runs<1||runs>10)throw new Error('Runs must be 1–10.')
const samples=[]
for(const platform of ['Manheim24','ManheimSite','ManheimSearch'])for(const version of ['before','after'])for(let run=1;run<=runs;run++){
  const env={...process.env,AUTO_BENCHMARK:version,AUTO_EXTENSION_DIST:version==='before'?baseline:join(root,'apps/extension/dist'),AUTO_SITE_TEST:platform==='ManheimSite'?'1':'0',AUTO_SEARCH_TEST:platform==='ManheimSearch'?'1':'0',AUTO_PREFETCH_TEST:'1',AUTO_REACT_TEST:'1',AUTO_LOCATION_TEST:'1',AUTO_SPEC_TEST:platform==='ManheimSearch'?'0':'1',AUTO_PASSIVE_TEST:'0',AUTO_SOURCE_GATES_TEST:'0',AUTO_LAZY_PHOTOS_TEST:'0'}
  const output=await new Promise((resolve,reject)=>{let text='';const child=spawn(process.execPath,['apps/extension/scripts/verify-transfer.mjs'],{cwd:root,env});child.stdout.on('data',chunk=>{text+=chunk});child.stderr.on('data',chunk=>{text+=chunk});child.on('error',reject);child.on('close',code=>code===0?resolve(text):reject(new Error('Fixture benchmark failed for '+platform+' '+version+'; '+text.slice(-1500))))})
  const records=String(output).split('\n').filter(line=>line.startsWith('BENCHMARK ')).map(line=>JSON.parse(line.slice(10)))
  if(records.length!==2)throw new Error('Expected two isolated vehicle samples.')
  for(const value of records){delete value.preparation?.id;delete value.preparation?.extractedAt;samples.push({run,...value})}
  console.log(platform+' '+version+' run '+run+': '+records.map(record=>record.totalMs.toFixed(1)+'ms').join(', '))
}
await mkdir(join(root,'docs'),{recursive:true})
const output=process.env.AUTO_PERF_REPORT??join(root,'docs/performance-transfer-results.json')
await writeFile(output,JSON.stringify({method:'Sequential isolated Chrome profiles, three implementations, two vehicles per run, intercepted sanitized source/MyAuto fixtures; real MV3 APIs; controlled 120ms per worker image response, 128px PNGs, simulated React/RHF options and upload acknowledgments. Not live CDN throughput or authenticated E2E. Before/after stage timers overlap and must not be summed. Total measured with performance.now from launcher click to persisted completion; polling resolution ~100ms. Both builds use the same updated test harness.',runs,samples},null,2)+'\n')
console.log('Wrote '+output)
