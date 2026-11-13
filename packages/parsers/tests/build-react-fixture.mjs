import { build } from 'vite'
import { fileURLToPath } from 'node:url'
export async function buildReactFixture() {
  const result=await build({configFile:false,logLevel:'silent',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:false,lib:{entry:fileURLToPath(new URL('./reactForm.fixture.ts',import.meta.url)),name:'ControlledFormFixture',formats:['iife']}}})
  const output=(Array.isArray(result)?result[0]:result).output
  const chunk=output.find(item=>item.type==='chunk')
  if(!chunk)throw new Error('React fixture did not compile')
  return chunk.code
}
