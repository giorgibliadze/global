// Four 15-MB responses bound active download memory at 60 MB before transport.
export const PHOTO_DOWNLOAD_CONCURRENCY=4
export interface VehicleLocationEvidence {
  physicalCountry?:string;physicalCity?:string;physicalVerified?:boolean
  auctionCountry?:string;atAuction?:boolean
  shipping?:{status:'in-transit';destination:string;verified:boolean}
}
export interface ListingLocation {label?:string;source:'override'|'default'|'physical'|'shipping'|'auction'|'unresolved';original?:string}
export interface OriginalVehicleIdentity {
  manufacturer: string
  model: string
  fullModelName?: string
  baseModel?: string
  trim?: string | null
  catalogModel?: string
  evidence: 'structured-model' | 'structured-standard-description' | 'selected-title'
}
export interface VehicleMileage {value:number;unit:'mi'|'km'}
export interface NormalizedVehicle {
  source: 'Manheim24' | 'Manheim24Search' | 'ManheimSearch' | 'ManheimSite'
  location?:VehicleLocationEvidence
  original: OriginalVehicleIdentity
  listingId?: string
  title: string
  vin: string
  make?: string
  model?: string
  fullModelName?: string
  baseModel?: string
  bodyStyle?: string
  year?: number
  trim?: string | null
  mileage?:VehicleMileage
  mileageKm?: number
  engineCc?: number
  cylinders?: number
  fuel?: string
  steeringWheel?: string
  doorCount?: number
  transmission?: string
  drivetrain?: string
  exteriorColor?: string
  interiorColor?: string
  interiorMaterial?: string
  body?: string
  condition?: string
  conditionGrade?: number
  price?: { amount: number; currency: string; kind: 'buyNow' }
  description?: string
  equipment?: string[]
  optionalEquipmentSummary?: string
  announcements?: string[]
  damage?: { frameDamageReported?: boolean; salvageReported?: boolean }
  auction?: { name?: string; startsAt?: string; endsAt?: string; status?: string }
  availableImageCount?: number
  images: string[]
  raw: Record<string, string | number | boolean | string[]>
  warnings: string[]
}
export type FieldFailureCode='missing'|'unavailable'|'dependency'|'unresolved'|'verification'|'protected'|'privacy'|'manual'|'unverified'
export interface FieldResult { sourceValue?:string; evidence?:'react-value'|'myauto-option'|'myauto-choice'|'negotiable'; resetAfter?:string; omissions?:string[];reviewRequired?:boolean; persisted?:boolean; key?:string;retryable?:boolean;code?:FieldFailureCode; field: string; status: 'filled' | 'unfilled' | 'unverified'; reason: string; optionId?: string; optionLabel?: string; match?: 'exact' | 'equivalent' | 'custom' }

export const transferStageLabels = {
  reading: 'მონაცემების დამუშავება',
  preparing: 'MyAuto-ს ველების შემოწმება',
  opening: 'MyAuto-ს გახსნა',
  matching: 'მონაცემების შესაბამისობის დადგენა',
  filling: 'ფორმის შევსება',
  uploading: 'ფოტოების ატვირთვა',
  verifying: 'შედეგის გადამოწმება',
  review: 'მზადაა გადასამოწმებლად',
} as const
export type TransferStage = keyof typeof transferStageLabels
export interface PreparedFormField {
  field:string;label:string;value?:string;mandatory?:boolean;sourceValue?:string;selector?:string;dropdownKey?:string
  mode:'text'|'choice'|'dropdown'|'manual'|'toggle';verifySelector?:string;reason?:string
  optionValue?:{exactText?:boolean;candidates:string[];equivalents?:string[];engineCc?:number;engineUnit?:'liters'}
}
export type PreparationStatus='preparing'|'ready'|'updating'|'error'
export interface PreparationSummary {id:string;extractedAt:number;durationMs:number;normalizationMs:number;cacheHit:boolean}
export type TransferLifecycle='IDLE'|'PREPARING'|'NAVIGATING'|'FILLING'|'UPLOADING_PHOTOS'|'COMPLETED'|'FAILED'
export interface TransferRecord {
  activation?:{schema:1;state:'IDLE'|'PREPARING'|'READY'|'TRANSFERRING'|'COMPLETED'|'FAILED'}
  lifecycle?:TransferLifecycle
  id: string
  sourceTabId: number
  destinationTabId?: number
  documentId?: string
  createdAt: number
  updatedAt: number
  vehicle: NormalizedVehicle
  listingLocation?:ListingLocation
  stage: TransferStage
  status: 'running' | 'review' | 'error'
  claimed: boolean
  textComplete?:boolean
  photoReceipt?:{confirmed:{index:number;slot?:string}[];retryable:number[];uncertain:number[]}
  photos: { total: number; prepared: number; uploaded: number; failed: number; submitted?:number; staged?:boolean; issue?:boolean; failures?:{index:number;retryable:boolean}[] }
  fields: FieldResult[]
  errors: string[]
  preparedFields?:PreparedFormField[]
  preparation?:PreparationSummary
  formTotal?:number
  currentField?:string
  activity?:'discovery'|'matching'|'selection'
  timings?: TransferTimings
}
export interface PhotoMetadata { index: number; size: number; name: string; mime: string; sha256: string }

export const timingStages = ['uploaderReadiness','fileSubmission','uploadQueueWait','uploadAcceptanceWait','sourceDetection','vehicleReadiness','vehicleExtraction','galleryDiscovery','payloadPreparation','messaging','manufacturerDropdown','modelDropdown','yearDropdown','otherDropdowns','filePreparation','galleryVerification','prefetch','prefetchNormalization','sourceExtraction','destinationReadiness','firstField','firstFieldAfterReady','photoComplete','normalization','dropdownDiscovery','matching','dropdownSelection','fieldVerification','formFilling','textPopulation','dropdownBatch','photoDownload','photoUpload','finalValidation','total'] as const
export type TimingStage = typeof timingStages[number]
export type TransferTimings = Partial<Record<TimingStage, number>>

export function searchManheimRouteVin(url:string):string|undefined{
  try{
    const u=new URL(url)
    if(u.protocol!=='https:'||u.hostname!=='search.manheim.com')return
    return u.hash.match(/^#\/details\/([A-HJ-NPR-Z0-9]{17})\/[A-Z0-9_-]+\/?(?:\?.*)?$/i)?.[1].toUpperCase()
  }catch{return}
}

export function manheim24SearchRouteVin(url:string):string|undefined{try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='search.manheim24.com')return;return u.hash.match(/^#\/details\/([A-HJ-NPR-Z0-9]{17})\/[A-Z0-9_-]+\/?(?:\?.*)?$/i)?.[1].toUpperCase()}catch{return}}
