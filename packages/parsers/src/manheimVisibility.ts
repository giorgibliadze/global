// Visibility contract shared only by regular Manheim layouts.
export function visible(el:Element){
  for(let n:Element|null=el;n;n=n.parentElement){
    if(n.hasAttribute('hidden')||n.getAttribute('aria-hidden')==='true')return false
    const s=n.ownerDocument.defaultView?.getComputedStyle(n)
    if(s?.display==='none'||s?.visibility==='hidden'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.getAttribute('style')??''))return false
  }
  return true
}
