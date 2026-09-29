/**
 * Spectral Analysis Web Worker
 * 
 * Performs FFT-based spectral analysis off the main thread.
 * All processing is done locally - no network requests.
 * 
 * CRITICAL: This worker analyzes audio at the ACTUAL decoded sample rate.
 * The sample rate determines the maximum frequency that can be analyzed (Nyquist = sampleRate / 2).
 * For a 176.4 kHz file, we can analyze frequencies up to 88.2 kHz.
 * For a 44.1 kHz file, we can only analyze frequencies up to 22.05 kHz.
 */

import type {
  SpectralWorkerRequest,
  SpectralWorkerMessage,
  SpectralAnalysisResult,
  SpectrogramData,
  SpectralMetrics,
  ProvenanceAssessment,
  ProvenanceIndicator,
  ProvenanceVerdict,
  ConfidenceLevel,
} from '../types/spectral'

// Default FFT parameters
const DEFAULT_FFT_SIZE = 4096
const DEFAULT_HOP_SIZE = 1024
const MAX_FRAMES_DEFAULT = 4000  // Increased limit for longer files

/**
 * Generate Hann window coefficients
 */
function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  }
  return window
}

/**
 * Simple FFT implementation (Cooley-Tukey radix-2)
 * Returns magnitude spectrum
 */
function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length
  
  // Bit reversal
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let tempR = real[i]
      let tempI = imag[i]
      real[i] = real[j]
      imag[i] = imag[j]
      real[j] = tempR
      imag[j] = tempI
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }
  
  // FFT
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1
    const angle = -2 * Math.PI / len
    const wR = Math.cos(angle)
    const wI = Math.sin(angle)
    
    for (let i = 0; i < n; i += len) {
      let curR = 1
      let curI = 0
      
      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k
        const oddIdx = i + k + halfLen
        
        const tR = curR * real[oddIdx] - curI * imag[oddIdx]
        const tI = curR * imag[oddIdx] + curI * real[oddIdx]
        
        real[oddIdx] = real[evenIdx] - tR
        imag[oddIdx] = imag[evenIdx] - tI
        real[evenIdx] = real[evenIdx] + tR
        imag[evenIdx] = imag[evenIdx] + tI
        
        const newCurR = curR * wR - curI * wI
        curI = curR * wI + curI * wR
        curR = newCurR
      }
    }
  }
}

/**
 * Compute magnitude spectrum in dBFS
 */
function computeMagnitudeSpectrum(samples: Float32Array, window: Float32Array, fftSize: number): Float32Array {
  const real = new Float32Array(fftSize)
  const imag = new Float32Array(fftSize)
  
  // Apply window and copy to FFT buffer
  for (let i = 0; i < fftSize && i < samples.length; i++) {
    real[i] = samples[i] * window[i]
    imag[i] = 0
  }
  
  fft(real, imag)
  
  // Compute magnitude spectrum (only positive frequencies)
  const numBins = fftSize / 2
  const magnitude = new Float32Array(numBins)
  
  for (let i = 0; i < numBins; i++) {
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i])
    // Convert to dBFS (0 dBFS = full scale)
    const dB = mag > 0 ? 20 * Math.log10(mag / fftSize) : -120
    magnitude[i] = Math.max(-120, dB)  // Floor at -120 dBFS
  }
  
  return magnitude
}

/**
 * Generate spectrogram for a channel
 * 
 * NOTE: This uses the ANALYSIS sample rate for frequency bin calculation.
 * Frequency bins are calculated as: binIndex * sampleRate / fftSize
 * Nyquist limit is: sampleRate / 2
 */
