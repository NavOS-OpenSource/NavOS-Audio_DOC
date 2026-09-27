export type CompressionType =
  | 'lossy'
  | 'lossless'
  | 'uncompressed'
  | 'unknown'

export type ParsedMetadata = {
  // CamelCase versions (original)
  codecName?: string
  sampleRate?: number
  bitRate?: number
  channels?: number
  duration?: number
  fileSize?: number
  bitDepth?: number
  encoder?: string
  hasAlbumArt?: boolean
  
  // FFprobe-style snake_case versions (from extractor)
  codec_name?: string
  sample_rate?: number
  bit_rate?: number
  bits_per_raw_sample?: number
  bits_per_sample?: number
  format_name?: string
  has_album_art?: boolean
  filename?: string
}

export type NormalizedMetadata = {
  codec: {
    raw?: string
    display?: string
    compressionType: CompressionType
  }
  technical: {
    sampleRateHz?: number
    sampleRateDisplay?: string
    bitRateBps?: number
    bitRateDisplay?: string
    bitDepth?: number
    channels?: number
    channelLayoutDisplay?: string
  }
  file: {
    name?: string
    durationSeconds?: number
    durationDisplay?: string
    sizeBytes?: number
    sizeDisplay?: string
  }
  tags: {
    encoder?: string
    hasAlbumArt?: boolean
  }
}

export type QualityTier =
  | 'poor'
  | 'basic'
  | 'good'
  | 'very_good'
  | 'excellent'
  | 'reference'

export type SourceEstimate = {
  label: string
  displayLabel: string
  confidence: number
  reasons: string[]
}

export type EducationTopic = {
  id: string
  title: string
  body: string
  relevantWhen: string[]
}

export type AnalysisReport = {
  inspector: NormalizedMetadata
  analysis: {
    qualityScore: number
    qualityTier: QualityTier
    reasons: string[]
    likelySource: SourceEstimate
    analysisConfidence: number
    flags: {
      archiveWorthy: boolean
      audiophileGrade: boolean
    }
    summary: string
  }
  education: {
    topics: EducationTopic[]
    suggestedUpgradePath?: string
  }
}
