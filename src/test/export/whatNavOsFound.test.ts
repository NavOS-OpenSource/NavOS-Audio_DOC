import { describe, it, expect } from 'vitest'
import { analyzeFFprobeText } from '../../engine/analysisEngine'

describe('WHAT NavOS FOUND text generation', () => {
  describe('source label classification', () => {
    it('CD-quality FLAC should get cd_rip label', () => {
      const input = `codec_name=flac
sample_rate=44100
bits_per_sample=16
channels=2
duration=198.2`

      const report = analyzeFFprobeText(input)
      expect(report.analysis.likelySource.label).toBe('cd_rip')
      expect(report.analysis.likelySource.displayLabel).toBe('CD Rip')
    })

    it('Hi-Res 176.4 kHz FLAC should get hi_res_download label', () => {
      const input = `codec_name=flac
sample_rate=176400
bits_per_sample=24
channels=2
duration=320.4`

      const report = analyzeFFprobeText(input)
      expect(report.analysis.likelySource.label).toBe('hi_res_download')
      expect(report.analysis.likelySource.displayLabel).toBe('Hi-Res Download')
      expect(report.inspector.technical.sampleRateHz).toBe(176400)
    })

    it('Hi-Res 96 kHz FLAC should get hi_res_download label', () => {
      const input = `codec_name=flac
sample_rate=96000
bits_per_sample=24
channels=2
duration=240.0`

      const report = analyzeFFprobeText(input)
      expect(report.analysis.likelySource.label).toBe('hi_res_download')
    })

    it('Hi-Res 192 kHz FLAC should get hi_res_download label', () => {
      const input = `codec_name=flac
sample_rate=192000
bits_per_sample=24
channels=2
duration=180.0`

      const report = analyzeFFprobeText(input)
      expect(report.analysis.likelySource.label).toBe('hi_res_download')
    })

    it('48 kHz 24-bit FLAC should NOT be classified as hi_res_download', () => {
      const input = `codec_name=flac
sample_rate=48000
bits_per_sample=24
channels=2
duration=200.0`

      const report = analyzeFFprobeText(input)
      expect(report.analysis.likelySource.label).not.toBe('hi_res_download')
    })
  })
})
