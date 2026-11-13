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
export type FieldFailureCode='missing'|'unavailable'|'dependency'|'unresolved'|'verification'|'protected'|'privacy'|'manual'
export interface FieldResult { persisted?:boolean; key?:string;retryable?:boolean;code?:FieldFailureCode; field: string; status: 'filled' | 'unfilled'; reason: string; optionId?: string; optionLabel?: string; match?: 'exact' | 'equivalent' | 'custom' }

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
  photos: { total: number; prepared: number; uploaded: number; failed: number }
  fields: FieldResult[]
  errors: string[]
  formTotal?:number
  currentField?:string
  activity?:'discovery'|'matching'|'selection'
  timings?: TransferTimings
}
export interface PhotoMetadata { index: number; size: number; name: string; mime: string; sha256: string }

export const timingStages = ['sourceExtraction','destinationReadiness','firstField','normalization','dropdownDiscovery','matching','dropdownSelection','fieldVerification','formFilling','photoDownload','photoUpload','finalValidation','total'] as const
export type TimingStage = typeof timingStages[number]
export type TransferTimings = Partial<Record<TimingStage, number>>
