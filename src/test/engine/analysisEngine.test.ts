import { describe, expect, it } from 'vitest'

import { analyzeFFprobeText } from '../../engine/analysisEngine'

describe('analyzeFFprobeText', () => {
  it('analyzes MP3 128 kbps 48 kHz stereo as casual web-quality audio', () => {
    const report = analyzeFFprobeText(`
codec_name=mp3
sample_rate=48000
bit_rate=128000
channels=2
`)

    expect(report.inspector.codec.display).toBe('MP3')
    expect(report.inspector.technical.bitRateDisplay).toBe('128 kbps')
    // MP3 128 should be low quality (score <= 50)
    expect(report.analysis.qualityScore).toBeLessThanOrEqual(50)
    expect(report.analysis.likelySource.displayLabel).toBe(
      'Low-Bitrate Streaming / Web Rip',
    )
    expect(report.analysis.flags.archiveWorthy).toBe(false)
  })

  it('analyzes FLAC 16/44.1 style metadata as CD-quality audio', () => {
    const report = analyzeFFprobeText(`
codec_name=flac
sample_rate=44100
channels=2
bits_per_raw_sample=16
`)

    expect(report.inspector.codec.display).toBe('FLAC')
    // CD-quality FLAC should be very good (score >= 70)
    expect(report.analysis.qualityScore).toBeGreaterThanOrEqual(70)
    expect(report.analysis.likelySource.displayLabel).toBe('CD Rip')
    expect(report.analysis.flags.archiveWorthy).toBe(true)
    expect(report.analysis.flags.audiophileGrade).toBe(true)
  })

  it('analyzes FLAC 24/96 style metadata as hi-res audio', () => {
    const report = analyzeFFprobeText(`
codec_name=flac
sample_rate=96000
channels=2
bits_per_raw_sample=24
`)

    expect(report.inspector.technical.sampleRateDisplay).toBe('96 kHz')
    // Hi-Res FLAC should be excellent or reference (score >= 85)
    expect(report.analysis.qualityScore).toBeGreaterThanOrEqual(85)
    expect(report.analysis.likelySource.displayLabel).toBe('Hi-Res Download')
    expect(report.analysis.flags.archiveWorthy).toBe(true)
    expect(report.analysis.flags.audiophileGrade).toBe(true)
  })
})
