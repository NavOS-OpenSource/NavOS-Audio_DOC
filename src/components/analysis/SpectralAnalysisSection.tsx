/**
 * Spectral Analysis Section Component
 * 
 * Displays spectrogram, spectral metrics, and provenance assessment.
 * Clearly separates measured facts from interpretation.
 */

import { SpectrogramViewer } from './SpectrogramViewer'
import type { SpectralAnalysisState, ProvenanceIndicator } from '../../types/spectral'

interface SpectralAnalysisSectionProps {
  state: SpectralAnalysisState
  fileName?: string
}

function getVerdictDisplay(verdict: string): { text: string; className: string } {
  switch (verdict) {
    case 'likely_lossless':
      return { text: 'Likely Lossless Source', className: 'verdict-lossless' }
    case 'likely_hires':
      return { text: 'Likely Hi-Res Source', className: 'verdict-hires' }
    case 'likely_lossy_transcoded':
      return { text: 'Possible Transcoded Source', className: 'verdict-transcoded' }
    case 'likely_original_lossy':
      return { text: 'Original Lossy Encoding', className: 'verdict-lossy' }
    case 'likely_upsampled':
      return { text: 'Possible Upsampled Source', className: 'verdict-upsampled' }
    default:
      return { text: 'Insufficient Evidence', className: 'verdict-unknown' }
  }
}

function getIndicatorIcon(indicator: ProvenanceIndicator): string {
  if (indicator.supports === 'lossless') return '✓'
  if (indicator.supports === 'lossy' || indicator.supports === 'transcoded') return '⚠'
  if (indicator.supports === 'upsampled') return '△'
  return '•'
}

function getIndicatorClass(indicator: ProvenanceIndicator): string {
  if (indicator.supports === 'lossless') return 'indicator-positive'
  if (indicator.supports === 'lossy' || indicator.supports === 'transcoded') return 'indicator-concern'
  return 'indicator-neutral'
}

