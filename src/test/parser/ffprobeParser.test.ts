import { describe, expect, it } from 'vitest'

import { parseFfprobeOutput } from '../../parser/ffprobeParser'

describe('parseFfprobeOutput', () => {
  it('parses simple key-value FFprobe text', () => {
    const result = parseFfprobeOutput(`
codec_name=mp3
sample_rate=48000
bit_rate=128000
channels=2
duration=185.42
TAG:encoder=Lavf60.3.100
`)

    expect(result).toEqual({
      codecName: 'mp3',
      sampleRate: 48000,
      bitRate: 128000,
      channels: 2,
      duration: 185.42,
      encoder: 'Lavf60.3.100',
      hasAlbumArt: false,
    })
  })

  it('prefers audio stream metadata from sectioned FFprobe output', () => {
    const result = parseFfprobeOutput(`
[STREAM]
codec_type=video
codec_name=mjpeg
DISPOSITION:attached_pic=1
[/STREAM]
[STREAM]
codec_type=audio
codec_name=flac
sample_rate=44100
channels=2
bits_per_raw_sample=16
[/STREAM]
[FORMAT]
duration=240.000000
bit_rate=920000
TAG:encoder=reference encoder
[/FORMAT]
`)

    expect(result).toMatchObject({
      codecName: 'flac',
      sampleRate: 44100,
      bitRate: 920000,
      channels: 2,
      duration: 240,
      encoder: 'reference encoder',
      hasAlbumArt: true,
    })
  })

  it('ignores unavailable numeric values without failing', () => {
    const result = parseFfprobeOutput(`
codec_name=aac
sample_rate=N/A
bit_rate=N/A
channels=2
`)

    expect(result).toEqual({
      codecName: 'aac',
      channels: 2,
      hasAlbumArt: false,
    })
  })
})
