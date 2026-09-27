import { describe, expect, it } from 'vitest'

import { normalizeAudioMetadata } from '../../normalizer/audioMetadataNormalizer'

describe('normalizeAudioMetadata', () => {
  it('normalizes common MP3 metadata for display and later analysis', () => {
    const result = normalizeAudioMetadata({
      codecName: 'mp3',
      sampleRate: 48000,
      bitRate: 128000,
      channels: 2,
      duration: 185.42,
      encoder: ' Lavf60.3.100 ',
      hasAlbumArt: true,
    })

    expect(result).toEqual({
      codec: {
        raw: 'mp3',
        display: 'MP3',
        compressionType: 'lossy',
      },
      technical: {
        sampleRateHz: 48000,
        sampleRateDisplay: '48 kHz',
        bitRateBps: 128000,
        bitRateDisplay: '128 kbps',
        bitDepth: undefined,
        channels: 2,
        channelLayoutDisplay: 'Stereo',
      },
      file: {
        durationSeconds: 185.42,
        durationDisplay: '3:05',
        sizeBytes: undefined,
      },
      tags: {
        encoder: 'Lavf60.3.100',
        hasAlbumArt: true,
      },
    })
  })

  it('normalizes lossless CD-quality metadata', () => {
    const result = normalizeAudioMetadata({
      codecName: 'FLAC',
      sampleRate: 44100,
      bitRate: 920000,
      channels: 2,
      duration: 3601,
    })

    expect(result.codec).toEqual({
      raw: 'flac',
      display: 'FLAC',
      compressionType: 'lossless',
    })
    expect(result.technical.sampleRateDisplay).toBe('44.1 kHz')
    expect(result.technical.bitRateDisplay).toBe('920 kbps')
    expect(result.file.durationDisplay).toBe('1:00:01')
  })

  it('keeps missing values undefined so confidence can be reduced later', () => {
    const result = normalizeAudioMetadata({
      codecName: 'unknown_codec',
    })

    expect(result).toEqual({
      codec: {
        raw: 'unknown_codec',
        display: 'UNKNOWN_CODEC',
        compressionType: 'unknown',
      },
      technical: {
        sampleRateHz: undefined,
        sampleRateDisplay: undefined,
        bitRateBps: undefined,
        bitRateDisplay: undefined,
        bitDepth: undefined,
        channels: undefined,
        channelLayoutDisplay: undefined,
      },
      file: {
        durationSeconds: undefined,
        durationDisplay: undefined,
        sizeBytes: undefined,
      },
      tags: {
        encoder: undefined,
        hasAlbumArt: false,
      },
    })
  })
})
