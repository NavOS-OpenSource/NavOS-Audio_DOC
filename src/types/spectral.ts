/**
 * Spectral Analysis Types
 * 
 * Types for spectrogram generation, spectral metrics, and audio provenance assessment.
 * All processing is done locally in the browser.
 */

export interface SpectralAnalysisResult {
  spectrogram: SpectrogramData
  metrics: SpectralMetrics
  provenance: ProvenanceAssessment
  processing: ProcessingInfo
}

export interface SpectrogramData {
  /** Spectrogram magnitude data for left channel (or mono) - [timeFrame][frequencyBin] in dBFS */
  left: number[][]
  /** Spectrogram magnitude data for right channel (stereo only) */
  right?: number[][]
  /** Frequency values in Hz for each bin (y-axis) */
  frequencyBins: number[]
  /** Time values in seconds for each frame (x-axis) */
  timeFrames: number[]
  /** dB range for color mapping */
  dBRange: { min: number; max: number }
  /** Number of channels */
  channels: 1 | 2
}

export interface SpectralMetrics {
  // === SAMPLE RATE INTEGRITY ===
  /** Analysis sample rate in Hz (the rate at which FFT was performed) */
  sampleRate: number
  /** Original file sample rate from metadata (may differ if browser resampled) */
  originalSampleRate?: number
  /** Whether the audio was resampled during decoding (affects high-frequency analysis) */
  wasResampled: boolean
  
  /** Nyquist frequency (sampleRate / 2) - this is the ANALYSIS Nyquist */
  nyquistFrequency: number
  /** Duration in seconds */
  duration: number
  /** Number of channels */
  channels: number
  
  // === SPECTRAL MEASUREMENTS ===
  /** Detected high-frequency cutoff in Hz (null if no sharp cutoff detected) */
  detectedCutoffHz: number | null
  /** Confidence in cutoff detection (0-100) */
  cutoffConfidence: number
  /** Whether the cutoff appears sharp (lossy indicator) vs gradual */
  cutoffIsSharp: boolean
  
  /** Spectral centroid in Hz (center of mass of spectrum) */
  spectralCentroid: number
  /** Spectral rolloff frequency in Hz (where 85% of energy is below) */
  spectralRolloff: number
  /** Percentage of energy above 15 kHz */
  highFrequencyEnergy: number
  /** Percentage of energy above 18 kHz */
  veryHighFrequencyEnergy: number
  
  // === LEVEL MEASUREMENTS ===
  /** Peak level in dBFS */
  peakLevel: number
  /** RMS level in dBFS */
  rmsLevel: number
  /** Dynamic range in dB (peak - RMS or similar) */
  dynamicRange: number
  /** Crest factor (peak/RMS ratio in dB) */
  crestFactor: number
  
  // === STEREO MEASUREMENTS (if applicable) ===
  /** Correlation between L/R channels (-1 to 1) */
  channelCorrelation?: number
  /** Whether channels appear identical or nearly so */
  channelsMayBeDuplicates?: boolean

  // === FFT PARAMETERS (for transparency) ===
  fftSize: number
  hopSize: number
  windowFunction: string
  /** Frequency resolution in Hz per bin */
  frequencyResolution: number
  /** Time resolution in seconds per frame */
  timeResolution: number
}

export type ProvenanceVerdict = 
  | 'likely_lossless'
  | 'likely_hires'
  | 'likely_lossy_transcoded'
  | 'likely_original_lossy'
  | 'likely_upsampled'
  | 'insufficient_evidence'

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high'

export interface ProvenanceAssessment {
  /** Overall verdict */
  verdict: ProvenanceVerdict
  /** Confidence percentage (0-100) */
  confidence: number
  /** Human-readable confidence label */
  confidenceLabel: ConfidenceLevel
  
  /** Measured facts - what was actually observed */
  measuredFacts: string[]
  /** Interpretation of the measurements */
  interpretation: string
  /** Limitations of the analysis */
  limitations: string[]
  
  /** Individual evidence indicators */
  indicators: ProvenanceIndicator[]
}

export interface ProvenanceIndicator {
  /** Type of indicator */
  type: 'cutoff' | 'spectral_shape' | 'channel' | 'metadata' | 'nyquist' | 'energy_distribution' | 'resampling'
  /** What was found */
  finding: string
  /** How significant this finding is */
  significance: 'strong' | 'moderate' | 'weak'
  /** What this evidence supports */
  supports: 'lossless' | 'lossy' | 'transcoded' | 'upsampled' | 'neutral'
}

export interface ProcessingInfo {
  /** Total processing time in ms */
  totalTimeMs: number
  /** Decode time in ms */
  decodeTimeMs: number
  /** FFT/analysis time in ms */
  analysisTimeMs: number
  /** Number of FFT frames processed */
  framesProcessed: number
  /** Whether processing was downsampled for visualization (reducing frames, NOT audio) */
  wasDownsampled: boolean
  /** Original sample count before any downsampling */
  originalSampleCount: number
}

// Worker message types
export interface SpectralWorkerRequest {
  type: 'analyze'
  audioData: {
    left: Float32Array
    right?: Float32Array
    /** The sample rate at which the audio was decoded (analysis rate) */
    sampleRate: number
    duration: number
    /** Original file sample rate from metadata (may be higher than sampleRate) */
    originalSampleRate?: number
    /** Whether the browser resampled the audio during decoding */
    wasResampled?: boolean
  }
  options?: SpectralAnalysisOptions
}

export interface SpectralAnalysisOptions {
  fftSize?: number
  hopSize?: number
  maxFrames?: number  // Limit frames for very long files
}

export interface SpectralWorkerProgress {
  type: 'progress'
  stage: 'fft' | 'metrics' | 'provenance'
  progress: number  // 0-100
  message: string
}

export interface SpectralWorkerResult {
  type: 'result'
  result: SpectralAnalysisResult
}

export interface SpectralWorkerError {
  type: 'error'
  error: string
}

export type SpectralWorkerMessage = SpectralWorkerProgress | SpectralWorkerResult | SpectralWorkerError

// Analysis state for UI
export type SpectralAnalysisState = 
  | { status: 'idle' }
  | { status: 'decoding'; message: string }
  | { status: 'analyzing'; progress: number; message: string }
  | { status: 'complete'; result: SpectralAnalysisResult }
  | { status: 'error'; error: string }
