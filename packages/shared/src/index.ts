export interface OriginalVehicleIdentity {
  manufacturer: string
  model: string
  trim?: string
  catalogModel: string
  evidence: 'structured-model' | 'structured-standard-description'
}
export interface NormalizedVehicle {
  source: 'Manheim24'
  original: OriginalVehicleIdentity
  listingId?: string
  title: string
  vin: string
  make?: string
  model?: string
  year?: number
  trim?: string
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
export interface FieldResult { field: string; status: 'filled' | 'unfilled'; reason: string; optionId?: string; optionLabel?: string; match?: 'exact' | 'equivalent' | 'custom' }

export const transferStageLabels = {
  reading: 'ავტომობილის მონაცემების წაკითხვა',
  preparing: 'ფოტოების მომზადება',
  opening: 'MyAuto-ს გახსნა',
  filling: 'მონაცემების შევსება',
  uploading: 'ფოტოების ატვირთვა',
  verifying: 'შედეგის შემოწმება',
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
}
export interface PhotoMetadata { index: number; size: number; name: string; mime: string; sha256: string }