export function SpectralAnalysisSection({ state, fileName }: SpectralAnalysisSectionProps) {
  // Loading states
  if (state.status === 'idle') {
    return null
  }
  
  if (state.status === 'decoding') {
    return (
      <article className="card spectral-analysis-card" style={{ gridColumn: 'span 3' }}>
        <p className="section-kicker">Spectral</p>
        <h2>Spectral Analysis</h2>
        <div className="spectral-loading">
          <div className="loading-spinner" />
          <p>{state.message}</p>
        </div>
      </article>
    )
  }
  
  if (state.status === 'analyzing') {
    return (
      <article className="card spectral-analysis-card" style={{ gridColumn: 'span 3' }}>
        <p className="section-kicker">Spectral</p>
        <h2>Spectral Analysis</h2>
        <div className="spectral-loading">
          <div className="loading-spinner" />
          <p>{state.message}</p>
          <div className="analysis-progress-bar">
            <div 
              className="analysis-progress-fill" 
              style={{ width: `${state.progress}%` }} 
            />
          </div>
          <span className="analysis-progress-text">{state.progress}%</span>
        </div>
      </article>
    )
  }
  
  if (state.status === 'error') {
    return (
      <article className="card spectral-analysis-card" style={{ gridColumn: 'span 3' }}>
        <p className="section-kicker">Spectral</p>
        <h2>Spectral Analysis</h2>
        <div className="spectral-error">
          <p>Analysis failed: {state.error}</p>
          <p className="spectral-error-hint">
            This may happen with certain audio formats. The basic metadata analysis is still available above.
          </p>
        </div>
      </article>
    )
  }
  
  // Complete state
  const { result } = state
  const { spectrogram, metrics, provenance, processing } = result
  const verdictDisplay = getVerdictDisplay(provenance.verdict)
  
  return (
    <article className="card spectral-analysis-card" style={{ gridColumn: 'span 3' }}>
      <p className="section-kicker">Spectral</p>
      <h2>Spectral Analysis</h2>
      
      {/* Spectrogram Viewer */}
      <section className="spectrogram-section">
        <SpectrogramViewer 
          data={spectrogram} 
          metrics={metrics}
          fileName={fileName}
        />
      </section>
      
      {/* Interpretation Summary */}
      <section className="spectral-interpretation">
        <h3>Spectral Interpretation</h3>
        <p className="interpretation-text">{provenance.interpretation}</p>
      </section>
      
      {/* Provenance Assessment */}
      <section className="provenance-section">
        <h3>Audio Provenance Assessment</h3>
        
        <div className="provenance-verdict">
          <span className={`verdict-badge ${verdictDisplay.className}`}>
            {verdictDisplay.text}
          </span>
          <span className="verdict-confidence">
            Confidence: {provenance.confidenceLabel} ({provenance.confidence}%)
          </span>
        </div>
        
        {/* Measured Facts vs Interpretation */}
        <div className="provenance-details">
          <div className="measured-facts">
            <h4>MEASURED</h4>
            <ul>
              {provenance.measuredFacts.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          </div>
          
          <div className="evidence-indicators">
            <h4>EVIDENCE</h4>
            <ul>
              {provenance.indicators.map((indicator, i) => (
                <li 
                  key={i} 
                  className={`indicator-item ${getIndicatorClass(indicator)}`}
                >
                  <span className="indicator-icon">{getIndicatorIcon(indicator)}</span>
                  <span className="indicator-finding">{indicator.finding}</span>
                  <span className={`indicator-significance sig-${indicator.significance}`}>
                    {indicator.significance}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Limitations */}
        <div className="provenance-limitations">
          <h4>LIMITATIONS</h4>
          <ul>
            {provenance.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
        </div>
      </section>
      
      {/* Advanced Technical Details (Expandable) */}
      <details className="spectral-advanced">
        <summary>Advanced Technical Details</summary>
        
        <div className="technical-grid">
          {/* Sample Rate Integrity Section */}
          <section className="tech-section sample-rate-integrity">
            <h4>Sample Rate Integrity</h4>
            <dl>
              {metrics.originalSampleRate && metrics.originalSampleRate !== metrics.sampleRate ? (
                <>
                  <div className="integrity-warning">
                    <dt>Original Sample Rate</dt>
                    <dd>
                      {metrics.originalSampleRate.toLocaleString()} Hz
                      <span className="tech-explanation">
                        From file metadata
                      </span>
                    </dd>
                  </div>
                  <div className="integrity-warning">
                    <dt>Analysis Sample Rate</dt>
                    <dd className="warning-text">
                      {metrics.sampleRate.toLocaleString()} Hz (RESAMPLED)
                      <span className="tech-explanation">
                        Browser resampled audio during decoding
                      </span>
                    </dd>
                  </div>
                  <div className="integrity-warning">
                    <dt>Original Nyquist</dt>
                    <dd>
                      {(metrics.originalSampleRate / 2 / 1000).toFixed(2)} kHz
                      <span className="tech-explanation">
                        Not analyzed due to resampling
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Analysis Nyquist</dt>
                    <dd>
                      {(metrics.nyquistFrequency / 1000).toFixed(2)} kHz
                      <span className="tech-explanation">
                        Maximum frequency in analysis
                      </span>
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Sample Rate</dt>
                    <dd>
                      {metrics.sampleRate.toLocaleString()} Hz
                      <span className="tech-explanation">
                        {metrics.wasResampled ? 'Resampled by browser' : 'Native (no resampling)'}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Nyquist Frequency</dt>
                    <dd>
                      {(metrics.nyquistFrequency / 1000).toFixed(2)} kHz
                      <span className="tech-explanation">
                        Maximum representable frequency
                      </span>
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          {/* Spectrogram Display Settings */}
          <section className="tech-section">
            <h4>Spectrogram Display</h4>
            <dl>
              <div>
                <dt>Dynamic Range</dt>
                <dd>
                  120 dB
                  <span className="tech-explanation">
                    Matches SoX default
                  </span>
                </dd>
              </div>
              <div>
                <dt>Upper Limit</dt>
                <dd>0 dBFS</dd>
              </div>
              <div>
                <dt>Lower Limit</dt>
                <dd>-120 dBFS</dd>
              </div>
              <div>
                <dt>Colormap</dt>
                <dd>
                  SoX Default
                  <span className="tech-explanation">
                    Matches Internet Archive spectrograms
                  </span>
                </dd>
              </div>
            </dl>
          </section>
          
          <section className="tech-section">
            <h4>Signal Measurements</h4>
            <dl>
              <div>
                <dt>Peak Level</dt>
                <dd>{metrics.peakLevel.toFixed(1)} dBFS</dd>
              </div>
              <div>
                <dt>RMS Level</dt>
                <dd>{metrics.rmsLevel.toFixed(1)} dBFS</dd>
              </div>
              <div>
                <dt>Dynamic Range</dt>
                <dd>{metrics.dynamicRange.toFixed(1)} dB</dd>
              </div>
              <div>
                <dt>Crest Factor</dt>
                <dd>{metrics.crestFactor.toFixed(1)} dB</dd>
              </div>
            </dl>
          </section>
          
          <section className="tech-section">
            <h4>Spectral Measurements</h4>
            <dl>
              <div>
                <dt>Spectral Centroid</dt>
                <dd>
                  {(metrics.spectralCentroid / 1000).toFixed(2)} kHz
                  <span className="tech-explanation">
                    Center of mass of the spectrum - indicates brightness
                  </span>
                </dd>
              </div>
              <div>
                <dt>Spectral Rolloff</dt>
                <dd>
                  {(metrics.spectralRolloff / 1000).toFixed(2)} kHz
                  <span className="tech-explanation">
                    Frequency below which 85% of energy resides
                  </span>
                </dd>
              </div>
              <div>
                <dt>High-Freq Energy (&gt;15kHz)</dt>
                <dd>{metrics.highFrequencyEnergy.toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Very High-Freq Energy (&gt;18kHz)</dt>
                <dd>{metrics.veryHighFrequencyEnergy.toFixed(2)}%</dd>
              </div>
              {metrics.detectedCutoffHz !== null && (
                <div>
                  <dt>Detected Cutoff</dt>
                  <dd>
                    ~{(metrics.detectedCutoffHz / 1000).toFixed(1)} kHz
                    ({metrics.cutoffIsSharp ? 'sharp' : 'gradual'})
                  </dd>
                </div>
              )}
            </dl>
          </section>
          
          <section className="tech-section">
            <h4>Audio Properties</h4>
            <dl>
              <div>
                <dt>Duration</dt>
                <dd>{metrics.duration.toFixed(2)} seconds</dd>
              </div>
              <div>
                <dt>Channels</dt>
                <dd>{metrics.channels === 2 ? 'Stereo' : 'Mono'}</dd>
              </div>
              {metrics.channelCorrelation !== undefined && (
                <div>
                  <dt>Channel Correlation</dt>
                  <dd>
                    {(metrics.channelCorrelation * 100).toFixed(1)}%
                    <span className="tech-explanation">
                      How similar left and right channels are
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
          
          <section className="tech-section">
            <h4>Analysis Parameters</h4>
            <dl>
              <div>
                <dt>FFT Size</dt>
                <dd>
                  {metrics.fftSize}
                  <span className="tech-explanation">
                    Samples per frequency analysis window
                  </span>
                </dd>
              </div>
              <div>
                <dt>Hop Size</dt>
                <dd>
                  {metrics.hopSize}
                  <span className="tech-explanation">
                    Samples between consecutive frames
                  </span>
                </dd>
              </div>
              <div>
                <dt>Window Function</dt>
                <dd>
                  {metrics.windowFunction}
                  <span className="tech-explanation">
                    Applied to reduce spectral leakage
                  </span>
                </dd>
              </div>
              <div>
                <dt>Frequency Resolution</dt>
                <dd>
                  {metrics.frequencyResolution.toFixed(1)} Hz
                  <span className="tech-explanation">
                    Minimum distinguishable frequency difference
                  </span>
                </dd>
              </div>
              <div>
                <dt>Time Resolution</dt>
                <dd>
                  {(metrics.timeResolution * 1000).toFixed(1)} ms
                  <span className="tech-explanation">
                    Time between spectrogram frames
                  </span>
                </dd>
              </div>
              <div>
                <dt>Frequency Bins</dt>
                <dd>
                  {metrics.fftSize / 2}
                  <span className="tech-explanation">
                    Number of discrete frequency bands
                  </span>
                </dd>
              </div>
            </dl>
          </section>
        </div>
        
        <section className="tech-section processing-info">
          <h4>Processing Information</h4>
          <dl>
            <div>
              <dt>Analysis Time</dt>
              <dd>{processing.analysisTimeMs} ms</dd>
            </div>
            <div>
              <dt>Frames Processed</dt>
              <dd>{processing.framesProcessed.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Sample Count</dt>
              <dd>{processing.originalSampleCount.toLocaleString()}</dd>
            </div>
            {processing.wasDownsampled && (
              <div>
                <dt>Note</dt>
                <dd>Spectrogram was downsampled for display (analysis used full data)</dd>
              </div>
            )}
          </dl>
        </section>
      </details>
    </article>
  )
}
