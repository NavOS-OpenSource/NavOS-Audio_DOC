import type { ParsedMetadata } from '../types/metadata'

type FfprobeSection = 'stream' | 'format' | 'other'

const numberFromValue = (value: string | undefined): number | undefined => {
  if (!value || value.toUpperCase() === 'N/A') {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const isAudioStreamLine = (line: string): boolean =>
  /stream\s*#\d+:\d+.*audio:/i.test(line)

const isAlbumArtLine = (line: string): boolean =>
  /attached\s+pic/i.test(line) ||
  /video:.*(png|mjpeg|jpeg|jpg)/i.test(line) ||
  /(album\s*art|cover\s*art|cover)/i.test(line)

export const parseFfprobeOutput = (rawText: string): ParsedMetadata => {
  const metadata: ParsedMetadata = {}
  const streamMetadata: ParsedMetadata[] = []
  let currentSection: FfprobeSection = 'other'
  let currentStream: ParsedMetadata | undefined
  let currentStreamIsAudio = false

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line) {
      continue
    }

    if (line === '[STREAM]') {
      currentSection = 'stream'
      currentStream = {}
      currentStreamIsAudio = false
      continue
    }

    if (line === '[/STREAM]') {
      if (currentStreamIsAudio && currentStream) {
        streamMetadata.push(currentStream)
      }
      currentSection = 'other'
      currentStream = undefined
      currentStreamIsAudio = false
      continue
    }

    if (line === '[FORMAT]') {
      currentSection = 'format'
      continue
    }

    if (line === '[/FORMAT]') {
      currentSection = 'other'
      continue
    }

    if (isAudioStreamLine(line)) {
      currentStreamIsAudio = true
    }

    if (isAlbumArtLine(line)) {
      metadata.hasAlbumArt = true
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    const target = currentSection === 'stream' && currentStream ? currentStream : metadata

    switch (key) {
      case 'codec_type':
        if (value === 'audio') {
          currentStreamIsAudio = true
        }
        if (value === 'video' && currentSection === 'stream') {
          currentStreamIsAudio = false
        }
        break
      case 'codec_name':
        target.codecName = value
        break
      case 'sample_rate':
        target.sampleRate = numberFromValue(value)
        break
      case 'bit_rate':
        target.bitRate = numberFromValue(value)
        break
      case 'channels':
        target.channels = numberFromValue(value)
        break
      case 'duration':
        target.duration = numberFromValue(value)
        break
      case 'TAG:encoder':
      case 'encoder':
        target.encoder = value
        break
      case 'bits_per_raw_sample':
      case 'bits_per_sample':
        target.bitDepth = numberFromValue(value)
        break
      case 'disposition:attached_pic':
      case 'DISPOSITION:attached_pic':
        if (value === '1') {
          metadata.hasAlbumArt = true
        }
        break
      default:
        break
    }
  }

  const audioStream = streamMetadata[0]

  return {
    ...metadata,
    ...audioStream,
    hasAlbumArt: metadata.hasAlbumArt ?? false,
  }
}
