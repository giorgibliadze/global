import type {TransferLifecycle,TransferRecord} from '@auto-importer/shared'
export function transferLifecycle(record:TransferRecord):TransferLifecycle{
  if(record.status!=='running')return record.photos.uploaded>0 || record.fields.some(field=>field.status==='filled'&&field.persisted&&field.key!=='price'&&field.key!=='location')?'COMPLETED':'FAILED'
  switch(record.stage){
    case 'opening':return 'NAVIGATING'
    case 'preparing':return record.lifecycle==='NAVIGATING'?'NAVIGATING':'PREPARING'
    case 'matching':case 'filling':return 'FILLING'
    case 'uploading':return 'UPLOADING_PHOTOS'
    case 'verifying':return record.lifecycle==='UPLOADING_PHOTOS'?'UPLOADING_PHOTOS':'FILLING'
    default:return 'COMPLETED'
  }
}
