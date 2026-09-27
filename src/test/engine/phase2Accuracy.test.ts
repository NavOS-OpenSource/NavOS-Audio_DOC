import { describe, expect, it } from 'vitest'
import { analyzeFFprobeText } from '../../engine/analysisEngine'

// Real-world FFprobe test cases for Phase 2 accuracy validation

describe('Phase 2 Accuracy: MP3 128 kbps', () => {
  const mp3_128_input = `codec_name=mp3
sample_rate=48000
bit_rate=128000
channels=2
duration=189.408`

  it('should classify MP3 128 kbps as low quality (poor or basic tier)', () => {
    const report = analyzeFFprobeText(mp3_128_input)
    
    expect(report.inspector.codec.display).toBe('MP3')
    expect(report.inspector.codec.compressionType).toBe('lossy')
    expect(report.inspector.technical.bitRateDisplay).toBe('128 kbps')
    expect(report.inspector.technical.sampleRateDisplay).toBe('48 kHz')
    
    // MP3 128 kbps should NOT score above 50 (good tier threshold)
    expect(report.analysis.qualityScore).toBeLessThanOrEqual(50)
    // Can be either 'poor' or 'basic' - both are valid low-quality classifications
    expect(['poor', 'basic']).toContain(report.analysis.qualityTier)
    
    // Source should indicate low-bitrate streaming
    expect(report.analysis.likelySource.label).toBe('low_bitrate_streaming')
    
    // Should NOT be archive worthy
    expect(report.analysis.flags.archiveWorthy).toBe(false)
    expect(report.analysis.flags.audiophileGrade).toBe(false)
  })
})

describe('Phase 2 Accuracy: MP3 320 kbps', () => {
  const mp3_320_input = `codec_name=mp3
sample_rate=44100
bit_rate=320000
channels=2
duration=245.5`

  it('should classify MP3 320 kbps as decent lossy (good tier)', () => {
    const report = analyzeFFprobeText(mp3_320_input)
    
    expect(report.inspector.codec.display).toBe('MP3')
    expect(report.inspector.technical.bitRateDisplay).toBe('320 kbps')
    expect(report.inspector.technical.sampleRateDisplay).toBe('44.1 kHz')
    
    // MP3 320 should score in "good" range (50-69)
    expect(report.analysis.qualityScore).toBeGreaterThanOrEqual(50)
    expect(report.analysis.qualityScore).toBeLessThan(70)
    expect(report.analysis.qualityTier).toBe('good')
    
    // Source should indicate high-bitrate lossy
    expect(report.analysis.likelySource.label).toBe('high_bitrate_lossy')
    
    // Still NOT archive worthy (lossy)
    expect(report.analysis.flags.archiveWorthy).toBe(false)
  })
})

describe('Phase 2 Accuracy: FLAC 16-bit 44.1 kHz (CD Quality)', () => {
  const flac_cd_input = `codec_name=flac
sample_rate=44100
channels=2
bits_per_raw_sample=16
duration=312.4`

  it('should classify FLAC 16/44.1 as CD quality (very good tier)', () => {
    const report = analyzeFFprobeText(flac_cd_input)
    
    expect(report.inspector.codec.display).toBe('FLAC')
    expect(report.inspector.codec.compressionType).toBe('lossless')
    expect(report.inspector.technical.sampleRateDisplay).toBe('44.1 kHz')
    expect(report.inspector.technical.bitDepth).toBe(16)
    
    // CD quality FLAC should score in "very good" range (70-84)
    expect(report.analysis.qualityScore).toBeGreaterThanOrEqual(70)
    expect(report.analysis.qualityScore).toBeLessThan(85)
    expect(report.analysis.qualityTier).toBe('very_good')
    
    // Source should indicate CD rip
    expect(report.analysis.likelySource.label).toBe('cd_rip')
    expect(report.analysis.likelySource.confidence).toBeGreaterThanOrEqual(80)
    
    // Should be archive worthy
    expect(report.analysis.flags.archiveWorthy).toBe(true)
  })
})

describe('Phase 2 Accuracy: FLAC 24-bit 96 kHz (Hi-Res)', () => {
  const flac_hires_input = `codec_name=flac
sample_rate=96000
channels=2
bits_per_raw_sample=24
duration=256.8`

  it('should classify FLAC 24/96 as Hi-Res (excellent or reference tier)', () => {
    const report = analyzeFFprobeText(flac_hires_input)
    
    expect(report.inspector.codec.display).toBe('FLAC')
    expect(report.inspector.codec.compressionType).toBe('lossless')
    expect(report.inspector.technical.sampleRateDisplay).toBe('96 kHz')
    expect(report.inspector.technical.bitDepth).toBe(24)
    
    // Hi-Res FLAC should score in "excellent" or "reference" range (85+)
    expect(report.analysis.qualityScore).toBeGreaterThanOrEqual(85)
    expect(['excellent', 'reference']).toContain(report.analysis.qualityTier)
    
    // Source should indicate Hi-Res download
    expect(report.analysis.likelySource.label).toBe('hi_res_download')
    
    // Should be archive worthy and audiophile grade
    expect(report.analysis.flags.archiveWorthy).toBe(true)
    expect(report.analysis.flags.audiophileGrade).toBe(true)
  })
})