function generateSpectrogram(
  samples: Float32Array,
  _sampleRate: number,
  fftSize: number,
  hopSize: number,
  maxFrames: number,
  onProgress: (progress: number) => void
): { data: number[][]; minDb: number; maxDb: number } {
  const window = hannWindow(fftSize)
  const totalFrames = Math.floor((samples.length - fftSize) / hopSize) + 1
  
  // Limit frames if file is very long (for display performance, NOT audio quality)
  const frameStep = totalFrames > maxFrames ? Math.ceil(totalFrames / maxFrames) : 1
  const actualFrames = Math.ceil(totalFrames / frameStep)
  
  const spectrogram: number[][] = []
  let minDb = 0
  let maxDb = -120
  
  for (let frame = 0, idx = 0; frame < totalFrames && spectrogram.length < maxFrames; frame += frameStep, idx++) {
    const start = frame * hopSize
    const segment = samples.slice(start, start + fftSize)
    
    if (segment.length < fftSize) {
      // Pad with zeros if needed
      const padded = new Float32Array(fftSize)
      padded.set(segment)
      const magnitude = computeMagnitudeSpectrum(padded, window, fftSize)
      spectrogram.push(Array.from(magnitude))
    } else {
      const magnitude = computeMagnitudeSpectrum(segment, window, fftSize)
      spectrogram.push(Array.from(magnitude))
    }
    
    // Track min/max for color mapping
    const frameMag = spectrogram[spectrogram.length - 1]
    for (let i = 0; i < frameMag.length; i++) {
      if (frameMag[i] > maxDb) maxDb = frameMag[i]
      if (frameMag[i] < minDb && frameMag[i] > -120) minDb = frameMag[i]
    }
    
    // Report progress every 10%
    if (idx % Math.ceil(actualFrames / 10) === 0) {
      onProgress(Math.round((idx / actualFrames) * 100))
    }
  }
  
  return { data: spectrogram, minDb, maxDb }
}

/**
 * Compute spectral metrics
 * 
 * @param sampleRate - The ANALYSIS sample rate (may differ from original if browser resampled)
 * @param originalSampleRate - The ORIGINAL file sample rate from metadata
 * @param wasResampled - Whether the browser resampled the audio
 */
