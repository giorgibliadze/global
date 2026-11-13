import {readFile} from 'node:fs/promises'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
export async function buildReactFixture() {
  const rhf=process.env.AUTO_RHF_MODULE?await readFile(process.env.AUTO_RHF_MODULE,'utf8'):undefined
  const plugins=rhf?[{name:'public-rhf-test-only',resolveId(id){if(id==='virtual:myauto-rhf')return id},load(id){if(id!=='virtual:myauto-rhf')return;return `import * as React from 'react';const module={exports:{}};const require=(id)=>{if(id===14041)return React;throw Error('Unexpected public RHF dependency')};require.d=(target,definitions)=>{for(const [name,get] of Object.entries(definitions))Object.defineProperty(target,name,{get,enumerable:true})};(function(e,t,n){${rhf}})(module,module.exports,require);export const useForm=module.exports.mN,useController=module.exports.as,FormProvider=module.exports.Op,useWatch=module.exports.FH;`}}]:[]
  const result=await build({plugins,configFile:false,logLevel:'silent',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL(rhf?'./myautoContract.fixture.ts':'./reactForm.fixture.ts',import.meta.url)),name:'ControlledFormFixture',formats:['iife']}}})
  const output=(Array.isArray(result)?result[0]:result).output
  const chunk=output.find(item=>item.type==='chunk')
  if(!chunk)throw new Error('React fixture did not compile')
  return chunk.code
}
