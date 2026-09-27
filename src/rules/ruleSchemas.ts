export type RuleCondition = {
  field: string
  operator: 'equals' | 'includes' | 'in' | 'gte' | 'lte' | 'range' | 'exists'
  value?: string | number | boolean | string[] | number[]
}

export type QualityRule = {
  id: string
  description: string
  conditions: RuleCondition[]
  scoreImpact: number
  reasons: string[]
}

export type SourceRule = {
  id: string
  priority: number
  label: string
  displayLabel: string
  conditions: RuleCondition[]
  confidence: number
  reasons: string[]
}

export type EducationRule = {
  id: string
  title: string
  body: string
  conditions: RuleCondition[]
  relevanceReason: string
  suggestedUpgradePath?: string
}

export type SummaryTemplates = {
  lossy_low_bitrate: string
  lossy_high_bitrate: string
  lossless_cd: string
  lossless_hires: string
  uncompressed: string
  unknown: string
}

export type GuidanceTemplates = {
  archive: string
  everyday: string
  hires: string
}

export type QualityRulesConfig = {
  version: string
  rules: QualityRule[]
}

export type SourceRulesConfig = {
  version: string
  rules: SourceRule[]
}

export type EducationRulesConfig = {
  version: string
  topics: EducationRule[]
  summaryTemplates?: SummaryTemplates
  guidanceTemplates?: GuidanceTemplates
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isCondition = (value: unknown): value is RuleCondition => {
  if (!isRecord(value)) {
    return false
  }

  const validOperators = ['equals', 'includes', 'in', 'gte', 'lte', 'range', 'exists']

  return (
    typeof value.field === 'string' &&
    typeof value.operator === 'string' &&
    validOperators.includes(value.operator)
  )
}

const hasBaseRuleFields = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  Array.isArray(value.conditions) &&
  value.conditions.every(isCondition) &&
  isStringArray(value.reasons)

export const isQualityRulesConfig = (
  value: unknown,
): value is QualityRulesConfig =>
  isRecord(value) &&
  typeof value.version === 'string' &&
  Array.isArray(value.rules) &&
  value.rules.every(
    (rule) =>
      hasBaseRuleFields(rule) &&
      typeof rule.description === 'string' &&
      typeof rule.scoreImpact === 'number',
  )

export const isSourceRulesConfig = (value: unknown): value is SourceRulesConfig =>
  isRecord(value) &&
  typeof value.version === 'string' &&
  Array.isArray(value.rules) &&
  value.rules.every(
    (rule) =>
      hasBaseRuleFields(rule) &&
      typeof rule.priority === 'number' &&
      typeof rule.label === 'string' &&
      typeof rule.displayLabel === 'string' &&
      typeof rule.confidence === 'number',
  )

export const isEducationRulesConfig = (
  value: unknown,
): value is EducationRulesConfig =>
  isRecord(value) &&
  typeof value.version === 'string' &&
  Array.isArray(value.topics) &&
  value.topics.every(
    (topic) =>
      isRecord(topic) &&
      typeof topic.id === 'string' &&
      typeof topic.title === 'string' &&
      typeof topic.body === 'string' &&
      Array.isArray(topic.conditions) &&
      topic.conditions.every(isCondition) &&
      typeof topic.relevanceReason === 'string' &&
      (topic.suggestedUpgradePath === undefined ||
        typeof topic.suggestedUpgradePath === 'string'),
  )
