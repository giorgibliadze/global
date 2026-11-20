// Synthetic test images only; never used by the extension or fetched from a user session.
import {deflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
const cache=new Map()
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0)}return (value^0xffffffff)>>>0}
function chunk(type,data){const kind=Buffer.from(type),size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([size,kind,data,checksum])}
export function edgeBenchmarkAsset(url){
  const u=new URL(url),key=u.pathname
  if(cache.has(key))return cache.get(key)
  let width=1600,height=1200
  for(const part of u.pathname.split('/')){try{const match=Buffer.from(part,'base64').toString().match(/^;resolution:(\d+)x(\d+);$/);if(match){width=Number(match[1]);height=Number(match[2])}}catch{/* Not a transform. */}}
  if(width>1600||height>1200)throw Error('Unexpected synthetic dimensions')
  let random=createHash('sha256').update(key).digest().readUInt32BE(0)||1
  const rows=Buffer.alloc((width*3+1)*height)
  for(let y=0;y<height;y++){
    const tile=Buffer.alloc(256*3)
    for(let i=0;i<tile.length;i++){random^=random<<13;random^=random>>>17;random^=random<<5;tile[i]=random&255}
    const offset=y*(width*3+1);for(let x=0;x<width*3;x++)rows[offset+1+x]=tile[x%tile.length]
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2
  const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows,{level:1})),chunk('IEND',Buffer.alloc(0))])
  const asset={bytes,base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),width,height}
  cache.set(key,asset);return asset
}
