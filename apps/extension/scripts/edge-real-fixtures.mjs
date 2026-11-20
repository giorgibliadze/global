// Reads only image references from user-provided documents, in memory. Never
// writes authenticated HTML, original VINs, cookies, tokens or asset URLs.
import {execFileSync} from 'node:child_process'
import {edgePhotoIdentity,edgePhotoRank} from '../../../packages/parsers/src/edge/urls.ts'
const python=`import zipfile,xml.etree.ElementTree as E,json\nfrom html.parser import HTMLParser\nclass N:\n def __init__(self,t='',a=(),p=None):self.t=t;self.a=dict(a);self.p=p;self.c=[]\n def all(self):\n  yield self\n  for n in self.c:yield from n.all()\nclass P(HTMLParser):\n def __init__(self):super().__init__();self.root=N();self.cur=self.root\n def handle_starttag(self,t,a):\n  n=N(t,a,self.cur);self.cur.c.append(n)\n  if t not in ['img','meta','input','br','hr','link','source','wbr','area','base','embed']:self.cur=n\n def handle_endtag(self,t):\n  n=self.cur\n  while n.p and n.t!=t:n=n.p\n  if n.p:self.cur=n.p\nimport sys\nwith zipfile.ZipFile(sys.argv[1]) as z:r=E.fromstring(z.read('word/document.xml'))\nns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}\ns='\\n'.join(''.join(n.text or '' for n in p.findall('.//w:t',ns)) for p in r.findall('.//w:p',ns));p=P();p.feed(s)\nv=next(n for n in p.root.all() if n.a.get('id')=='vdp');g=next(n for n in v.all() if 'gallery' in n.a.get('class','').split())\nnav=[next((i.a.get('src') for i in n.all() if i.t=='img'),None) for n in g.all() if 'fotorama__nav__frame--thumb' in n.a.get('class','').split()]\nall=[n.a['src'] for n in g.all() if n.t=='img' and n.a.get('src')]\nprint(json.dumps({'nav':nav,'all':all}))`
const transform=url=>new URL(url).pathname.split('/').at(-2)
export function readEdgeRealFixtures(){
 return ['https___www.edgepipeline.com_components_vehicle_detail_58c1f23621a285813056d6e586d5f99d.docx','https___www.edgepipeline.com_components_vehicle_detail_abeddc8e352ccbba5280bdb363558716.docx','_html lang=_en_ data-usln-heartbeat=_1795107425286___head_.docx'].map((filename,index)=>{
  const raw=JSON.parse(execFileSync('python3',['-c',python,'/Users/macbook/Downloads/'+filename],{encoding:'utf8'})),assets=new Map()
  const normalize=value=>{const u=new URL(value.startsWith('//')?'https:'+value:value);if(u.hostname!=='file3.autolookout.net'||u.search||u.username||u.password||!['http:','https:'].includes(u.protocol))throw Error('Unexpected real fixture photo format');return u.href}
  for(const value of (index===2?[...raw.all,...raw.nav]:[...raw.nav,...raw.all]).filter(Boolean)){
   const url=normalize(value),key=edgePhotoIdentity(url)
   if(!assets.has(key))assets.set(key,{variants:new Map(),best:url})
   const asset=assets.get(key);asset.variants.set(transform(url),url)
   if(edgePhotoRank(url)>edgePhotoRank(asset.best))asset.best=url
  }
  const list=[...assets.values()],ordered=[...new Set((raw.nav.length?raw.nav:raw.all).filter(Boolean).map(u=>edgePhotoIdentity(normalize(u))))].map(key=>assets.get(key).best)
  return {ordered,replace(html){if(index===2)return html.replace(/https:\/\/file3\.autolookout\.net\/sanitized-28\/([^/"<>\s]+)\/photo-(\d+)/g,(_whole,size,number)=>{const value=list[Number(number)-1]?.variants.get(size);if(!value)throw Error('Unobserved real fixture variant');return value});return html.replace(/(?:https?:)?\/\/file3\.autolookout\.net\/[^"<>\s]+\/([^/"<>\s]+)\/fixture-edge-[01]-(\d+)\.jpg/g,(_whole,size,number)=>{const value=list[Number(number)-1]?.variants.get(size);if(!value)throw Error('Real fixture variant not observed');return value})},runtime:ordered.map(url=>({full:url.replace(/^https:/,'http:')})),index}
 })
}
