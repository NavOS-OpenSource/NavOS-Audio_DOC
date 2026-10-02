/**
 * Audio Metadata Extractor
 * 
 * Browser-based metadata extraction using music-metadata library.
 * Converts extracted metadata to FFprobe-like format for the existing parser.
 */

import * as musicMetadata from 'music-metadata'

import type { ParsedMetadata } from '../types/metadata'

export interface ExtractedFileInfo {
  fileName: string
  fileSize: number
  mimeType: string
}

export interface ExtractionResult {
  success: true
  metadata: ParsedMetadata
  fileInfo: ExtractedFileInfo
  rawMetadata: musicMetadata.IAudioMetadata
  albumArtUrl?: string
}

export interface ExtractionError {
  success: false
  error: string
  fileInfo?: ExtractedFileInfo
}

export type ExtractionOutcome = ExtractionResult | ExtractionError

// Supported audio MIME types
const SUPPORTED_MIME_TYPES = new Set([
  'audio/mpeg',        // MP3
  'audio/mp3',         // MP3 (alternate)
  'audio/flac',        // FLAC
  'audio/x-flac',      // FLAC (alternate)
  'audio/wav',         // WAV
  'audio/wave',        // WAV (alternate)
  'audio/x-wav',       // WAV (alternate)
  'audio/mp4',         // M4A/AAC
  'audio/m4a',         // M4A (alternate)
  'audio/x-m4a',       // M4A (alternate)
  'audio/aac',         // AAC
  'audio/ogg',         // OGG/Vorbis/Opus
  'audio/vorbis',      // Vorbis
  'audio/opus',        // Opus
  'application/ogg',   // OGG (alternate)
  'audio/aiff',        // AIFF
  'audio/x-aiff',      // AIFF (alternate)
  'audio/webm',        // WebM audio
])

// Supported file extensions
const SUPPORTED_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.aiff',
  '.aif',
  '.webm',
  '.wma',
])

/**
 * Check if a file is a supported audio format
 */
export function isSupportedAudioFile(file: File): boolean {
  // Check MIME type
  if (file.type && SUPPORTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true
  }
  
  // Fall back to extension check
  const ext = getFileExtension(file.name)
  return SUPPORTED_EXTENSIONS.has(ext.toLowerCase())
}

/**
 * Get file extension including the dot
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return ''
  }
  return filename.slice(lastDot).toLowerCase()
}

/**
 * Format codec name to match FFprobe style
 */
function normalizeCodecName(container?: string, codec?: string): string {
  const c = (codec || container || '').toLowerCase()
  
  // Map music-metadata codec names to FFprobe-like names
  const codecMap: Record<string, string> = {
    'mpeg 1 layer 3': 'mp3',
    'mpeg 2 layer 3': 'mp3',
    'mpeg audio': 'mp3',
    'flac': 'flac',
    'free lossless audio codec': 'flac',
    'pcm': 'pcm_s16le',
    'wave': 'pcm_s16le',
    'aac': 'aac',
    'mp4a': 'aac',
    'mpeg-4': 'aac',
    'vorbis': 'vorbis',
    'opus': 'opus',
    'alac': 'alac',
    'aiff': 'pcm_s16be',
  }
  
  for (const [key, value] of Object.entries(codecMap)) {
    if (c.includes(key)) {
      return value
    }
  }
  
  // Return normalized version
  return c.replace(/[^a-z0-9]/g, '_') || 'unknown'
}

/**
 * Extract metadata from an audio file using music-metadata
 */
