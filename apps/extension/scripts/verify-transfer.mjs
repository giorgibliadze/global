import { buildReactFixture } from '../../../packages/parsers/tests/build-react-fixture.mjs'
// Runs the built, unpacked MV3 extension with REAL Chrome messaging/storage APIs.
// All auction, destination and image requests are intercepted with sanitized fixtures.
// The MyAuto form/server is simulated; this is not an authenticated live-site test.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../../',import.meta.url))
const sourceA=await readFile(join(root,'packages/parsers/tests/fixtures/manheim24.html'),'utf8')
const sourceB=sourceA.replaceAll('1HGCM82633A004352','2HGCM82633A004352').replaceAll('1HGCM82633 A004352','2HGCM82633 A004352').replaceAll('M5 Touring Wagon','M3 Touring').replaceAll('&quot;M5&quot;','&quot;M3&quot;').replaceAll('"M5"','"M3"').replaceAll('/fixture/','/fixture-b/')
const form=await readFile(join(root,'packages/parsers/tests/fixtures/myauto.html'),'utf8')
const png='iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAA+UlEQVR4nO3RQQ0AIAzAwJlBGfIxgYw9ekkFNLk592mxWT+IBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtPnAWxWXIaEEjAAAAAElFTkSuQmCC'
const lazyPhotosTest=process.env.AUTO_LAZY_PHOTOS_TEST==='1'
const prefetchTest=process.env.AUTO_PREFETCH_TEST==='1'
const reactTest=process.env.AUTO_REACT_TEST==='1'
const rhfTest=reactTest && !!process.env.AUTO_RHF_MODULE
const mechanismOnly=process.env.AUTO_MECHANISM_ONLY==='1'
const batchTest=reactTest && process.env.AUTO_BATCHED_TEST==='1'
const reactFixture=reactTest?await buildReactFixture():''
const retryTest=process.env.AUTO_RETRY_TEST==='1'
let photoRequests=0
let source=sourceA,model='M5 Touring Wagon'
const timingScript=`<script>addEventListener('input',event=>{const input=event.target;if(!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.type==='hidden' || input.type==='search' || !input.value || !(input.name?.startsWith('primaryFeatures.') || input.dataset.testid==='description-textarea'))return;window.fixtureFirstFieldAt ??=Date.now();if(input.name==='primaryFeatures.mileage')window.fixtureMileageAt ??=Date.now()},true)</script>`
function destination() {
  // Only this local fixture has these synthetic options/IDs and upload acknowledgments.
  if(reactTest)return '<!doctype html><meta charset="utf-8"><body>'+timingScript+'<script>window.fixtureConfiguration='+JSON.stringify({model,batchedValidation:batchTest,resetAfterUpload:true,pointerOnly:true,failFuel:retryTest})+';</script><script>'+reactFixture.replaceAll('</script','<\\/script')+'</script>'
  return form+timingScript+`<script>
    window.fixtureFailFuel=${retryTest};window.fixtureOpenCounts={};
    const labels={manufacturer:'BMW',model:${JSON.stringify(model)},issueYear:'2026',fuelType:'დამუხტვადი ჰიბრიდი',engineVolume:'4.4',cylinders:'8',vehicleCategory:'უნივერსალი'};
    const modelTrigger=document.querySelector('[data-testid="single-select-trigger-primaryFeatures.model"]');modelTrigger.setAttribute('aria-disabled','true');
    for(const [key,label] of Object.entries(labels)) {
      const owner=document.querySelector('[data-testid="single-select-primaryFeatures.'+key+'"]');
      const trigger=owner.querySelector('[data-testid^="single-select-trigger-"]');trigger.tabIndex=0;
      const search=document.createElement('input');search.type='hidden';search.dataset.testid='single-select-search-primaryFeatures.'+key;owner.append(search);
      let list;
      const close=()=>{list?.remove();list=undefined;trigger.setAttribute('aria-expanded','false');search.type='hidden';};
      const populate=()=>{
        if(!list)return;list.replaceChildren();if(key==='fuelType' && window.fixtureFailFuel)return;
        if(search.value && !label.toLowerCase().includes(search.value.toLowerCase()))return;
        const item=document.createElement('div');item.setAttribute('role','option');item.textContent=label;list.append(item);
        item.onclick=()=>{
          owner.querySelector('[data-testid^="single-select-value-"]').textContent=label;
          owner.querySelector('[data-testid^="single-select-input-"]').value='fixture-'+key;
          close();if(key==='manufacturer')setTimeout(()=>modelTrigger.removeAttribute('aria-disabled'),40);
        };
      };
      trigger.onclick=()=>{
        if(list){close();return;}window.fixtureOpenCounts[key]=(window.fixtureOpenCounts[key] ?? 0)+1;if(trigger.getAttribute('aria-disabled')==='true')return;
        list=document.createElement('div');list.id='fixture-portal-'+key;list.setAttribute('role','listbox');document.body.append(list);
        trigger.setAttribute('aria-owns',list.id);trigger.setAttribute('aria-expanded','true');search.type='search';search.value='';setTimeout(populate,25);
      };
      search.addEventListener('input',populate);trigger.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
    }
    for(const control of document.querySelectorAll('[data-testid^="single-checkbox-primaryFeatures."]'))control.onclick=()=>{control.querySelector('input').value=control.dataset.testid.split('-').at(-1)};
    const input=document.querySelector('[data-testid="photo-video-dropzone"] input[type="file"]');
    input.addEventListener('change',()=>{
      const container=document.querySelector('[data-testid="photo-video-container"]');
      container.querySelector('.fixture-photo-count').textContent='ფოტო '+input.files.length+'/15';
      for(let i=0;i<input.files.length;i++){
        const img=document.createElement('img');img.src='https://cdn.example.test/'+input.files[i].name;container.append(img);
      }
    });
  </script>`
}
const benchmark=process.env.AUTO_BENCHMARK ?? ''
let workerSession
const profile=await mkdtemp(join(tmpdir(),'auto-importer-mv3-'))
let chromeProcess,socket
try {
  const endpoint=await new Promise((resolve,reject)=>{
    chromeProcess=spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',...(rhfTest?['--window-size=1280,900']:[]),'--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND','--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']})
    let stderr='';const timeout=setTimeout(()=>reject(new Error('Chrome startup timed out')),15000)
    chromeProcess.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1])}})
    chromeProcess.on('error',reject)
  })
  socket=new WebSocket(endpoint)
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  let nextId=0
  const pending=new Map(),sessions=new Map(),failures=[]
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))})
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data)
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task?.reject(new Error(message.error.message)):task?.resolve(message.result);return}
    if(message.method==='Runtime.exceptionThrown')failures.push('Unexpected fixture runtime exception')
    if(message.method==='Fetch.requestPaused')void (async()=>{
      const {requestId,request,resourceType}=message.params
      const url=new URL(request.url),main=resourceType==='Document'
      if(message.sessionId===workerSession && !main)photoRequests++
      if(benchmark && message.sessionId===workerSession && !main)await new Promise(resolve=>setTimeout(resolve,120))
      const lazyScript=`<script>(()=>{const node=document.querySelector('.StockWaveInfo'),gallery=document.querySelector('#fyusion-prism-viewer'),data=JSON.parse(node.textContent);const saved={images:data.images,mainImage:data.mainImage,html:gallery.innerHTML};data.images=[];delete data.mainImage;node.textContent=JSON.stringify(data);gallery.innerHTML='';window.fixtureRestorePhotos=()=>{const current=JSON.parse(node.textContent);current.images=saved.images;if(saved.mainImage)current.mainImage=saved.mainImage;node.textContent=JSON.stringify(current);gallery.innerHTML=saved.html}})()</script>`
      const html=url.hostname==='home.manheim24.com'?source+(lazyPhotosTest?lazyScript:''):url.hostname==='myauto.ge'?destination():null
      await command('Fetch.fulfillRequest',{requestId,responseCode:main&&!html?404:200,responseHeaders:[{name:'Content-Type',value:main?'text/html; charset=utf-8':'image/png'}],body:main?Buffer.from(html ?? '').toString('base64'):png},message.sessionId)
    })().catch(()=>failures.push('Fixture request interception failed'))
    if(message.method==='Target.attachedToTarget')void (async()=>{
      const {sessionId,targetInfo}=message.params
      await command('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'http://*'}]},sessionId)
      await command('Runtime.enable',{},sessionId)
      sessions.set(targetInfo.targetId,sessionId)
      // tabs.create may begin its first request before the CDP target event arrives.
      // Restart that navigation while scripts are paused and interception is installed.
      if(targetInfo.url==='https://myauto.ge/ka/add') {
        await command('Page.stopLoading',{},sessionId)
      }
      await command('Runtime.runIfWaitingForDebugger',{},sessionId)
      if(targetInfo.url==='https://myauto.ge/ka/add')await command('Page.navigate',{url:targetInfo.url},sessionId)
    })().catch(()=>failures.push('Fixture target setup failed'))
  })
  const {id:extensionId}=await command('Extensions.loadUnpacked',{path:process.env.AUTO_EXTENSION_DIST ?? join(root,'apps/extension/dist')})
  const wait=async(predicate,label)=>{for(let attempt=0;attempt<400;attempt++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Timed out: '+label)}
  let worker
  await wait(async()=>{worker=(await command('Target.getTargets')).targetInfos.find(target=>target.type==='service_worker'&&target.url.includes(extensionId));return !!worker},'extension worker')
  ;({sessionId:workerSession}=await command('Target.attachToTarget',{targetId:worker.targetId,flatten:true}))
  await command('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'http://*'}]},workerSession)
  await command('Runtime.enable',{},workerSession)
  await command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page',exclude:false},{exclude:true}]})
  const {targetId:sourceId}=await command('Target.createTarget',{url:'about:blank'})
  await wait(()=>sessions.has(sourceId),'source target instrumentation')
  const sourceSession=sessions.get(sourceId)
  const evaluate=async(sessionId,expression)=>{
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId)
    assert.ok(!result.exceptionDetails,'Fixture evaluation has no exception')
    return result.result.value
  }
  if(batchTest){
    const {targetId}=await command('Target.createTarget',{url:'about:blank'})
    await wait(()=>sessions.has(targetId),'batched React preflight target')
    const session=sessions.get(targetId)
    await command('Target.activateTarget',{targetId})
    await command('Page.navigate',{url:'https://myauto.ge/ka/add'},session)
    await wait(()=>evaluate(session,'!!window.fixtureState'),'controlled React preflight')
    await evaluate(session,`(()=>{const input=document.querySelector('[name="primaryFeatures.mileage"]');const peer=document.querySelector('[data-testid="description-textarea"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'12345');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();peer.focus();peer.blur()})()`)
    await new Promise(resolve=>setTimeout(resolve,100))
    assert.ok(await evaluate(session,`window.fixtureState.values.mileage==='' && document.querySelector('[name="primaryFeatures.mileage"]').value===''`),'Old synchronous blur/peer-blur reproduces lost state in real React fixture')
    await command('Target.closeTarget',{targetId})
    console.log('PASS real React regression: old same-task blur/peer-blur loses mileage before transfer')
  }
  if(rhfTest){
    const {targetId}=await command('Target.createTarget',{url:'about:blank'})
    await wait(()=>sessions.has(targetId),'RHF mechanism target')
    const session=sessions.get(targetId)
    await command('Target.activateTarget',{targetId});await command('Page.navigate',{url:'https://myauto.ge/ka/add'},session)
    await wait(()=>evaluate(session,`!!window.fixtureState && getComputedStyle(document.querySelector('[name="primaryFeatures.mileage"]')).visibility==='visible'`),'real RHF interactive control')
    await evaluate(session,`(()=>{const input=document.querySelector('[name="primaryFeatures.mileage"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'12345');input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'12345'}))})()`)
    await wait(()=>evaluate(session,`window.fixtureState.values.mileage==='12345'`),'RHF mileage committed through native input')
    await evaluate(session,`document.querySelector('[name="primaryFeatures.mileage"]').focus();document.getElementById('fixture-other-field').click();window.fixtureForceRender()`)
    await new Promise(resolve=>setTimeout(resolve,50))
    assert.ok(await evaluate(session,`window.fixtureState.values.mileage==='12345' && document.querySelector('[name="primaryFeatures.mileage"]').defaultValue==='12345'`),'Public RHF controlled mileage survives peer interaction and rerender')
    await evaluate(session,`document.querySelector('[data-testid="single-select-trigger-primaryFeatures.manufacturer"]').click()`)
    await wait(()=>evaluate(session,`!!document.querySelector('[data-testid="single-select-option-primaryFeatures.manufacturer-fixture-manufacturer"]')`),'actual named manufacturer option')
    await evaluate(session,`document.querySelector('[data-testid="single-select-option-primaryFeatures.manufacturer-fixture-manufacturer"]').click()`)
    await wait(()=>evaluate(session,`window.fixtureState.selected.manufacturer?.id==='fixture-manufacturer'`),'manufacturer public controller commit')
    assert.ok(await evaluate(session,`document.querySelector('[data-testid="single-select-input-primaryFeatures.manufacturer"]').value==='' && !!document.querySelector('[data-testid="single-select-clear-primaryFeatures.manufacturer"]')`),'Registration ref stays empty despite committed manufacturer; old ID predicate is invalid')
    await command('Target.closeTarget',{targetId})
    console.log('PASS actual public RHF mechanisms: mileage input commit survives rerender; named manufacturer option commits while ref.value remains empty')
  }
  const shadow=`document.getElementById('global-auto-transporter-launcher')?.shadowRoot`
  await command('Page.navigate',{url:'https://home.manheim24.com/landingPage#/results/fixture-a'},sourceSession)
  await wait(()=>evaluate(sourceSession,`!!${shadow}?.querySelector('.launcher')`),'injected launcher')
  await evaluate(sourceSession,`${shadow}.querySelector('.launcher').click()`)
  const jobs=[]
  for(const name of mechanismOnly?[]:['A','B']) {
    await command('Target.activateTarget',{targetId:sourceId})
    await wait(()=>evaluate(sourceSession,`!${shadow}.querySelector('.import-button').disabled`),'source action available '+name)
    const downloadsAtSelection=photoRequests
    if(name==='B'){
      source=sourceB;model='M3 Touring'
      await evaluate(sourceSession,`document.body.innerHTML=new DOMParser().parseFromString(${JSON.stringify(sourceB)},'text/html').body.innerHTML;history.pushState({},'','#/results/fixture-b')`)
    }
    if(prefetchTest){
      await wait(()=>evaluate(sourceSession,`${shadow}.querySelector('.dock').dataset.preparationState==='ready'`),'automatic preparation ready '+name)
      assert.equal(photoRequests,downloadsAtSelection,'Prefetch never downloads full-resolution photos')
      assert.equal((await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add').length,jobs.length,'Prefetch never opens a listing tab')
    }
    const benchmarkStarted=performance.now(),benchmarkEpoch=Date.now()
    await evaluate(sourceSession,`${shadow}.querySelector('.import-button').click();${shadow}.querySelector('.import-button').click()`)
    assert.ok(await evaluate(sourceSession,`!${shadow}.querySelector('.vehicle-review,.review-actions,[aria-modal="true"]')`),'No confirmation UI required')
    let job,inspected=false,photosRestored=false
    await wait(async()=>{
      job=await evaluate(workerSession,`(async()=>{const entries=await chrome.storage.session.get(null);const records=Object.entries(entries).filter(([key])=>key.startsWith('job:')).map(([,value])=>value);const job=records.find(record=>record.vehicle.model===${JSON.stringify(model)});return job?{id:job.id,createdAt:job.createdAt,destinationTabId:job.destinationTabId,stage:job.stage,status:job.status,uploaded:job.photos.uploaded,total:job.photos.total,timings:job.timings,fields:job.fields,errors:job.errors,preparation:job.preparation}:null})()`)
      if(lazyPhotosTest && !photosRestored && job?.stage==='uploading' && job.total===0){await evaluate(sourceSession,'window.fixtureRestorePhotos()');photosRestored=true}
      if(reactTest && !inspected && job?.status==='running' && job.fields.some(field=>field.key==='mileageKm' && field.persisted) && job.uploaded<job.total){
        const target=(await command('Target.getTargets')).targetInfos.find(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add'&&!jobs.some(previous=>previous.targetId===target.targetId))
        const session=target&&sessions.get(target.targetId)
        if(session){
          const point=await evaluate(session,`(()=>{const button=document.getElementById('fixture-other-field');button.scrollIntoView();const rect=button.getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`)
          await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},session)
          await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},session)
          inspected=true
        }
      }
      const notice=await evaluate(sourceSession,`${shadow}.querySelector('.notice')?.textContent ?? ''`)
      assert.ok(notice==='' || notice==='მონაცემების გადატანა დაიწყო','First-click start has no transfer error')
      return job?.status!=='running' && !!job?.destinationTabId
    },'destination receiver completion '+name)
    if(lazyPhotosTest && name==='A')assert.ok(photosRestored && job.total===15,'Initially empty cached gallery refreshed for the same vehicle after form autofill')
    if(prefetchTest)assert.ok(job.preparation?.cacheHit && job.preparation.extractedAt<=benchmarkEpoch,'Transfer reuses text prepared before the click')
    if(rhfTest && job.fields.filter(field=>field.status==='filled'&&field.persisted).length!==(retryTest?15:16))console.error('Field outcomes',job.fields.map(({key,status,code,reason})=>({key,status,code,reason})))
    if(rhfTest)assert.equal(job.fields.filter(field=>field.status==='filled'&&field.persisted).length,retryTest?15:16,'Supported fields persist; the deliberate fuel failure and manual fields stay isolated')
    const benchmarkTotal=performance.now()-benchmarkStarted
    if(job.uploaded!==job.total)console.error('Transfer verification errors',job.errors)
    assert.equal(job.uploaded,job.total,'Automatic photo transport and upload acknowledgment complete')
    assert.ok(job.total>0)
    const tabs=(await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add')
    assert.equal(tabs.length,jobs.length+1,'Each new vehicle opens an independent destination')
    const destinationTarget=tabs.find(target=>!jobs.some(previous=>previous.targetId===target.targetId))
    const destinationSession=sessions.get(destinationTarget.targetId)
    if(benchmark)console.log('BENCHMARK '+JSON.stringify({version:benchmark,vehicle:name,totalMs:benchmarkTotal,clickToFormReadyMs:job.createdAt-benchmarkEpoch+(job.timings?.destinationReadiness ?? 0),clickToPhotosMs:job.timings?.photoComplete===undefined?undefined:job.createdAt-benchmarkEpoch+job.timings.photoComplete,firstDomFieldMs:(await evaluate(destinationSession,'window.fixtureFirstFieldAt'))-benchmarkEpoch,firstMileageMs:(await evaluate(destinationSession,'window.fixtureMileageAt'))-benchmarkEpoch,verifiedFields:job.fields.filter(field=>field.status==='filled'&&field.persisted).length,preparation:job.preparation,stages:job.timings}))
    if(retryTest){
      const downloadsBefore=photoRequests
      const opensBefore=await evaluate(destinationSession,'({...window.fixtureOpenCounts})')
      await evaluate(destinationSession,rhfTest?'window.fixtureFailFuel=false;window.fixtureForceRender()':'window.fixtureFailFuel=false')
      const retryShadow=`document.getElementById('auto-importer-results').shadowRoot`
      await wait(()=>evaluate(destinationSession,`!!${retryShadow}.querySelector('.import-button')`),'field retry action')
      await evaluate(destinationSession,`${retryShadow}.querySelector('.import-button').click()`)
      await wait(()=>evaluate(workerSession,`(async()=>{const job=(await chrome.storage.session.get('job:${job.id}'))['job:${job.id}'];return job.status!=='running' && job.fields.some(field=>field.key==='fuel' && field.status==='filled')})()`),'fuel-only retry')
      const opensAfter=await evaluate(destinationSession,'({...window.fixtureOpenCounts})')
      assert.equal(photoRequests,downloadsBefore,'Retry never redownloads verified photos')
      for(const key of Object.keys(opensBefore))if(key!=='fuelType')assert.equal(opensAfter[key],opensBefore[key],'Successful field is not reopened')
      assert.equal((await command('Target.getTargets')).targetInfos.filter(target=>target.type==='page'&&target.url==='https://myauto.ge/ka/add').length,tabs.length,'Retry never creates another listing')
      const photoState=await evaluate(workerSession,`(async()=>{const job=(await chrome.storage.session.get('job:${job.id}'))['job:${job.id}'];return job.photos.uploaded})()`)
      assert.equal(photoState,15,'Field retry preserves all verified uploaded photos')
      console.log('PASS real MV3 retry: fuel only; no reopened successful fields, new listing, photo download or upload')
    }
    assert.ok(await evaluate(destinationSession,`(()=>{
      const vin=document.querySelector('[name="primaryFeatures.vinCode"]').value;
      const description=document.querySelector('[data-testid="description-textarea"]').value;
      return vin.length===17 && !description.includes(vin) && description==='' && document.querySelector('[data-testid="single-select-value-primaryFeatures.model"]').textContent===${JSON.stringify(model)} && document.querySelector('[data-testid="single-select-value-primaryFeatures.manufacturer"]').textContent==='BMW' && !!document.querySelector('[name="primaryFeatures.mileage"]').value && ['issueYear','fuelType','engineVolume','cylinders'].every(key=>${rhfTest?"window.fixtureState.selected[key]?.id==='fixture-'+key":"document.querySelector('[data-testid='+JSON.stringify('single-select-input-primaryFeatures.'+key)+']').value==='fixture-'+key"}) && !!document.getElementById('auto-importer-results');
    })()`),'VIN belongs only in dedicated field; exact model, mileage and summary verified')
    if(reactTest){
      assert.ok(inspected,'User can inspect a safe field while photos and form processing continue')
      await evaluate(destinationSession,`document.getElementById('fixture-other-field').click();window.fixtureForceRender()`)
      await new Promise(resolve=>setTimeout(resolve,100))
      assert.ok(await evaluate(destinationSession,`(()=>{
        const state=window.fixtureState;
        return state && state.values.vin===document.querySelector('[name="primaryFeatures.vinCode"]').value && state.values.vin.length===17 && state.values.mileage===document.querySelector('[name="primaryFeatures.mileage"]').value && !!state.values.mileage && state.values.description===document.querySelector('[data-testid="description-textarea"]').value && !state.values.description.includes(state.values.vin) && ['manufacturer','model','issueYear','fuelType','engineVolume','cylinders'].every(key=>state.selected[key]?.id==='fixture-'+key) && state.selected.model.label===${JSON.stringify(model)} && ${rhfTest?"state.values.negotiable==='true' && document.querySelector('[name=\"sale.isNegotiablePrice\"]').checked &&":''} state.photos===15 && state.uploads===1 && state.published===0;
      })()`),'Actual React form state survives blur, rerender, another field and photo side effects without submission')
      console.log('PASS real React state: native input/change + blur commit, pointer options, dependent models, post-photo recovery, no publication')
    }
    jobs.push({...job,targetId:destinationTarget.targetId})
    console.log(`PASS real MV3 vehicle ${name}: first click → parser → real storage → tab → claim → fields → photos → verification`)
  }
  if(!mechanismOnly)assert.notEqual(jobs[0].id,jobs[1].id,'Transfer identities remain isolated')
  assert.equal(failures.length,0,failures.join('; '))
  console.log('Real Chrome extension APIs passed. Websites, dropdown options and upload-server completion were simulated; authenticated live end-to-end success is not claimed.')
} finally {
  socket?.close();chromeProcess?.kill()
  await new Promise(resolve=>setTimeout(resolve,300))
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})
}
