import {spawn} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import os from 'node:os'
const root=fileURLToPath(new URL('../../../',import.meta.url)),label=process.env.AUTO_EDGE_BENCHMARK_LABEL??'baseline'
if(!['before','after','baseline'].includes(label))throw Error('Invalid benchmark label')
const out=join(root,'docs/edge-benchmark',label)
await mkdir(out,{recursive:true})
const scenarios=[1,5,10,20,30].map(tabs=>({name:'tabs-'+tabs,tabs})).concat([5,10].map(photos=>({name:'photos-'+photos,tabs:1,photos})))
const report={phase:label,kind:'automated isolated Chrome fixtures, not authenticated live sites',startedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,ramGB:Math.round(os.totalmem()/1024**3)},cdnDelayMs:120,trialsPerVehiclePerScenario:5,scenarios:[]}
const median=values=>{const v=[...values].sort((a,b)=>a-b);return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2}
const stats=values=>({n:values.length,medianMs:Math.round(median(values)*100)/100,maxMs:Math.round(Math.max(...values)*100)/100,p95:null,p95Reason:'N=5 per comparable scenario; median and maximum reported instead'})
for(const scenario of scenarios){
  console.log('START '+scenario.name+' — five gasoline and five EV transfers in one Chrome session')
  const env={...process.env,AUTO_EDGE_TEST:'1',AUTO_EDGE_RUNTIME:'1',AUTO_EDGE_SPEED:'1',AUTO_EDGE_TRIALS:'5',AUTO_STRESS_TABS:String(scenario.tabs),AUTO_PREFETCH_TEST:'1',AUTO_REACT_TEST:'1',AUTO_BENCHMARK:label==='after'?'declared-count-guard':'baseline-before-guard'}
  delete env.AUTO_RHF_MODULE;delete env.AUTO_LOCATION_TEST;delete env.AUTO_EDGE_RUNTIME_DUPLICATES
  if(scenario.photos)env.AUTO_EDGE_PHOTO_COUNT=String(scenario.photos);else delete env.AUTO_EDGE_PHOTO_COUNT
  let log=''
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['apps/extension/scripts/verify-transfer.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']})
    child.stdout.on('data',chunk=>{log+=chunk});child.stderr.on('data',chunk=>{log+=chunk})
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(scenario.name+' failed; inspect '+scenario.name+'.log')))

  }).catch(async error=>{await writeFile(join(out,scenario.name+'.log'),log);throw error})
  await writeFile(join(out,scenario.name+'.log'),log)
  const records=prefix=>log.split('\n').filter(line=>line.startsWith(prefix)).map(line=>JSON.parse(line.slice(prefix.length)))
  const transfers=records('BENCHMARK '),quality=records('EDGE_QUALITY '),memory=records('EDGE_MEMORY ')
  if(transfers.length!==10||quality.length!==10||memory.length!==6||memory.some(row=>row.actualTabs!==scenario.tabs))throw new Error('Incomplete scenario '+scenario.name)
  const summary={}
  for(const vehicle of ['A','B']){
    const rows=transfers.filter(row=>row.vehicle===vehicle)
    const stage=name=>stats(rows.map(row=>row.stages[name]??0))
    summary[vehicle]={photoCount:rows[0].accepted,domDiscovery:stats(rows.map(row=>row.sourceCounts.domDiscoveryMs)),networkFetchWall:stats(rows.map(row=>row.fetchWallMs)),downloadAndFileTransport:stage('photoDownload'),filePreparationWork:stage('filePreparation'),uploadVerification:stage('photoUpload'),clickToPhotos:stats(rows.map(row=>row.clickToPhotosMs)),clickToCompletedDraft:stats(rows.map(row=>row.totalMs)),peakDownloads:Math.max(...rows.map(row=>row.peakPhotoRequests)),allCountsConfirmed:rows.every(row=>row.photosDownloaded===row.accepted&&row.prepared===row.accepted&&row.submitted===row.accepted&&row.failed===0)}
  }
  if(!summary.A.allCountsConfirmed||!summary.B.allCountsConfirmed)throw new Error('Incomplete photo counts in '+scenario.name)
  report.scenarios.push({...scenario,transfers,quality,memory,summary})
  await writeFile(join(out,'results.json'),JSON.stringify(report,null,2)+'\n')
  console.log('PASS '+scenario.name+' — A='+summary.A.photoCount+', B='+summary.B.photoCount+' photos; five trials each')
}
report.completedAt=new Date().toISOString()
await writeFile(join(out,'results.json'),JSON.stringify(report,null,2)+'\n')
console.log('DONE '+report.scenarios.length+' scenarios, 70 transfers. Results: docs/edge-benchmark/results.json')