export async function extractMetadata(file: File): Promise<ExtractionOutcome> {
  const fileInfo: ExtractedFileInfo = {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  }
  
  // Validate file
  if (!file || file.size === 0) {
    return {
      success: false,
      error: 'File is empty or invalid',
      fileInfo,
    }
  }
  
  if (!isSupportedAudioFile(file)) {
    return {
      success: false,
      error: `Unsupported file format. Supported formats: MP3, FLAC, WAV, M4A/AAC, OGG/Opus`,
      fileInfo,
    }
  }
  
  // File size limit (500 MB)
  const MAX_FILE_SIZE = 500 * 1024 * 1024
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File too large. Maximum size is 500 MB.`,
      fileInfo,
    }
  }
  
  try {
    // Parse metadata using music-metadata
    const rawMetadata = await musicMetadata.parseBlob(file)
    
    // Convert to ParsedMetadata format (FFprobe-like)
    const metadata = convertToFFprobeFormat(rawMetadata, file)
    
    // Extract album art as data URL if present
    let albumArtUrl: string | undefined
    if (rawMetadata.common.picture && rawMetadata.common.picture.length > 0) {
      const picture = rawMetadata.common.picture[0]
      const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format })
      albumArtUrl = URL.createObjectURL(blob)
    }
    
    return {
      success: true,
      metadata,
      fileInfo,
      rawMetadata,
      albumArtUrl,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during metadata extraction'
    return {
      success: false,
      error: `Failed to extract metadata: ${errorMessage}`,
      fileInfo,
    }
  }
}

/**
 * Convert music-metadata format to our ParsedMetadata (FFprobe-like)
 */
function convertToFFprobeFormat(raw: musicMetadata.IAudioMetadata, file: File): ParsedMetadata {
  const format = raw.format
  
  // Extract codec name
  const codecName = normalizeCodecName(format.container, format.codec)
  
  // Calculate bitrate in bps (music-metadata gives it in bps)
  const bitRate = format.bitrate || undefined
  
  // Get bit depth - try various sources
  let bitDepth: number | undefined
  if (format.bitsPerSample) {
    bitDepth = format.bitsPerSample
  }
  
  // Determine encoder from native tags if available
  let encoder: string | undefined
  if (raw.common.encodedby) {
    encoder = raw.common.encodedby
  } else if (raw.common.encodersettings) {
    encoder = raw.common.encodersettings
  }
  
  // Check for album art
  const hasAlbumArt = raw.common.picture && raw.common.picture.length > 0
  
  return {
    codec_name: codecName,
    sample_rate: format.sampleRate,
    bit_rate: bitRate,
    channels: format.numberOfChannels,
    duration: format.duration,
    bits_per_raw_sample: bitDepth,
    encoder: encoder,
    // Additional metadata we can include
    format_name: format.container,
    // Album art info
    has_album_art: hasAlbumArt,
    // File info for reference
    filename: file.name,
  }
}

/**
 * Convert ParsedMetadata to FFprobe-style text for the existing parser
 * This allows us to reuse the existing analyzeFFprobeText pipeline
 */
export function metadataToFFprobeText(metadata: ParsedMetadata): string {
  const lines: string[] = []
  
  if (metadata.codec_name) {
    lines.push(`codec_name=${metadata.codec_name}`)
  }
  if (metadata.sample_rate !== undefined) {
    lines.push(`sample_rate=${metadata.sample_rate}`)
  }
  if (metadata.bit_rate !== undefined) {
    lines.push(`bit_rate=${Math.round(metadata.bit_rate)}`)
  }
  if (metadata.channels !== undefined) {
    lines.push(`channels=${metadata.channels}`)
  }
  if (metadata.duration !== undefined) {
    lines.push(`duration=${metadata.duration}`)
  }
  if (metadata.bits_per_raw_sample !== undefined) {
    lines.push(`bits_per_raw_sample=${metadata.bits_per_raw_sample}`)
  }
  if (metadata.encoder) {
    lines.push(`encoder=${metadata.encoder}`)
  }
  if (metadata.format_name) {
    lines.push(`format_name=${metadata.format_name}`)
  }
  if (metadata.has_album_art) {
    lines.push(`disposition:attached_pic=1`)
  }
  
  return lines.join('\n')
}
