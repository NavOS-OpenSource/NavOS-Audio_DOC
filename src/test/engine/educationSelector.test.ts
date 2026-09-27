import { describe, it, expect } from 'vitest'
import { selectEducationTopics } from '../../engine/educationSelector'
import type { NormalizedMetadata, CompressionType } from '../../types/metadata'

// Helper to create minimal metadata
const createMetadata = (overrides: {
  codec?: Partial<NormalizedMetadata['codec']>
  technical?: Partial<NormalizedMetadata['technical']>
  file?: Partial<NormalizedMetadata['file']>
  tags?: Partial<NormalizedMetadata['tags']>
}): NormalizedMetadata => ({
  codec: {
    raw: 'unknown',
    display: 'Unknown',
    compressionType: 'unknown' as CompressionType,
    ...overrides.codec,
  },
  technical: {
    sampleRateHz: undefined,
    sampleRateDisplay: undefined,
    bitRateBps: undefined,
    bitRateDisplay: undefined,
    bitDepth: undefined,
    channels: undefined,
    channelLayoutDisplay: undefined,
    ...overrides.technical,
  },
  file: {
    durationSeconds: undefined,
    durationDisplay: undefined,
    ...overrides.file,
  },
  tags: {
    hasAlbumArt: false,
    encoder: undefined,
    ...overrides.tags,
  },
})

