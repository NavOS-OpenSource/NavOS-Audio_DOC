import qualityRules from '../rules/quality-rules.json'
import type { QualityRulesConfig, RuleCondition } from '../rules/ruleSchemas'
import type { AnalysisResult, QualityTier } from '../types/analysis'
import type { NormalizedMetadata } from '../types/metadata'
import { clampScore, getConfidenceLabel } from '../utils/confidence'

const getValueAtPath = (input: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }

    return (value as Record<string, unknown>)[key]
  }, input)

const matchesCondition = (
  metadata: NormalizedMetadata,
  condition: RuleCondition,
): boolean => {
  const value = getValueAtPath(metadata, condition.field)

  switch (condition.operator) {
    case 'equals':
      return value === condition.value
    case 'gte':
      return typeof value === 'number' && value >= Number(condition.value)
    case 'lte':
      return typeof value === 'number' && value <= Number(condition.value)
    case 'range':
      return (
        typeof value === 'number' &&
        Array.isArray(condition.value) &&
        value >= Number(condition.value[0]) &&
        value <= Number(condition.value[1])
      )
    case 'exists':
      return value !== undefined && value !== null
    case 'includes':
      return typeof value === 'string' && typeof condition.value === 'string'
        ? value.includes(condition.value)
        : false
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value as never)
    default:
      return false
  }
}

const getTier = (score: number): QualityTier => {
  if (score >= 95) return 'reference'
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'very_good'
  if (score >= 50) return 'good'
  if (score >= 30) return 'basic'
  return 'poor'
}

const getCompletenessConfidence = (metadata: NormalizedMetadata): number => {
  let confidence = 100

  // Missing critical metadata reduces confidence
  if (!metadata.codec.raw) confidence -= 45
  if (!metadata.technical.bitRateBps) confidence -= 15
  if (!metadata.technical.sampleRateHz) confidence -= 15
  if (!metadata.technical.channels) confidence -= 5
  if (!metadata.technical.bitDepth) confidence -= 10
  if (metadata.codec.compressionType === 'unknown') confidence -= 20

  return Math.max(15, confidence)
}

/**
 * Build structured reasons with positive (✓) and concern (⚠) indicators
 * These are factual observations, not quality judgments
 */
const buildStructuredReasons = (metadata: NormalizedMetadata): string[] => {
  const reasons: string[] = []
  
  // Compression type
  if (metadata.codec.compressionType === 'lossless') {
    reasons.push('✓ Lossless compression (no audio data lost)')
  } else if (metadata.codec.compressionType === 'uncompressed') {
    reasons.push('✓ Uncompressed audio (maximum fidelity)')
  } else if (metadata.codec.compressionType === 'lossy') {
    reasons.push('⚠ Lossy compression (some audio data discarded)')
  } else {
    reasons.push('⚠ Unknown compression type')
  }
  
  // Codec
  if (metadata.codec.display) {
    const codec = metadata.codec.display.toUpperCase()
    if (['FLAC', 'ALAC', 'APE', 'WAV', 'AIFF'].includes(codec)) {
      reasons.push(`✓ ${metadata.codec.display} codec`)
    } else if (['MP3', 'AAC', 'OGG', 'OPUS', 'VORBIS'].includes(codec)) {
      reasons.push(`⚠ ${metadata.codec.display} codec`)
    } else {
      reasons.push(`• ${metadata.codec.display} codec`)
    }
  }
  
  // Bit depth (important for lossless)
  if (metadata.technical.bitDepth) {
    if (metadata.technical.bitDepth >= 24) {
      reasons.push(`✓ ${metadata.technical.bitDepth}-bit depth (high resolution)`)
    } else if (metadata.technical.bitDepth >= 16) {
      reasons.push(`✓ ${metadata.technical.bitDepth}-bit depth (CD standard)`)
    } else {
      reasons.push(`⚠ ${metadata.technical.bitDepth}-bit depth (below CD standard)`)
    }
  }
  
  // Sample rate
  if (metadata.technical.sampleRateHz) {
    const kHz = metadata.technical.sampleRateHz / 1000
    if (metadata.technical.sampleRateHz >= 96000) {
      reasons.push(`✓ ${kHz} kHz sample rate (high resolution)`)
    } else if (metadata.technical.sampleRateHz >= 44100) {
      reasons.push(`✓ ${kHz} kHz sample rate (meets CD standard)`)
    } else {
      reasons.push(`⚠ ${kHz} kHz sample rate (below CD standard)`)
    }
  }
  
  // Bitrate (important for lossy)
  if (metadata.technical.bitRateBps && metadata.codec.compressionType === 'lossy') {
    const kbps = Math.round(metadata.technical.bitRateBps / 1000)
    if (kbps >= 256) {
      reasons.push(`✓ ${kbps} kbps bitrate (high for lossy)`)
    } else if (kbps >= 192) {
      reasons.push(`• ${kbps} kbps bitrate (decent for lossy)`)
    } else if (kbps >= 128) {
      reasons.push(`⚠ ${kbps} kbps bitrate (moderate compression)`)
    } else {
      reasons.push(`⚠ ${kbps} kbps bitrate (high compression)`)
    }
  }
  
  // Channels
  if (metadata.technical.channels) {
    if (metadata.technical.channels >= 2) {
      reasons.push(`✓ ${metadata.technical.channelLayoutDisplay || 'Stereo'}`)
    } else {
      reasons.push(`• Mono`)
    }
  }
  
  // Album art
  if (metadata.tags.hasAlbumArt) {
    reasons.push('✓ Album art present')
  }
  
  return reasons
}

