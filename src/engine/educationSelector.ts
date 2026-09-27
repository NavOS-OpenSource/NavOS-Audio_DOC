import educationRules from '../rules/education-rules.json'
import type { EducationRulesConfig, RuleCondition, SummaryTemplates, GuidanceTemplates } from '../rules/ruleSchemas'
import type { EducationResult, GuidanceType } from '../types/education'
import type { NormalizedMetadata } from '../types/metadata'

const config = educationRules as EducationRulesConfig

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
    case 'lte':
      return typeof value === 'number' && value <= Number(condition.value)
    case 'gte':
      return typeof value === 'number' && value >= Number(condition.value)
    case 'exists':
      return value !== undefined && value !== null
    default:
      return false
  }
}

type SummaryKey = keyof SummaryTemplates

/**
 * Determine which summary template to use based on metadata
 */
const selectSummaryKey = (metadata: NormalizedMetadata): SummaryKey => {
  const compressionType = metadata.codec?.compressionType
  const bitRate = metadata.technical?.bitRateBps
  const sampleRate = metadata.technical?.sampleRateHz
  const bitDepth = metadata.technical?.bitDepth

  // Uncompressed (WAV, AIFF)
  if (compressionType === 'uncompressed') {
    return 'uncompressed'
  }

  // Lossless
  if (compressionType === 'lossless') {
    // Hi-Res: >44.1kHz or >16-bit
    const isHiRes = 
      (sampleRate && sampleRate > 44100) || 
      (bitDepth && bitDepth > 16)
    
    if (isHiRes) {
      return 'lossless_hires'
    }
    return 'lossless_cd'
  }

  // Lossy
  if (compressionType === 'lossy') {
    // High bitrate lossy: >= 256kbps
    if (bitRate && bitRate >= 256000) {
      return 'lossy_high_bitrate'
    }
    // Low/moderate bitrate lossy
    return 'lossy_low_bitrate'
  }

  return 'unknown'
}

/**
 * Determine which guidance types are relevant based on metadata
 */
const selectGuidanceTypes = (metadata: NormalizedMetadata): GuidanceType[] => {
  const types: GuidanceType[] = []
  const compressionType = metadata.codec?.compressionType
  const sampleRate = metadata.technical?.sampleRateHz
  const bitDepth = metadata.technical?.bitDepth

  // Everyone gets archive guidance for lossless, or if lossy they should know
  if (compressionType === 'lossless' || compressionType === 'uncompressed') {
    types.push('archive')
  }

  // Lossy files: show everyday guidance
  if (compressionType === 'lossy') {
    types.push('everyday')
    // Also mention archive since they might want to upgrade
    types.push('archive')
  }

  // Hi-res files: show hi-res guidance
  const isHiRes = 
    (sampleRate && sampleRate >= 88200) || 
    (bitDepth && bitDepth >= 24)
  
  if (isHiRes && (compressionType === 'lossless' || compressionType === 'uncompressed')) {
    types.push('hires')
  }

  // Deduplicate
  return [...new Set(types)]
}

export const selectEducationTopics = (
  metadata: NormalizedMetadata,
): EducationResult => {
  // Select matching topics (limit to avoid overwhelming the user)
  const allMatchingTopics = config.topics
    .filter((topic) =>
      topic.conditions.every((condition) => matchesCondition(metadata, condition)),
    )
    .map(({ id, title, body, relevanceReason }) => ({
      id,
      title,
      body,
      relevanceReason,
    }))

  // Deduplicate by title (some topics may have similar titles for different conditions)
  const seenTitles = new Set<string>()
  const topics = allMatchingTopics.filter((topic) => {
    if (seenTitles.has(topic.title)) {
      return false
    }
    seenTitles.add(topic.title)
    return true
  }).slice(0, 4) // Limit to 4 topics max

  // Get suggested upgrade path (for lossy files)
  const suggestedUpgradePath = config.topics.find(
    (topic) =>
      topic.suggestedUpgradePath &&
      topic.conditions.every((condition) => matchesCondition(metadata, condition)),
  )?.suggestedUpgradePath

  // Generate "What this means" summary
  const summaryKey = selectSummaryKey(metadata)
  const summaryTemplates = config.summaryTemplates as SummaryTemplates | undefined
  const whatThisMeans = summaryTemplates?.[summaryKey]

  // Generate relevant guidance
  const guidanceTypes = selectGuidanceTypes(metadata)
  const guidanceTemplates = config.guidanceTemplates as GuidanceTemplates | undefined
  const guidance = guidanceTypes
    .map((type) => ({
      type,
      text: guidanceTemplates?.[type] || '',
    }))
    .filter((g) => g.text) // Only include if we have text for it
    .slice(0, 2) // Limit to 2 guidance items

  return { 
    topics, 
    suggestedUpgradePath,
    whatThisMeans,
    guidance: guidance.length > 0 ? guidance : undefined,
  }
}
