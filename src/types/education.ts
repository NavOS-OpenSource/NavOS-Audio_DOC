export type EducationTopic = {
  id: string
  title: string
  body: string
  relevanceReason: string
}

export type GuidanceType = 'archive' | 'everyday' | 'hires'

export type EducationResult = {
  topics: EducationTopic[]
  suggestedUpgradePath?: string
  /** Concise human-readable interpretation of the analysis */
  whatThisMeans?: string
  /** Contextual guidance based on the file type */
  guidance?: {
    type: GuidanceType
    text: string
  }[]
}