describe('educationSelector', () => {
  describe('selectEducationTopics', () => {
    describe('MP3 128 kbps', () => {
      const metadata = createMetadata({
        codec: { raw: 'mp3', display: 'MP3', compressionType: 'lossy' },
        technical: { bitRateBps: 128000, bitRateDisplay: '128 kbps', sampleRateHz: 44100, sampleRateDisplay: '44.1 kHz', channels: 2, channelLayoutDisplay: 'Stereo' },
      })
      
      it('returns MP3-related topics', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('mp3') || t.title.includes('MP3'))).toBe(true)
      })
      
      it('returns low bitrate topics', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('128kbps') || t.id.includes('bitrate.low'))).toBe(true)
      })
      
      it('returns lossy compression topic', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('lossy'))).toBe(true)
      })
      
      it('generates whatThisMeans summary', () => {
        const result = selectEducationTopics(metadata)
        expect(result.whatThisMeans).toBeDefined()
        expect(result.whatThisMeans?.toLowerCase()).toContain('lossy')
      })
      
      it('limits topics to avoid overwhelming users', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.length).toBeLessThanOrEqual(4)
      })
    })

    describe('MP3 320 kbps', () => {
      const metadata = createMetadata({
        codec: { raw: 'mp3', display: 'MP3', compressionType: 'lossy' },
        technical: { bitRateBps: 320000, bitRateDisplay: '320 kbps', sampleRateHz: 44100, sampleRateDisplay: '44.1 kHz', channels: 2, channelLayoutDisplay: 'Stereo' },
      })
      
      it('returns MP3 topics', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('mp3') || t.title.includes('MP3'))).toBe(true)
      })
      
      it('returns high bitrate topic', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('bitrate.high'))).toBe(true)
      })
      
      it('generates high bitrate lossy summary', () => {
        const result = selectEducationTopics(metadata)
        expect(result.whatThisMeans).toBeDefined()
        expect(result.whatThisMeans?.toLowerCase()).toContain('high')
      })
    })

    describe('AAC', () => {
      const metadata = createMetadata({
        codec: { raw: 'aac', display: 'AAC', compressionType: 'lossy' },
        technical: { bitRateBps: 256000, bitRateDisplay: '256 kbps', sampleRateHz: 44100, sampleRateDisplay: '44.1 kHz', channels: 2, channelLayoutDisplay: 'Stereo' },
      })
      
      it('returns AAC-related topics', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('aac') || t.title.includes('AAC'))).toBe(true)
      })
      
      it('returns lossy compression topic', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('lossy'))).toBe(true)
      })
    })

    describe('FLAC 16/44.1 (CD quality)', () => {
      const metadata = createMetadata({
        codec: { raw: 'flac', display: 'FLAC', compressionType: 'lossless' },
        technical: { sampleRateHz: 44100, sampleRateDisplay: '44.1 kHz', bitDepth: 16, channels: 2, channelLayoutDisplay: 'Stereo' },
      })
      
      it('returns FLAC topics', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('flac') || t.title.includes('FLAC'))).toBe(true)
      })
      
      it('returns lossless topic', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('lossless'))).toBe(true)
      })
      
      it('returns CD quality topic', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('cdquality') || t.title.toLowerCase().includes('cd'))).toBe(true)
      })
      
      it('generates CD quality summary', () => {
        const result = selectEducationTopics(metadata)
        expect(result.whatThisMeans).toBeDefined()
        expect(result.whatThisMeans?.toLowerCase()).toMatch(/cd|lossless/)
      })
    })

    describe('FLAC 24/96 (Hi-Res)', () => {
      const metadata = createMetadata({
        codec: { raw: 'flac', display: 'FLAC', compressionType: 'lossless' },
        technical: { sampleRateHz: 96000, sampleRateDisplay: '96 kHz', bitDepth: 24, channels: 2, channelLayoutDisplay: 'Stereo' },
      })
      
      it('returns Hi-Res topics', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('hires') || t.title.toLowerCase().includes('hi-res'))).toBe(true)
      })
      
      it('returns 24-bit topic', () => {
        const result = selectEducationTopics(metadata)
        expect(result.topics.some(t => t.id.includes('bitdepth') || t.title.toLowerCase().includes('24-bit'))).toBe(true)
      })
      
      it('generates Hi-Res summary', () => {
        const result = selectEducationTopics(metadata)
        expect(result.whatThisMeans).toBeDefined()
        expect(result.whatThisMeans?.toLowerCase()).toMatch(/hi-res|high.?res/)
      })
      
      it('provides Hi-Res guidance', () => {
        const result = selectEducationTopics(metadata)
        expect(result.guidance).toBeDefined()
        expect(result.guidance?.some(g => g.type === 'hires')).toBe(true)
      })
    })

    describe('incomplete metadata', () => {
      const metadata = createMetadata({
        codec: { raw: 'mp3', display: 'MP3', compressionType: 'lossy' },
        technical: { sampleRateHz: undefined, bitRateBps: undefined, bitDepth: undefined, channels: 2, channelLayoutDisplay: 'Stereo' },
      })
      
      it('still returns some education even with missing metadata', () => {
        const result = selectEducationTopics(metadata)
        // Should at least have MP3 and lossy topics
        expect(result.topics.length).toBeGreaterThanOrEqual(1)
      })
      
      it('generates a summary even with missing data', () => {
        const result = selectEducationTopics(metadata)
        // Should still provide some summary
        expect(result.whatThisMeans).toBeDefined()
      })
    })

    describe('guidance selection', () => {
      it('provides archive guidance for lossless files', () => {
        const metadata = createMetadata({
          codec: { raw: 'flac', display: 'FLAC', compressionType: 'lossless' },
          technical: { sampleRateHz: 44100, bitDepth: 16 },
        })
        
        const result = selectEducationTopics(metadata)
        expect(result.guidance).toBeDefined()
        expect(result.guidance?.some(g => g.type === 'archive')).toBe(true)
      })
      
      it('provides everyday guidance for lossy files', () => {
        const metadata = createMetadata({
          codec: { raw: 'mp3', display: 'MP3', compressionType: 'lossy' },
          technical: { bitRateBps: 128000 },
        })
        
        const result = selectEducationTopics(metadata)
        expect(result.guidance).toBeDefined()
        expect(result.guidance?.some(g => g.type === 'everyday')).toBe(true)
      })
      
      it('does not show irrelevant guidance types', () => {
        const metadata = createMetadata({
          codec: { raw: 'mp3', display: 'MP3', compressionType: 'lossy' },
          technical: { bitRateBps: 128000, sampleRateHz: 44100 },
        })
        
        const result = selectEducationTopics(metadata)
        // Lossy file should not get hi-res guidance
        expect(result.guidance?.some(g => g.type === 'hires')).toBeFalsy()
      })
    })

    describe('topic deduplication', () => {
      it('does not show duplicate titles', () => {
        const metadata = createMetadata({
          codec: { raw: 'flac', display: 'FLAC', compressionType: 'lossless' },
          technical: { sampleRateHz: 44100, bitDepth: 16, channels: 2 },
        })
        
        const result = selectEducationTopics(metadata)
        const titles = result.topics.map(t => t.title)
        const uniqueTitles = [...new Set(titles)]
        
        expect(titles.length).toBe(uniqueTitles.length)
      })
    })
  })
})
