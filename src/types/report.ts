import type { AnalysisResult } from './analysis'
import type { EducationResult } from './education'
import type { NormalizedMetadata } from './metadata'

export type HiFiNaviReport = {
  inspector: NormalizedMetadata
  analysis: AnalysisResult
  education: EducationResult
}