function computeSpectralMetrics(
  leftSamples: Float32Array,
  rightSamples: Float32Array | undefined,
  spectrogram: number[][],
  sampleRate: number,
  fftSize: number,
  hopSize: number,
  originalSampleRate?: number,
  wasResampled?: boolean
): SpectralMetrics {
  const numBins = fftSize / 2
  const nyquist = sampleRate / 2
  const binFrequency = sampleRate / fftSize
  
  // Average spectrum across all frames
  const avgSpectrum = new Float32Array(numBins)
  for (const frame of spectrogram) {
    for (let i = 0; i < numBins; i++) {
      avgSpectrum[i] += frame[i]
    }
  }
  for (let i = 0; i < numBins; i++) {
    avgSpectrum[i] /= spectrogram.length
  }
  
  // Convert dB back to linear for calculations
  const linearSpectrum = new Float32Array(numBins)
  let totalEnergy = 0
  for (let i = 0; i < numBins; i++) {
    linearSpectrum[i] = Math.pow(10, avgSpectrum[i] / 20)
    totalEnergy += linearSpectrum[i] * linearSpectrum[i]
  }
  
  // Spectral centroid
  let centroidSum = 0
  let centroidWeight = 0
  for (let i = 0; i < numBins; i++) {
    const freq = i * binFrequency
    centroidSum += freq * linearSpectrum[i]
    centroidWeight += linearSpectrum[i]
  }
  const spectralCentroid = centroidWeight > 0 ? centroidSum / centroidWeight : 0
  
  // Spectral rolloff (85% of energy)
  let cumulativeEnergy = 0
  const targetEnergy = totalEnergy * 0.85
  let rolloffBin = numBins - 1
  for (let i = 0; i < numBins; i++) {
    cumulativeEnergy += linearSpectrum[i] * linearSpectrum[i]
    if (cumulativeEnergy >= targetEnergy) {
      rolloffBin = i
      break
    }
  }
  const spectralRolloff = rolloffBin * binFrequency
  
  // High frequency energy (above 15kHz and 18kHz)
  const bin15k = Math.floor(15000 / binFrequency)
  const bin18k = Math.floor(18000 / binFrequency)
  let hfEnergy = 0
  let vhfEnergy = 0
  for (let i = bin15k; i < numBins; i++) {
    hfEnergy += linearSpectrum[i] * linearSpectrum[i]
    if (i >= bin18k) {
      vhfEnergy += linearSpectrum[i] * linearSpectrum[i]
    }
  }
  const highFrequencyEnergy = totalEnergy > 0 ? (hfEnergy / totalEnergy) * 100 : 0
  const veryHighFrequencyEnergy = totalEnergy > 0 ? (vhfEnergy / totalEnergy) * 100 : 0
  
  // Detect spectral cutoff
  const { cutoffHz, confidence, isSharp } = detectSpectralCutoff(avgSpectrum, binFrequency, nyquist)
  
  // Peak and RMS levels
  let peak = 0
  let sumSquares = 0
  for (let i = 0; i < leftSamples.length; i++) {
    const absVal = Math.abs(leftSamples[i])
    if (absVal > peak) peak = absVal
    sumSquares += leftSamples[i] * leftSamples[i]
  }
  const rms = Math.sqrt(sumSquares / leftSamples.length)
  const peakLevel = peak > 0 ? 20 * Math.log10(peak) : -96
  const rmsLevel = rms > 0 ? 20 * Math.log10(rms) : -96
  const dynamicRange = peakLevel - rmsLevel
  const crestFactor = dynamicRange
  
  // Channel correlation (if stereo)
  let channelCorrelation: number | undefined
  let channelsMayBeDuplicates: boolean | undefined
  
  if (rightSamples) {
    let sumLR = 0
    let sumL2 = 0
    let sumR2 = 0
    const len = Math.min(leftSamples.length, rightSamples.length)
    
    for (let i = 0; i < len; i++) {
      sumLR += leftSamples[i] * rightSamples[i]
      sumL2 += leftSamples[i] * leftSamples[i]
      sumR2 += rightSamples[i] * rightSamples[i]
    }
    
    const denom = Math.sqrt(sumL2 * sumR2)
    channelCorrelation = denom > 0 ? sumLR / denom : 0
    channelsMayBeDuplicates = channelCorrelation > 0.9999
  }
  
  return {
    // Sample rate integrity information
    sampleRate,
    originalSampleRate,
    wasResampled: wasResampled ?? false,
    
    nyquistFrequency: nyquist,
    duration: leftSamples.length / sampleRate,
    channels: rightSamples ? 2 : 1,
    
    detectedCutoffHz: cutoffHz,
    cutoffConfidence: confidence,
    cutoffIsSharp: isSharp,
    
    spectralCentroid,
    spectralRolloff,
    highFrequencyEnergy,
    veryHighFrequencyEnergy,
    
    peakLevel,
    rmsLevel,
    dynamicRange,
    crestFactor,
    
    channelCorrelation,
    channelsMayBeDuplicates,
    
    fftSize,
    hopSize,
    windowFunction: 'Hann',
    frequencyResolution: binFrequency,
    timeResolution: hopSize / sampleRate,
  }
}

/**
 * Detect spectral cutoff frequency
 */
