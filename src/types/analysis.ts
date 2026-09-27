export type QualityTier =
  | 'poor'
  | 'basic'
  | 'good'
  | 'very_good'
  | 'excellent'
  | 'reference'

export type ConfidenceLabel = 'low' | 'medium' | 'high' | 'very_high'

export type SourceLabel =
  | 'youtube_web_rip'
  | 'low_bitrate_streaming'
  | 'standard_streaming'
  | 'high_quality_streaming'
  | 'high_bitrate_lossy'
  | 'itunes_aac'
  | 'cd_rip'
  | 'hi_res_download'
  | 'studio_production_export'
  | 'unknown_source'

export type SourceEstimate = {
  label: SourceLabel
  displayLabel: string
  confidence: number
  confidenceLabel: ConfidenceLabel
  reasons: string[]
  alternatives?: {
    label: SourceLabel
    displayLabel: string
    confidence: number
  }[]
}

export type AnalysisResult = {
  qualityScore: number
  qualityTier: QualityTier
  analysisConfidence: number
  analysisConfidenceLabel: ConfidenceLabel
  likelySource: SourceEstimate
  flags: {
    archiveWorthy: boolean
    collectorGrade: boolean
    audiophileGrade: boolean
    hiRes?: boolean
  }
  storageEfficiency: {
    rating: 'low' | 'medium' | 'high'
    explanation: string
  }
  compatibility: {
    rating: 'limited' | 'good' | 'excellent'
    explanation: string
  }
  reasons: string[]
  summary: string
}
