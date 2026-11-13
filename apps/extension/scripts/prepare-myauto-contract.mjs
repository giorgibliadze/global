// Extract a public vendor module for optional isolated tests only. No website
// application entrypoint, credentials or private React state is executed/read.
import ts from 'typescript'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const [input,output]=process.argv.slice(2)
if(!input||!output)throw new Error('Usage: node prepare-myauto-contract.mjs public-vendor.js /tmp/rhf-body.js')
const code=await readFile(input,'utf8'),source=ts.createSourceFile(input,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
let body
function visit(node){if(ts.isMethodDeclaration(node)&&node.name?.getText(source)==='80824')body=node.body.getText(source).slice(1,-1);if(!body)ts.forEachChild(node,visit)}
visit(source)
if(!body || !body.includes('n(14041)') || !body.includes('mN:'))throw new Error('Expected public RHF contract/version not found')
await writeFile(output,body)
console.log(JSON.stringify({module:80824,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')}))
