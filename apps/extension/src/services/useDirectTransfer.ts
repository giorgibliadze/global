import {pipelineLog} from './diagnostics'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {TransferLifecycle,TransferRecord} from '@auto-importer/shared'
import {request} from './extensionApi'
import {transferLifecycle} from './transferLifecycle'

export function useDirectTransfer(supported:boolean){
  const [lifecycle,setLifecycle]=useState<TransferLifecycle>('IDLE'),[error,setError]=useState(''),[id,setId]=useState<string>()
  const generation=useRef(0),locked=useRef(false),mounted=useRef(true)
  const accept=useCallback((record:TransferRecord)=>{if(!mounted.current)return;setId(record.id);setLifecycle(record.lifecycle??transferLifecycle(record));locked.current=record.status==='running';if(transferLifecycle(record)==='FAILED')setError('გადატანა ვერ შესრულდა. ხელახლა სცადეთ.')},[])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{
    if(!supported)return
    let cancelled=false
    const version=generation.current
    void request<TransferRecord|null>({type:'TRANSFER_ACTIVE'}).then(record=>{if(!cancelled && record && version===generation.current)accept(record)},()=>{pipelineLog(undefined,'claiming','failed')})
    return()=>{cancelled=true}
  },[supported,accept])
  useEffect(()=>{
    if(!id || ['COMPLETED','FAILED','IDLE'].includes(lifecycle))return
    let cancelled=false,timer:ReturnType<typeof setTimeout>
    const poll=async()=>{
      try{const record=await request<TransferRecord>({type:'TRANSFER_STATUS',id});if(cancelled)return;accept(record);if(record.status==='running')timer=setTimeout(()=>void poll(),700)}
      catch{if(!cancelled){locked.current=false;setLifecycle('FAILED');setError('გადატანის სტატუსი ვერ წაიკითხა. გადაამოწმეთ MyAuto-ს ჩანართი.')}}
    }
    timer=setTimeout(()=>void poll(),400)
    return()=>{cancelled=true;clearTimeout(timer)}
  },[id,lifecycle,accept])
  useEffect(()=>{if(!error)return;const timer=setTimeout(()=>setError(''),5000);return()=>clearTimeout(timer)},[error])
  const start=useCallback(async(listingLocation?:string)=>{
    if(locked.current)return
    if(!supported){setError('ამ პლატფორმაზე გადატანა ჯერ მიუწვდომელია.');return}
    generation.current++;locked.current=true;setError('');setId(undefined);setLifecycle('PREPARING')
    try{accept(await request<TransferRecord>({type:'TRANSFER_BEGIN',...(listingLocation?{listingLocation}:{})}))}
    catch{locked.current=false;if(mounted.current){setLifecycle('FAILED');setError('გადატანა ვერ დაიწყო. გადაამოწმეთ ავტომობილის დეტალური გვერდი.')}}
  },[supported,accept])
  return {lifecycle,error,start,busy:!['IDLE','COMPLETED','FAILED'].includes(lifecycle)}
}
