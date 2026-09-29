/**
 * Spectral Analyzer Engine
 * 
 * Orchestrates audio decoding and spectral analysis using Web Audio API and Web Workers.
 * All processing is done locally in the browser - no network requests.
 * 
 * CRITICAL: This module preserves the ORIGINAL sample rate of audio files.
 * For forensic/provenance analysis, we must NOT resample high-resolution audio.
 * A 176.4 kHz file must be analyzed at 176.4 kHz to see frequencies up to 88.2 kHz.
 */

import type {
  SpectralAnalysisResult,
  SpectralAnalysisState,
  SpectralWorkerMessage,
} from '../types/spectral'
import type { NormalizedMetadata } from '../types/metadata'

// Create worker from the bundled worker file
let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    // Create worker using Vite's worker import
    worker = new Worker(new URL('../workers/spectralWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

/**
 * Create an AudioContext that matches the desired sample rate as closely as possible.
 * Tries the exact rate first, then falls back to supported rates.
 * 
 * This is critical for high-resolution audio: if we use a default context (44.1/48 kHz),
 * decodeAudioData() will resample the audio and destroy high-frequency content.
 */
async function createAudioContextForSampleRate(targetRate: number | undefined): Promise<AudioContext> {
  if (!targetRate || targetRate <= 0) {
    console.warn(`[SpectralAnalyzer] No sample rate specified, using default AudioContext`)
    return new AudioContext()
  }
  
  // Try the exact sample rate first
  try {
    const ctx = new AudioContext({ sampleRate: targetRate })
    console.log(`[SpectralAnalyzer] Created AudioContext at ${targetRate} Hz to match source`)
    return ctx
  } catch {
    console.warn(`[SpectralAnalyzer] Browser doesn't support ${targetRate} Hz, trying fallback...`)
  }
  
  // Try common high sample rates in descending order
  const fallbackRates = [192000, 176400, 96000, 88200, 48000, 44100]
  
  for (const rate of fallbackRates) {
    if (rate <= targetRate) {
      try {
        const ctx = new AudioContext({ sampleRate: rate })
        console.log(`[SpectralAnalyzer] Using fallback rate ${rate} Hz (original was ${targetRate} Hz)`)
        return ctx
      } catch {
        continue
      }
    }
  }
  
  // Last resort: default context
  console.warn(`[SpectralAnalyzer] Using default AudioContext (system rate)`)
  return new AudioContext()
}

/**
 * Decode audio file to PCM samples using Web Audio API.
 * 
 * CRITICAL: The AudioContext MUST be created with the original file's sample rate.
 * If we create a default AudioContext (which uses system rate like 44.1/48 kHz),
 * decodeAudioData() will RESAMPLE the audio, destroying high-frequency content.
 * 
 * Example: A 176.4 kHz file decoded with a 44.1 kHz context loses all data above 22 kHz!
 * 
 * @param file - The audio file to decode
 * @param originalSampleRate - The file's ORIGINAL sample rate from metadata (e.g., 176400 Hz)
 * @param onProgress - Progress callback
 */
async function decodeAudioFile(
  file: File,
  originalSampleRate: number | undefined,
  onProgress: (message: string) => void
): Promise<{ 
  left: Float32Array
  right?: Float32Array
  sampleRate: number
  duration: number
  originalSampleRate: number | undefined
  wasResampled: boolean
}> {
  onProgress('Reading audio file...')
  
  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  
  onProgress('Decoding audio...')
  
  // CRITICAL FIX: Create AudioContext with the ORIGINAL sample rate if known.
  // This prevents decodeAudioData() from resampling the audio.
  const audioContext = await createAudioContextForSampleRate(originalSampleRate)
  
  try {
    // Decode audio data
    // This will use the AudioContext's sample rate (which we set to match the original)
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    const decodedSampleRate = audioBuffer.sampleRate
    const duration = audioBuffer.duration
    const channels = audioBuffer.numberOfChannels
    
    // Log diagnostic information
    console.log('[SpectralAnalyzer] Decoding complete:')
    console.log(`  Original sample rate (from metadata): ${originalSampleRate ? originalSampleRate.toLocaleString() + ' Hz' : 'unknown'}`)
    console.log(`  AudioContext sample rate: ${audioContext.sampleRate.toLocaleString()} Hz`)
    console.log(`  Decoded AudioBuffer sample rate: ${decodedSampleRate.toLocaleString()} Hz`)
    console.log(`  Duration: ${duration.toFixed(2)}s`)
    console.log(`  Channels: ${channels}`)
    console.log(`  Samples per channel: ${audioBuffer.length.toLocaleString()}`)
    console.log(`  Nyquist frequency: ${(decodedSampleRate / 2 / 1000).toFixed(2)} kHz`)
    
    // Check if resampling occurred
    const wasResampled = originalSampleRate !== undefined && 
                         Math.abs(decodedSampleRate - originalSampleRate) > 100  // Allow small tolerance
    
    if (wasResampled) {
      console.warn(`[SpectralAnalyzer] WARNING: Audio was resampled from ${originalSampleRate} Hz to ${decodedSampleRate} Hz!`)
      console.warn(`  This may affect high-frequency analysis for provenance detection.`)
    }
    
    // Extract channel data
    const left = audioBuffer.getChannelData(0)
    const right = channels >= 2 ? audioBuffer.getChannelData(1) : undefined
    
    return { 
      left, 
      right, 
      sampleRate: decodedSampleRate, 
      duration,
      originalSampleRate,
      wasResampled
    }
  } finally {
    // Close audio context to free resources
    await audioContext.close()
  }
}

/**
 * Run spectral analysis on decoded audio
 */
function runSpectralAnalysis(
  audioData: { 
    left: Float32Array
    right?: Float32Array
    sampleRate: number
    duration: number
    originalSampleRate: number | undefined
    wasResampled: boolean
  },
  onProgress: (progress: number, message: string) => void
): Promise<SpectralAnalysisResult> {
  return new Promise((resolve, reject) => {
    const spectralWorker = getWorker()
    
    const handleMessage = (event: MessageEvent<SpectralWorkerMessage>) => {
      const message = event.data
      
      switch (message.type) {
        case 'progress':
          onProgress(message.progress, message.message)
          break
        case 'result':
          spectralWorker.removeEventListener('message', handleMessage)
          spectralWorker.removeEventListener('error', handleError)
          resolve(message.result)
          break
        case 'error':
          spectralWorker.removeEventListener('message', handleMessage)
          spectralWorker.removeEventListener('error', handleError)
          reject(new Error(message.error))
          break
      }
    }
    
    const handleError = (error: ErrorEvent) => {
      spectralWorker.removeEventListener('message', handleMessage)
      spectralWorker.removeEventListener('error', handleError)
      reject(new Error(`Worker error: ${error.message}`))
    }
    
    spectralWorker.addEventListener('message', handleMessage)
    spectralWorker.addEventListener('error', handleError)
    
    // Send data to worker (using transferable for large arrays)
    const transferables: Transferable[] = [audioData.left.buffer]
    if (audioData.right) {
      transferables.push(audioData.right.buffer)
    }
    
    spectralWorker.postMessage(
      {
        type: 'analyze',
        audioData: {
          left: audioData.left,
          right: audioData.right,
          sampleRate: audioData.sampleRate,
          duration: audioData.duration,
          originalSampleRate: audioData.originalSampleRate,
          wasResampled: audioData.wasResampled
        }
      },
      transferables
    )
  })
}

/**
 * Refine provenance assessment with metadata context
 * This adds information from the file's metadata to improve the assessment
 */
function refineProvenanceWithMetadata(
  result: SpectralAnalysisResult,
  metadata: NormalizedMetadata
): SpectralAnalysisResult {
  const isLosslessContainer = 
    metadata.codec.compressionType === 'lossless' ||
    metadata.codec.compressionType === 'uncompressed'
  
  const isLossyFormat = metadata.codec.compressionType === 'lossy'
  
  const { provenance, metrics } = result
  const updatedIndicators = [...provenance.indicators]
  const updatedFacts = [...provenance.measuredFacts]
  
  // Add metadata facts
  updatedFacts.unshift(`File format: ${metadata.codec.display || 'Unknown'}`)
  updatedFacts.unshift(`Compression type: ${metadata.codec.compressionType}`)
  
  // Check for container vs spectral mismatch
  if (isLosslessContainer) {
    const hasLossyIndicators = provenance.indicators.some(
      i => (i.supports === 'lossy' || i.supports === 'transcoded') && i.significance === 'strong'
    )
    
    if (hasLossyIndicators) {
      // Strong evidence of transcoded file
      return {
        ...result,
        provenance: {
          ...provenance,
          verdict: 'likely_lossy_transcoded',
          confidence: Math.min(90, provenance.confidence + 15),
          confidenceLabel: provenance.confidence + 15 >= 80 ? 'very_high' : 'high',
          measuredFacts: updatedFacts,
          interpretation: `The file is encoded in ${metadata.codec.display || 'a lossless format'}, but spectral analysis shows characteristics consistent with a lossy source. The sharp frequency cutoff and energy distribution suggest this may be a transcoded file (a lossy source converted to lossless container).`,
          indicators: [
            ...updatedIndicators,
            {
              type: 'metadata',
              finding: `Container (${metadata.codec.display}) claims lossless but spectral evidence suggests otherwise`,
              significance: 'strong',
              supports: 'transcoded'
            }
          ]
        }
      }
    }
  }
  
  // If lossy format with expected lossy characteristics, confirm
  if (isLossyFormat && metrics.detectedCutoffHz !== null) {
    return {
      ...result,
      provenance: {
        ...provenance,
        verdict: 'likely_original_lossy',
        confidence: Math.max(provenance.confidence, 75),
        confidenceLabel: 'high',
        measuredFacts: updatedFacts,
        interpretation: `This file is encoded in ${metadata.codec.display || 'a lossy format'}, and spectral analysis confirms characteristics typical of lossy compression. The spectral cutoff and encoding artifacts are consistent with this format.`,
        indicators: [
          ...updatedIndicators,
          {
            type: 'metadata',
            finding: `Lossy format (${metadata.codec.display}) with matching spectral characteristics`,
            significance: 'moderate',
            supports: 'lossy'
          }
        ]
      }
    }
  }
  
  // Check for genuine hi-res
  if (isLosslessContainer && 
      metadata.technical.sampleRateHz && 
      metadata.technical.sampleRateHz >= 88200 &&
      metrics.veryHighFrequencyEnergy > 0.5) {
    return {
      ...result,
      provenance: {
        ...provenance,
        verdict: 'likely_hires',
        confidence: Math.max(provenance.confidence, 70),
        confidenceLabel: 'high',
        measuredFacts: updatedFacts,
        interpretation: `This appears to be a genuine high-resolution audio file. The ${metadata.technical.sampleRateDisplay} sample rate is supported by actual ultrasonic content in the spectrum. This is consistent with a true hi-res source.`,
        indicators: updatedIndicators
      }
    }
  }
  
  // Default: just add the metadata facts
  return {
    ...result,
    provenance: {
      ...provenance,
      measuredFacts: updatedFacts
    }
  }
}

export interface SpectralAnalysisCallbacks {
  onStateChange: (state: SpectralAnalysisState) => void
}

/**
 * Analyze audio file - main entry point
 * 
 * @param file - The audio file to analyze
 * @param metadata - Normalized metadata including the ORIGINAL sample rate
 * @param callbacks - State change callbacks
 */
export async function analyzeAudioSpectrum(
  file: File,
  metadata: NormalizedMetadata,
  callbacks: SpectralAnalysisCallbacks
): Promise<SpectralAnalysisResult | null> {
  const { onStateChange } = callbacks
  
  // Get the original sample rate from metadata
  // This is CRITICAL for high-resolution audio analysis
  const originalSampleRate = metadata.technical?.sampleRateHz
  
  console.log('[SpectralAnalyzer] Starting analysis:')
  console.log(`  File: ${file.name}`)
  console.log(`  Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  Original sample rate (from metadata): ${originalSampleRate ? originalSampleRate.toLocaleString() + ' Hz' : 'unknown'}`)
  if (originalSampleRate) {
    console.log(`  Expected Nyquist: ${(originalSampleRate / 2 / 1000).toFixed(2)} kHz`)
  }
  
  try {
    // Decode audio with ORIGINAL sample rate preserved
    onStateChange({ status: 'decoding', message: 'Reading audio file...' })
    
    const audioData = await decodeAudioFile(file, originalSampleRate, (message) => {
      onStateChange({ status: 'decoding', message })
    })
    
    // Log sample rate integrity check
    if (audioData.wasResampled) {
      console.warn('[SpectralAnalyzer] SAMPLE RATE MISMATCH DETECTED!')
      console.warn(`  Analysis may be limited to ${(audioData.sampleRate / 2 / 1000).toFixed(2)} kHz instead of ${originalSampleRate ? (originalSampleRate / 2 / 1000).toFixed(2) : '??'} kHz`)
    }
    
    // Run spectral analysis
    onStateChange({ status: 'analyzing', progress: 0, message: 'Starting spectral analysis...' })
    
    const result = await runSpectralAnalysis(audioData, (progress, message) => {
      onStateChange({ status: 'analyzing', progress, message })
    })
    
    // Refine with metadata
    const refinedResult = refineProvenanceWithMetadata(result, metadata)
    
    // Complete
    onStateChange({ status: 'complete', result: refinedResult })
    
    return refinedResult
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during analysis'
    onStateChange({ status: 'error', error: errorMessage })
    return null
  }
}

/**
 * Terminate the worker (cleanup)
 */
export function terminateSpectralWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
