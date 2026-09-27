import type {
  CompressionType,
  NormalizedMetadata,
  ParsedMetadata,
} from '../types/metadata'

const LOSSY_CODECS = new Set(['mp3', 'aac', 'opus', 'vorbis', 'wma'])
const LOSSLESS_CODECS = new Set(['flac', 'alac', 'ape', 'wavpack'])
const UNCOMPRESSED_CODECS = new Set(['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le'])

const normalizeCodecName = (codecName: string | undefined): string | undefined => {
  const trimmed = codecName?.trim().toLowerCase()
  return trimmed || undefined
}

const getCompressionType = (codecName: string | undefined): CompressionType => {
  if (!codecName) {
    return 'unknown'
  }

  if (LOSSY_CODECS.has(codecName)) {
    return 'lossy'
  }

  if (LOSSLESS_CODECS.has(codecName)) {
    return 'lossless'
  }

  if (UNCOMPRESSED_CODECS.has(codecName) || codecName.startsWith('pcm_')) {
    return 'uncompressed'
  }

  return 'unknown'
}

const formatCodecDisplay = (codecName: string | undefined): string | undefined => {
  if (!codecName) {
    return undefined
  }

  const codecDisplayNames: Record<string, string> = {
    aac: 'AAC',
    alac: 'ALAC',
    ape: 'APE',
    flac: 'FLAC',
    mp3: 'MP3',
    opus: 'Opus',
    pcm_f32le: 'PCM 32-bit Float',
    pcm_s16le: 'PCM 16-bit',
    pcm_s24le: 'PCM 24-bit',
    pcm_s32le: 'PCM 32-bit',
    vorbis: 'Vorbis',
    wavpack: 'WavPack',
    wma: 'WMA',
  }

  return codecDisplayNames[codecName] ?? codecName.toUpperCase()
}

const formatBitRate = (bitRate: number | undefined): string | undefined => {
  if (!bitRate || bitRate <= 0) {
    return undefined
  }

  if (bitRate >= 1_000_000) {
    const mbps = bitRate / 1_000_000
    return `${Number(mbps.toFixed(2))} Mbps`
  }

  return `${Math.round(bitRate / 1000)} kbps`
}

const formatSampleRate = (sampleRate: number | undefined): string | undefined => {
  if (!sampleRate || sampleRate <= 0) {
    return undefined
  }

  const khz = sampleRate / 1000
  return `${Number(khz.toFixed(1))} kHz`
}

const formatDuration = (duration: number | undefined): string | undefined => {
  if (duration === undefined || duration < 0) {
    return undefined
  }

  const totalSeconds = Math.round(duration)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const formatChannels = (channels: number | undefined): string | undefined => {
  if (!channels || channels <= 0) {
    return undefined
  }

  if (channels === 1) {
    return 'Mono'
  }

  if (channels === 2) {
    return 'Stereo'
  }

  return `${channels} channels`
}

export const normalizeAudioMetadata = (
  parsedMetadata: ParsedMetadata,
): NormalizedMetadata => {
  const codecName = normalizeCodecName(parsedMetadata.codecName)

  return {
    codec: {
      raw: codecName,
      display: formatCodecDisplay(codecName),
      compressionType: getCompressionType(codecName),
    },
    technical: {
      sampleRateHz: parsedMetadata.sampleRate,
      sampleRateDisplay: formatSampleRate(parsedMetadata.sampleRate),
      bitRateBps: parsedMetadata.bitRate,
      bitRateDisplay: formatBitRate(parsedMetadata.bitRate),
      bitDepth: parsedMetadata.bitDepth,
      channels: parsedMetadata.channels,
      channelLayoutDisplay: formatChannels(parsedMetadata.channels),
    },
    file: {
      durationSeconds: parsedMetadata.duration,
      durationDisplay: formatDuration(parsedMetadata.duration),
      sizeBytes: parsedMetadata.fileSize,
    },
    tags: {
      encoder: parsedMetadata.encoder?.trim() || undefined,
      hasAlbumArt: parsedMetadata.hasAlbumArt ?? false,
    },
  }
}
