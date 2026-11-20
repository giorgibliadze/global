import {MAX_PHOTO_BYTES} from '../photos/download'
// Only formats the existing binary transport cannot represent are converted.
// PNG/JPEG/WebP pass through byte-for-byte. Conversion is lossless PNG, after
// browser decoding (including orientation), never a universal JPEG re-encode.
export async function edgeImageResponse(response:Response,url:string,signal?:AbortSignal){
  if(!response.ok||!(/image\/(?:avif|gif|bmp|x-ms-bmp)/i.test(response.headers.get('content-type')??'')||/\.(?:avif|gif|bmp)$/i.test(new URL(url).pathname)))return response
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty image')
  const parts:Uint8Array<ArrayBuffer>[]=[];let size=0
  try{for(;;){signal?.throwIfAborted();const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_PHOTO_BYTES)throw new Error('Image too large');parts.push(value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const bitmap=await createImageBitmap(new Blob(parts))
  try{
    signal?.throwIfAborted()
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d')
    if(!context)throw new Error('Image decoder unavailable')
    context.drawImage(bitmap,0,0)
    const blob=await canvas.convertToBlob({type:'image/png'})
    if(blob.size>MAX_PHOTO_BYTES)throw new Error('Converted image too large')
    return new Response(blob,{status:200,headers:{'Content-Type':'image/png'}})
  }finally{bitmap.close()}
}
