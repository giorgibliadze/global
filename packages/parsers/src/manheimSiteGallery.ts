import {createFyusionGalleryExtractor} from './fyusion'
const extractFyusionGallery=createFyusionGalleryExtractor()
// Only retain a gallery node first observed INSIDE a verified vehicle root.
// If fullscreen/portal code moves that same node, no global image scan is needed.
const bindings=new WeakMap<Document,{key:string;node:Element}>()
export function extractSiteManheimGallery(root:Element,key:string){
  const nodes=[...root.querySelectorAll('#fyusion-prism-viewer,.svfy_viewer')].filter(node=>!node.closest('#fyusion-prism-viewer-skeleton,.svfy_viewer--skeleton'))
  const outer=nodes.filter(node=>!nodes.some(other=>other!==node&&other.contains(node)))
  if(outer.length===1)bindings.set(root.ownerDocument,{key,node:outer[0]})
  const binding=bindings.get(root.ownerDocument)
  const scope=outer.length===0&&binding?.key===key&&binding.node.isConnected?binding.node:root
  return extractFyusionGallery(scope,key,{includeHidden:true})
}
