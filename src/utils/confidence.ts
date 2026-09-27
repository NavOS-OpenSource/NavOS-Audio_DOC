import type { ConfidenceLabel } from '../types/analysis'

export const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)))

export const getConfidenceLabel = (confidence: number): ConfidenceLabel => {
  if (confidence >= 90) {
    return 'very_high'
  }

  if (confidence >= 70) {
    return 'high'
  }

  if (confidence >= 40) {
    return 'medium'
  }

  return 'low'
}