describe('Phase 2 Accuracy: AAC 256 kbps', () => {
  const aac_256_input = `codec_name=aac
sample_rate=44100
bit_rate=256000
channels=2
duration=198.2`

  it('should classify AAC 256 kbps as decent lossy (good tier)', () => {
    const report = analyzeFFprobeText(aac_256_input)
    
    expect(report.inspector.codec.display).toBe('AAC')
    expect(report.inspector.codec.compressionType).toBe('lossy')
    expect(report.inspector.technical.bitRateDisplay).toBe('256 kbps')
    
    // AAC 256 should score in "good" range
    expect(report.analysis.qualityScore).toBeGreaterThanOrEqual(50)
    expect(report.analysis.qualityScore).toBeLessThan(70)
    expect(report.analysis.qualityTier).toBe('good')
    
    // Source should indicate iTunes/streaming purchase
    expect(report.analysis.likelySource.label).toBe('itunes_aac')
    
    // NOT archive worthy (lossy)
    expect(report.analysis.flags.archiveWorthy).toBe(false)
  })
})

describe('Phase 2 Accuracy: Missing metadata handling', () => {
  const missing_bitrate_input = `codec_name=mp3
sample_rate=44100
channels=2`

  it('should handle missing bitrate gracefully', () => {
    const report = analyzeFFprobeText(missing_bitrate_input)
    
    expect(report.inspector.codec.display).toBe('MP3')
    expect(report.inspector.technical.bitRateDisplay).toBeUndefined()
    
    // Confidence should be reduced due to missing data
    expect(report.analysis.analysisConfidence).toBeLessThan(90)
    
    // Should still produce a reasonable analysis
    expect(report.analysis.qualityTier).toBeDefined()
    expect(report.analysis.likelySource.label).toBeDefined()
  })

  const minimal_input = `codec_name=flac`

  it('should handle minimal metadata without crashing', () => {
    const report = analyzeFFprobeText(minimal_input)
    
    expect(report.inspector.codec.display).toBe('FLAC')
    
    // Very low confidence due to missing data
    expect(report.analysis.analysisConfidence).toBeLessThan(60)
    
    // Should not fabricate values
    expect(report.inspector.technical.bitRateDisplay).toBeUndefined()
    expect(report.inspector.technical.sampleRateDisplay).toBeUndefined()
  })
})

describe('Phase 2 Accuracy: Malformed input', () => {
  it('should handle completely empty input', () => {
    const report = analyzeFFprobeText('')
    
    expect(report.inspector.codec.compressionType).toBe('unknown')
    expect(report.analysis.likelySource.label).toBe('unknown_source')
  })

  it('should handle garbage input', () => {
    const garbage = `this is not ffprobe output
random text here
no key=value pairs that matter`

    const report = analyzeFFprobeText(garbage)
    
    expect(report.inspector.codec.compressionType).toBe('unknown')
    expect(report.analysis.analysisConfidence).toBeLessThan(40)
  })
})

describe('Phase 2 Accuracy: Score calibration sanity checks', () => {
  it('MP3 128 should score lower than MP3 320', () => {
    const mp3_128 = analyzeFFprobeText(`codec_name=mp3
sample_rate=44100
bit_rate=128000
channels=2`)
    
    const mp3_320 = analyzeFFprobeText(`codec_name=mp3
sample_rate=44100
bit_rate=320000
channels=2`)
    
    expect(mp3_320.analysis.qualityScore).toBeGreaterThan(mp3_128.analysis.qualityScore)
  })

  it('FLAC CD should score higher than MP3 320', () => {
    const flac_cd = analyzeFFprobeText(`codec_name=flac
sample_rate=44100
bits_per_raw_sample=16
channels=2`)
    
    const mp3_320 = analyzeFFprobeText(`codec_name=mp3
sample_rate=44100
bit_rate=320000
channels=2`)
    
    expect(flac_cd.analysis.qualityScore).toBeGreaterThan(mp3_320.analysis.qualityScore)
  })

  it('FLAC Hi-Res should score higher than FLAC CD', () => {
    const flac_cd = analyzeFFprobeText(`codec_name=flac
sample_rate=44100
bits_per_raw_sample=16
channels=2`)
    
    const flac_hires = analyzeFFprobeText(`codec_name=flac
sample_rate=96000
bits_per_raw_sample=24
channels=2`)
    
    expect(flac_hires.analysis.qualityScore).toBeGreaterThan(flac_cd.analysis.qualityScore)
  })
})