export const scoreAudioQuality = (
  metadata: NormalizedMetadata,
): Pick<
  AnalysisResult,
  | 'qualityScore'
  | 'qualityTier'
  | 'analysisConfidence'
  | 'analysisConfidenceLabel'
  | 'flags'
  | 'storageEfficiency'
  | 'compatibility'
  | 'reasons'
> => {
  const config = qualityRules as QualityRulesConfig
  const ruleReasons: string[] = []
  
  // Calculate rule-based score impact
  const ruleScore = config.rules.reduce((total, rule) => {
    const matches = rule.conditions.every((condition) =>
      matchesCondition(metadata, condition),
    )

    if (matches) {
      ruleReasons.push(...rule.reasons)
      return total + rule.scoreImpact
    }

    return total
  }, 0)

  // Base score from compression type
  const compressionBase =
    metadata.codec.compressionType === 'lossless'
      ? 60
      : metadata.codec.compressionType === 'uncompressed'
        ? 62
        : metadata.codec.compressionType === 'lossy'
          ? 35
          : 15

  // Sample rate bonus
  const sampleRateBonus =
    metadata.technical.sampleRateHz && metadata.technical.sampleRateHz >= 96000
      ? 10
      : metadata.technical.sampleRateHz && metadata.technical.sampleRateHz >= 44100
        ? 5
        : 0

  // Bit depth bonus
  const bitDepthBonus =
    metadata.technical.bitDepth && metadata.technical.bitDepth >= 24
      ? 10
      : metadata.technical.bitDepth && metadata.technical.bitDepth >= 16
        ? 5
        : 0

  const channelBonus = metadata.technical.channels ? 2 : 0
  
  const qualityScore = clampScore(
    compressionBase + ruleScore + sampleRateBonus + bitDepthBonus + channelBonus,
  )
  
  const qualityTier = getTier(qualityScore)
  const analysisConfidence = getCompletenessConfidence(metadata)
  
  // Build structured reasons with ✓/⚠ indicators
  const structuredReasons = buildStructuredReasons(metadata)
  
  // Combine structured reasons with rule-based reasons (deduplicated)
  const allReasons = [
    ...structuredReasons,
    ...ruleReasons.filter(r => !structuredReasons.some(sr => sr.includes(r)))
  ]
  
  const isLosslessLike =
    metadata.codec.compressionType === 'lossless' ||
    metadata.codec.compressionType === 'uncompressed'
  const isCdOrBetter =
    Boolean(metadata.technical.sampleRateHz && metadata.technical.sampleRateHz >= 44100)
  const isHiRes =
    isLosslessLike &&
    Boolean(metadata.technical.bitDepth && metadata.technical.bitDepth >= 24) &&
    Boolean(metadata.technical.sampleRateHz && metadata.technical.sampleRateHz >= 96000)

  return {
    qualityScore,
    qualityTier,
    analysisConfidence,
    analysisConfidenceLabel: getConfidenceLabel(analysisConfidence),
    flags: {
      archiveWorthy: isLosslessLike && isCdOrBetter,
      collectorGrade: isLosslessLike && isCdOrBetter && metadata.tags.hasAlbumArt === true,
      audiophileGrade: isLosslessLike && isCdOrBetter,
      hiRes: isHiRes,
    },
    storageEfficiency: {
      rating: metadata.codec.compressionType === 'lossy' ? 'high' : 'medium',
      explanation:
        metadata.codec.compressionType === 'lossy'
          ? 'Lossy compression keeps file size low.'
          : 'Lossless or uncompressed audio usually needs more storage.',
    },
    compatibility: {
      rating: metadata.codec.raw === 'mp3' || metadata.codec.raw === 'aac' ? 'excellent' : 'good',
      explanation:
        metadata.codec.raw === 'mp3' || metadata.codec.raw === 'aac'
          ? 'This format plays on most devices.'
          : 'This format is well supported by many audio apps.',
    },
    reasons: allReasons,
  }
}