function detectSpectralCutoff(
  avgSpectrum: Float32Array,
  binFrequency: number,
  nyquist: number
): { cutoffHz: number | null; confidence: number; isSharp: boolean } {
  const numBins = avgSpectrum.length
  
  // Find average level in mid frequencies (1-4 kHz) as reference
  const bin1k = Math.floor(1000 / binFrequency)
  const bin4k = Math.floor(4000 / binFrequency)
  let midAvg = 0
  for (let i = bin1k; i < bin4k && i < numBins; i++) {
    midAvg += avgSpectrum[i]
  }
  midAvg /= (bin4k - bin1k)
  
  // Look for sharp drops from high frequencies down
  let cutoffBin: number | null = null
  let isSharp = false
  
  // Start from near Nyquist and work down
  for (let i = numBins - 10; i > bin4k; i--) {
    const currentLevel = avgSpectrum[i]
    const levelBelow = avgSpectrum[Math.max(0, i - 5)]  // 5 bins lower
    
    // Check if there's significant energy at this frequency relative to mid-range
    if (currentLevel > midAvg - 30) {
      // Found significant energy - no cutoff above this
      cutoffBin = null
      break
    }
    
    // Check for sharp transition
    if (levelBelow > currentLevel + 15) {
      cutoffBin = i
      // Check sharpness - is the drop very sudden?
      for (let j = i; j < Math.min(i + 10, numBins); j++) {
        if (avgSpectrum[j] < avgSpectrum[i] - 20) break
      }
      isSharp = true
      break
    }
  }
  
  if (cutoffBin === null) {
    // Try another approach - find where energy drops significantly below mid-range
    for (let i = numBins - 1; i > bin4k; i--) {
      if (avgSpectrum[i] > midAvg - 20) {
        // Found substantial energy
        break
      }
      if (i < numBins - 20 && avgSpectrum[i] < midAvg - 40) {
        cutoffBin = i + 10  // Approximate cutoff
        isSharp = avgSpectrum[cutoffBin] - avgSpectrum[cutoffBin + 5] > 10
        break
      }
    }
  }
  
  const cutoffHz = cutoffBin !== null ? cutoffBin * binFrequency : null
  
  // Confidence based on how clear the cutoff is
  let confidence = 0
  if (cutoffHz !== null && cutoffHz < nyquist * 0.95) {
    confidence = isSharp ? 85 : 60
    // Higher confidence if cutoff is at a known lossy frequency
    const knownLossyFreqs = [16000, 15000, 11025, 22050]
    for (const freq of knownLossyFreqs) {
      if (Math.abs(cutoffHz - freq) < 500) {
        confidence = Math.min(95, confidence + 15)
        break
      }
    }
  }
  
  return { cutoffHz, confidence, isSharp }
}

/**
 * Assess audio provenance based on spectral analysis and metadata
 */
