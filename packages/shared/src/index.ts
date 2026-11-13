export interface OriginalVehicleIdentity {
  manufacturer: string
  model: string
  fullModelName?: string
  baseModel?: string
  trim?: string | null
  catalogModel?: string
  evidence: 'structured-model' | 'structured-standard-description' | 'selected-title'
}
export interface NormalizedVehicle {
  source: 'Manheim24'
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
export interface TransferRecord {
  id: string
  sourceTabId: number
  destinationTabId?: number
  documentId?: string
  createdAt: number
  updatedAt: number
  vehicle: NormalizedVehicle
  stage: TransferStage
  status: 'running' | 'review' | 'error'
  claimed: boolean
  textComplete?:boolean
  photos: { total: number; prepared: number; uploaded: number; failed: number; submitted?:number }
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

export const timingStages = ['prefetch','prefetchNormalization','sourceExtraction','destinationReadiness','firstField','firstFieldAfterReady','photoComplete','normalization','dropdownDiscovery','matching','dropdownSelection','fieldVerification','formFilling','textPopulation','dropdownBatch','photoDownload','photoUpload','finalValidation','total'] as const
export type TimingStage = typeof timingStages[number]
export type TransferTimings = Partial<Record<TimingStage, number>>
