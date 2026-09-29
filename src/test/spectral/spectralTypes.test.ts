/**
 * Spectral Analysis Types Tests
 */

import { describe, it, expect } from 'vitest'
import type {
  SpectrogramData,
  SpectralMetrics,
  ProvenanceAssessment,
  SpectralAnalysisState,
} from '../../types/spectral'

describe('Spectral Types', () => {
  it('should define SpectrogramData structure', () => {
    const data: SpectrogramData = {
      left: [[0, -20, -40]],
      right: [[0, -20, -40]],
      frequencyBins: [0, 100, 200],
      timeFrames: [0, 0.5, 1],
      dBRange: { min: -100, max: 0 },
      channels: 2
    }
    
    expect(data.left.length).toBe(1)
    expect(data.channels).toBe(2)
    expect(data.dBRange.min).toBeLessThan(data.dBRange.max)
  })
  
  it('should define SpectralMetrics structure', () => {
    const metrics: SpectralMetrics = {
      sampleRate: 44100,
      originalSampleRate: 44100,
      wasResampled: false,
      nyquistFrequency: 22050,
      duration: 180,
      channels: 2,
      detectedCutoffHz: 16000,
      cutoffConfidence: 85,
      cutoffIsSharp: true,
      spectralCentroid: 2500,
      spectralRolloff: 8000,
      highFrequencyEnergy: 5.5,
      veryHighFrequencyEnergy: 0.1,
      peakLevel: -0.5,
      rmsLevel: -18,
      dynamicRange: 17.5,
      crestFactor: 17.5,
      channelCorrelation: 0.95,
      channelsMayBeDuplicates: false,
      fftSize: 4096,
      hopSize: 1024,
      windowFunction: 'Hann',
      frequencyResolution: 10.77,
      timeResolution: 0.023
    }
    
    expect(metrics.nyquistFrequency).toBe(metrics.sampleRate / 2)
    expect(metrics.detectedCutoffHz).toBeLessThan(metrics.nyquistFrequency)
    expect(metrics.wasResampled).toBe(false)
  })
  
  it('should define ProvenanceAssessment structure', () => {
    const assessment: ProvenanceAssessment = {
      verdict: 'likely_lossless',
      confidence: 75,
      confidenceLabel: 'high',
      measuredFacts: ['Sample rate: 44100 Hz', 'No cutoff detected'],
      interpretation: 'Evidence consistent with lossless source',
      limitations: ['Cannot prove original source'],
      indicators: [{
        type: 'spectral_shape',
        finding: 'Full spectrum present',
        significance: 'moderate',
        supports: 'lossless'
      }]
    }
    
    expect(assessment.verdict).toBe('likely_lossless')
    expect(assessment.indicators.length).toBeGreaterThan(0)
  })
  
  it('should define SpectralAnalysisState variants', () => {
    const idle: SpectralAnalysisState = { status: 'idle' }
    const decoding: SpectralAnalysisState = { status: 'decoding', message: 'Reading...' }
    const analyzing: SpectralAnalysisState = { status: 'analyzing', progress: 50, message: 'Processing...' }
    const error: SpectralAnalysisState = { status: 'error', error: 'Failed' }
    
    expect(idle.status).toBe('idle')
    expect(decoding.status).toBe('decoding')
    expect(analyzing.status).toBe('analyzing')
    expect(error.status).toBe('error')
  })
})