function assessProvenance(
  metrics: SpectralMetrics,
  isLosslessContainer: boolean
): ProvenanceAssessment {
  const indicators: ProvenanceIndicator[] = []
  const measuredFacts: string[] = []
  const limitations: string[] = [
    'Spectral analysis cannot definitively prove original source provenance.',
    'Results should be considered alongside other evidence.',
  ]
  
  // Document sample rate integrity
  if (metrics.wasResampled && metrics.originalSampleRate) {
    measuredFacts.push(`Original sample rate: ${metrics.originalSampleRate.toLocaleString()} Hz`)
    measuredFacts.push(`Analysis sample rate: ${metrics.sampleRate.toLocaleString()} Hz (RESAMPLED)`)
    measuredFacts.push(`Analysis Nyquist: ${(metrics.nyquistFrequency / 1000).toFixed(1)} kHz`)
    measuredFacts.push(`Original Nyquist: ${(metrics.originalSampleRate / 2 / 1000).toFixed(1)} kHz (not analyzed)`)
    
    // Add resampling warning as an indicator
    indicators.push({
      type: 'resampling',
      finding: `Audio was resampled from ${(metrics.originalSampleRate / 1000).toFixed(1)} kHz to ${(metrics.sampleRate / 1000).toFixed(1)} kHz during decoding. Frequencies above ${(metrics.nyquistFrequency / 1000).toFixed(1)} kHz could not be analyzed.`,
      significance: 'moderate',
      supports: 'neutral'
    })
    
    limitations.push(`Browser resampled audio from ${(metrics.originalSampleRate / 1000).toFixed(1)} kHz to ${(metrics.sampleRate / 1000).toFixed(1)} kHz. High-frequency analysis may be limited.`)
  } else {
    measuredFacts.push(`Sample rate: ${metrics.sampleRate.toLocaleString()} Hz`)
    measuredFacts.push(`Nyquist frequency: ${(metrics.nyquistFrequency / 1000).toFixed(1)} kHz`)
  }
  
  // Document other measured facts
  measuredFacts.push(`Peak level: ${metrics.peakLevel.toFixed(1)} dBFS`)
  measuredFacts.push(`RMS level: ${metrics.rmsLevel.toFixed(1)} dBFS`)
  measuredFacts.push(`Spectral centroid: ${(metrics.spectralCentroid / 1000).toFixed(2)} kHz`)
  measuredFacts.push(`High-frequency energy (>15 kHz): ${metrics.highFrequencyEnergy.toFixed(2)}%`)
  
  if (metrics.detectedCutoffHz !== null) {
    measuredFacts.push(`Detected spectral cutoff: ~${(metrics.detectedCutoffHz / 1000).toFixed(1)} kHz`)
    measuredFacts.push(`Cutoff appears ${metrics.cutoffIsSharp ? 'sharp' : 'gradual'}`)
  } else {
    measuredFacts.push('No distinct spectral cutoff detected')
  }
  
  if (metrics.channels === 2 && metrics.channelCorrelation !== undefined) {
    measuredFacts.push(`Channel correlation: ${(metrics.channelCorrelation * 100).toFixed(1)}%`)
  }
  
  // Analyze cutoff
  if (metrics.detectedCutoffHz !== null) {
    const cutoffRatio = metrics.detectedCutoffHz / metrics.nyquistFrequency
    
    if (cutoffRatio < 0.5 && metrics.cutoffConfidence > 70) {
      indicators.push({
        type: 'cutoff',
        finding: `Sharp spectral cutoff at ~${(metrics.detectedCutoffHz / 1000).toFixed(1)} kHz (${(cutoffRatio * 100).toFixed(0)}% of Nyquist)`,
        significance: 'strong',
        supports: isLosslessContainer ? 'transcoded' : 'lossy'
      })
    } else if (cutoffRatio < 0.75 && metrics.cutoffIsSharp) {
      indicators.push({
        type: 'cutoff',
        finding: `Spectral cutoff detected at ~${(metrics.detectedCutoffHz / 1000).toFixed(1)} kHz`,
        significance: 'moderate',
        supports: 'lossy'
      })
    }
  } else if (metrics.highFrequencyEnergy > 1) {
    indicators.push({
      type: 'spectral_shape',
      finding: 'Substantial high-frequency content present',
      significance: 'moderate',
      supports: 'lossless'
    })
  }
  
  // Check for hi-res indicators
  if (metrics.sampleRate >= 88200 && metrics.veryHighFrequencyEnergy > 0.5) {
    indicators.push({
      type: 'nyquist',
      finding: `High-resolution sample rate (${metrics.sampleRate} Hz) with energy above 20 kHz`,
      significance: 'moderate',
      supports: 'lossless'
    })
  } else if (metrics.sampleRate >= 88200 && metrics.veryHighFrequencyEnergy < 0.1) {
    indicators.push({
      type: 'nyquist',
      finding: `High sample rate (${metrics.sampleRate} Hz) but minimal energy above 20 kHz`,
      significance: 'moderate',
      supports: 'upsampled'
    })
  }
  
  // Check channel issues
  if (metrics.channelsMayBeDuplicates) {
    indicators.push({
      type: 'channel',
      finding: 'Left and right channels appear nearly identical',
      significance: 'weak',
      supports: 'neutral'
    })
  }
  
  // Determine verdict
  let verdict: ProvenanceVerdict = 'insufficient_evidence'
  let confidence = 30
  let interpretation = ''
  
  const lossyIndicators = indicators.filter(i => i.supports === 'lossy' || i.supports === 'transcoded')
  const losslessIndicators = indicators.filter(i => i.supports === 'lossless')
  const upsampledIndicators = indicators.filter(i => i.supports === 'upsampled')
  
  if (isLosslessContainer && lossyIndicators.some(i => i.significance === 'strong')) {
    verdict = 'likely_lossy_transcoded'
    confidence = 75
    interpretation = 'The file is in a lossless container, but spectral characteristics show patterns consistent with a lossy source that was later converted. This is sometimes called a "fake FLAC" or transcoded file.'
  } else if (upsampledIndicators.length > 0 && metrics.sampleRate >= 88200) {
    verdict = 'likely_upsampled'
    confidence = 65
    interpretation = 'The file has a high-resolution sample rate, but spectral analysis shows limited energy at frequencies that the sample rate would support. This suggests the file may have been upsampled from a lower resolution source.'
  } else if (lossyIndicators.some(i => i.significance === 'strong') && !isLosslessContainer) {
    verdict = 'likely_original_lossy'
    confidence = 70
    interpretation = 'Spectral characteristics are consistent with a lossy-encoded source, which matches the file\'s container format.'
  } else if (losslessIndicators.length >= 2 || (losslessIndicators.some(i => i.significance === 'moderate') && lossyIndicators.length === 0)) {
    if (metrics.sampleRate >= 88200 && metrics.veryHighFrequencyEnergy > 0.5) {
      verdict = 'likely_hires'
      confidence = 70
    } else {
      verdict = 'likely_lossless'
      confidence = 65
    }
    interpretation = 'Spectral characteristics are consistent with a lossless or high-quality source. The frequency content extends naturally to the Nyquist limit without artificial cutoffs.'
  } else {
    verdict = 'insufficient_evidence'
    confidence = 40
    interpretation = 'Spectral analysis alone cannot determine the provenance of this file with confidence. The characteristics observed do not strongly indicate either a lossless or lossy source.'
  }
  
  // Confidence label
  let confidenceLabel: ConfidenceLevel = 'low'
  if (confidence >= 80) confidenceLabel = 'very_high'
  else if (confidence >= 65) confidenceLabel = 'high'
  else if (confidence >= 50) confidenceLabel = 'medium'
  
  return {
    verdict,
    confidence,
    confidenceLabel,
    measuredFacts,
    interpretation,
    limitations,
    indicators
  }
}

