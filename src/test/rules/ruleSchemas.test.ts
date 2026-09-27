import { describe, expect, it } from 'vitest'

import educationRules from '../../rules/education-rules.json'
import qualityRules from '../../rules/quality-rules.json'
import {
  isEducationRulesConfig,
  isQualityRulesConfig,
  isSourceRulesConfig,
} from '../../rules/ruleSchemas'
import sourceRules from '../../rules/source-rules.json'

describe('rule config contracts', () => {
  it('validates quality-rules.json structure', () => {
    expect(isQualityRulesConfig(qualityRules)).toBe(true)
  })

  it('validates source-rules.json structure', () => {
    expect(isSourceRulesConfig(sourceRules)).toBe(true)
  })

  it('validates education-rules.json structure', () => {
    expect(isEducationRulesConfig(educationRules)).toBe(true)
  })
})
