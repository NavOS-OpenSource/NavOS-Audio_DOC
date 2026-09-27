import sourceRules from '../rules/source-rules.json'
import type { RuleCondition, SourceRulesConfig } from '../rules/ruleSchemas'
import type { SourceEstimate, SourceLabel } from '../types/analysis'
import type { NormalizedMetadata } from '../types/metadata'
import { getConfidenceLabel } from '../utils/confidence'

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

export const estimateLikelySource = (
  metadata: NormalizedMetadata,
): SourceEstimate => {
  const config = sourceRules as SourceRulesConfig
  const matches = config.rules
    .filter((rule) =>
      rule.conditions.every((condition) => matchesCondition(metadata, condition)),
    )
    .sort((a, b) => b.priority - a.priority)

  const bestMatch = matches[0]

  if (!bestMatch) {
    return {
      label: 'unknown_source',
      displayLabel: 'Unknown Source',
      confidence: 30,
      confidenceLabel: 'low',
      reasons: ['Available metadata is not enough to estimate a likely source.'],
    }
  }

  return {
    label: bestMatch.label as SourceLabel,
    displayLabel: bestMatch.displayLabel,
    confidence: bestMatch.confidence,
    confidenceLabel: getConfidenceLabel(bestMatch.confidence),
    reasons: bestMatch.reasons,
    alternatives:
      bestMatch.confidence < 70
        ? matches.slice(1, 3).map((rule) => ({
            label: rule.label as SourceLabel,
            displayLabel: rule.displayLabel,
            confidence: rule.confidence,
          }))
        : undefined,
  }
}
