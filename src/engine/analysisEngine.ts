import { normalizeAudioMetadata } from '../normalizer/audioMetadataNormalizer'
import { parseFfprobeOutput } from '../parser/ffprobeParser'
import type { HiFiNaviReport } from '../types/report'
import { selectEducationTopics } from './educationSelector'
import { scoreAudioQuality } from './qualityScorer'
import { estimateLikelySource } from './sourceEstimator'

export const analyzeFFprobeText = (rawText: string): HiFiNaviReport => {
  const parsed = parseFfprobeOutput(rawText)
  const normalized = normalizeAudioMetadata(parsed)
  const quality = scoreAudioQuality(normalized)
  const likelySource = estimateLikelySource(normalized)
  const education = selectEducationTopics(normalized)

  return {
    inspector: normalized,
    analysis: {
      ...quality,
      likelySource,
      summary: `${normalized.codec.display ?? 'Unknown codec'} audio with ${
        normalized.technical.bitRateDisplay ?? 'unknown bitrate'
      }. Likely source: ${likelySource.displayLabel}.`,
    },
    education,
  }
}
