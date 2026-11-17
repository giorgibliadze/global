import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname,basename} from 'node:path'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../src/',import.meta.url))
async function graph(file,seen=new Set()){
  if(seen.has(file))return seen
  seen.add(file)
  const source=await readFile(file,'utf8')
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))await graph(resolve(dirname(file),match[1]+'.ts'),seen)
  return seen
}
for(const entry of ['searchManheim','siteManheim']){
  const files=await graph(resolve(root,entry+'.ts'))
  assert.ok(![...files].some(file=>basename(file)==='manheim24.ts'),entry+' cannot depend on the Manheim24 parser')
}
const legacy=await graph(resolve(root,'manheim24.ts'))
assert.ok(![...legacy].some(file=>['siteManheim.ts','siteManheimLegacy.ts','searchManheim.ts'].includes(basename(file))),'Manheim24 cannot depend on Manheim Site/Search parsers')
console.log('Independent Manheim24 and Manheim parser dependency graphs verified.')