/**
 * Main analysis function
 */
function analyze(request: SpectralWorkerRequest): SpectralAnalysisResult {
  const startTime = performance.now()
  const { audioData, options } = request
  const { left, right, sampleRate, originalSampleRate, wasResampled } = audioData
  
  const fftSize = options?.fftSize ?? DEFAULT_FFT_SIZE
  const hopSize = options?.hopSize ?? DEFAULT_HOP_SIZE
  const maxFrames = options?.maxFrames ?? MAX_FRAMES_DEFAULT
  
  // Log analysis parameters
  console.log('[SpectralWorker] Starting analysis:')
  console.log(`  Analysis sample rate: ${sampleRate.toLocaleString()} Hz`)
  console.log(`  Original sample rate: ${originalSampleRate ? originalSampleRate.toLocaleString() + ' Hz' : 'unknown'}`)
  console.log(`  Was resampled: ${wasResampled ? 'YES' : 'NO'}`)
  console.log(`  Nyquist (analysis): ${(sampleRate / 2 / 1000).toFixed(2)} kHz`)
  console.log(`  FFT size: ${fftSize}`)
  console.log(`  Frequency resolution: ${(sampleRate / fftSize).toFixed(2)} Hz/bin`)
  console.log(`  Total frequency bins: ${fftSize / 2}`)
  
  // Generate spectrogram for left channel
  postProgress('fft', 0, 'Analyzing left channel...')
  const leftSpec = generateSpectrogram(left, sampleRate, fftSize, hopSize, maxFrames, (p) => {
    postProgress('fft', p * (right ? 0.5 : 1), `Analyzing spectrum... ${Math.round(p * (right ? 0.5 : 1))}%`)
  })
  
  // Generate spectrogram for right channel if stereo
  let rightSpec: { data: number[][]; minDb: number; maxDb: number } | undefined
  if (right) {
    postProgress('fft', 50, 'Analyzing right channel...')
    rightSpec = generateSpectrogram(right, sampleRate, fftSize, hopSize, maxFrames, (p) => {
      postProgress('fft', 50 + p * 0.5, `Analyzing spectrum... ${Math.round(50 + p * 0.5)}%`)
    })
  }
  
  const decodeEndTime = performance.now()
  
  // Compute frequency bins and time frames
  // CRITICAL: Frequency bins are calculated using the ANALYSIS sample rate
  // frequencyBin[i] = i * sampleRate / fftSize
  const numBins = fftSize / 2
  const frequencyBins = Array.from({ length: numBins }, (_, i) => (i * sampleRate) / fftSize)
  
  // Log frequency range
  console.log(`[SpectralWorker] Frequency bins:`)
  console.log(`  Bin 0: ${frequencyBins[0].toFixed(2)} Hz (DC)`)
  console.log(`  Bin ${numBins - 1}: ${frequencyBins[numBins - 1].toFixed(2)} Hz (near Nyquist)`)
  console.log(`  Max frequency representable: ${(sampleRate / 2).toFixed(2)} Hz`)
  
  // Calculate actual duration from audio data
  const actualDuration = audioData.duration || left.length / sampleRate
  const numFrames = leftSpec.data.length
  
  // Time frames should map to the ACTUAL duration, not just the analyzed portion
  // This ensures the X-axis shows the full track length even if frames were downsampled
  const timeFrames = Array.from({ length: numFrames }, (_, i) => (i / (numFrames - 1)) * actualDuration)
  
  // Combine min/max dB
  const minDb = Math.min(leftSpec.minDb, rightSpec?.minDb ?? leftSpec.minDb)
  const maxDb = Math.max(leftSpec.maxDb, rightSpec?.maxDb ?? leftSpec.maxDb)
  
  // Build spectrogram data
  const spectrogram: SpectrogramData = {
    left: leftSpec.data,
    right: rightSpec?.data,
    frequencyBins,
    timeFrames,
    dBRange: { min: Math.max(minDb, -100), max: Math.min(maxDb, 0) },
    channels: right ? 2 : 1
  }
  
  // Compute metrics with sample rate integrity information
  postProgress('metrics', 90, 'Computing spectral metrics...')
  const metrics = computeSpectralMetrics(
    left, 
    right, 
    leftSpec.data, 
    sampleRate, 
    fftSize, 
    hopSize,
    originalSampleRate,
    wasResampled
  )
  
  const analysisEndTime = performance.now()
  
  // Assess provenance
  postProgress('provenance', 95, 'Evaluating provenance indicators...')
  // Determine if container is lossless based on sample rate and other factors
  // This is a simplification - in real use, we'd get this from metadata
  const isLosslessContainer = sampleRate >= 44100  // Will be overridden by actual metadata in App
  const provenance = assessProvenance(metrics, isLosslessContainer)
  
  const endTime = performance.now()
  
  const processing = {
    totalTimeMs: Math.round(endTime - startTime),
    decodeTimeMs: 0,  // Decode happens before worker receives data
    analysisTimeMs: Math.round(analysisEndTime - decodeEndTime),
    framesProcessed: leftSpec.data.length,
    wasDownsampled: leftSpec.data.length < Math.floor((left.length - fftSize) / hopSize) + 1,
    originalSampleCount: left.length
  }
  
  console.log('[SpectralWorker] Analysis complete:')
  console.log(`  Processing time: ${processing.totalTimeMs} ms`)
  console.log(`  Frames processed: ${processing.framesProcessed}`)
  
  return {
    spectrogram,
    metrics,
    provenance,
    processing
  }
}

function postProgress(stage: 'fft' | 'metrics' | 'provenance', progress: number, message: string) {
  self.postMessage({
    type: 'progress',
    stage,
    progress,
    message
  } as SpectralWorkerMessage)
}

// Worker message handler
self.onmessage = (event: MessageEvent<SpectralWorkerRequest>) => {
  try {
    const result = analyze(event.data)
    self.postMessage({
      type: 'result',
      result
    } as SpectralWorkerMessage)
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown analysis error'
    } as SpectralWorkerMessage)
  }
}
