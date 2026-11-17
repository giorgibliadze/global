import {watchRegularManheim} from '../../../apps/extension/src/content/regularManheim'
import {siteManheimAdapter,searchManheimAdapter} from '../../../apps/extension/src/content/sourceAdapters'
import {parseSiteManheim} from '../src/siteManheim'
import {searchManheimRoute} from '../src/searchManheim'
export async function runRegularManheimTests(check:(v:unknown,label:string)=>void){
  const html=await(await fetch('/packages/parsers/tests/fixtures/search-manheim.html')).text()
  const legacy=await(await fetch('/packages/parsers/tests/fixtures/manheim24.html')).text()
  const vin='SALKZ9F90RA229948',tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0))
  check(searchManheimRoute('https://search.manheim.com/other/path#/details/'+vin+'/OVE')===vin,'regular Manheim: verified VIN hash contract is independent of outer document path')
  check(!searchManheimRoute('https://search.manheim.com/other/path')&&!searchManheimRoute('https://search.manheim.com.attacker.example/results#/details/'+vin+'/OVE'),'regular Manheim: routes without VIN or exact host remain ineligible')
  for(const adapter of [siteManheimAdapter,searchManheimAdapter]){
    const frame=document.createElement('iframe');document.body.append(frame)
    const doc=frame.contentDocument!,view=doc.defaultView!
    doc.body.innerHTML='<h1>Search results</h1>'
    let route=adapter.id==='ManheimSite'?'https://site.manheim.com/selected':'https://search.manheim.com/results#/details/'+vin+'/OVE',mounted=0,unmounted=0
    const activate=()=>{mounted++;return()=>{unmounted++}}
    const dispose=watchRegularManheim(doc,adapter,activate,()=>route)
    try{
      check(mounted===0,'regular '+adapter.id+': informational/results DOM remains passive')
      const root=doc.importNode(new DOMParser().parseFromString(html,'text/html').querySelector('[data-test-id="vehicle-details-view-container"]')!,true)
      root.removeAttribute('data-test-id');doc.body.append(root);await tick()
      check(mounted===0,'regular '+adapter.id+': incomplete root cannot mount a transfer launcher')
      root.setAttribute('data-test-id','vehicle-details-view-container');await tick()
      check(mounted===1&&adapter.parse(doc,route).images.length===15,'regular '+adapter.id+': late identity attribute activates verified vehicle and 15 photos')
      check(watchRegularManheim(doc,adapter,activate,()=>route)===dispose&&mounted===1,'regular '+adapter.id+': duplicate initialization reuses one watcher and launcher')
      view.dispatchEvent(new view.PageTransitionEvent('pagehide',{persisted:true}));await tick()
      check(unmounted===1,'regular '+adapter.id+': BFCache suspension releases active launcher/parser')
      view.dispatchEvent(new view.PageTransitionEvent('pageshow',{persisted:true}));await tick()
      check(mounted===2,'regular '+adapter.id+': BFCache restoration reactivates without page refresh')
      route=adapter.id==='ManheimSite'?'https://site.manheim.com/another':'https://search.manheim.com/results#/details/2HGCM82633A004352/OVE'
      view.dispatchEvent(new view.PopStateEvent('popstate'));await tick()
      check(unmounted===2&&mounted===2,'regular '+adapter.id+': route transition removes stale vehicle action before new DOM')
      const node=root.querySelector('.StockWaveInfo')!,data=JSON.parse(node.textContent!);data.vin='2HGCM82633A004352';data.id='OVE.REGULAR.NEXT';data.designatedDescriptionEnrichment.vin=data.vin
      for(const image of data.images)image.largeUrl=image.largeUrl.replace('fixture-search-','fixture-regular-next-')
      node.textContent=JSON.stringify(data);root.setAttribute('data-vin',data.vin);root.setAttribute('data-key',data.id);root.querySelector('[data-testid="vdp-vin"]')!.textContent=data.vin
      await tick()
      check(mounted===3&&adapter.parse(doc,route).vin===data.vin,'regular '+adapter.id+': new SPA vehicle activates its own independent identity')
      view.dispatchEvent(new view.PageTransitionEvent('pagehide',{persisted:false}));await tick();root.setAttribute('data-key','ignored');await tick()
      check(unmounted===3&&mounted===3,'regular '+adapter.id+': terminal pagehide cleans watcher and cannot remount')
    }finally{dispose();frame.remove()}
  }
  const doc=new DOMParser().parseFromString(legacy,'text/html'),stale=new DOMParser().parseFromString(html,'text/html').querySelector('[data-test-id="vehicle-details-view-container"]')!
  stale.setAttribute('hidden','');doc.body.append(doc.importNode(stale,true))
  check(parseSiteManheim(doc,'https://site.manheim.com/selected').fullModelName==='M5 Touring Wagon','regular Site: hidden stale modern layout cannot mask visible verified legacy details')
}
