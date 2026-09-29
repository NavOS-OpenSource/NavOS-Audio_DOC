/**
 * Spectrogram Viewer Component
 * 
 * Renders a canvas-based spectrogram matching Internet Archive / SoX style:
 * - Dark blue → red → orange → yellow → white colormap (exact SoX formula)
 * - 120 dB dynamic range (0 to -120 dBFS) matching SoX default
 * - Stacked L/R channels for stereo
 * - Frequency axis on both left and right sides
 * - Time axis on both top and bottom
 * - Pure black background
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import type { SpectrogramData, SpectralMetrics } from '../../types/spectral'

interface SpectrogramViewerProps {
  data: SpectrogramData
  metrics: SpectralMetrics
  fileName?: string
}

/**
 * SoX default dynamic range settings
 * These MUST match the SoX spectrogram defaults for accurate comparison
 */
const SOX_DB_MIN = -120  // Lower limit (silence/background)
const SOX_DB_MAX = 0     // Upper limit (full scale)
const SOX_DYNAMIC_RANGE = SOX_DB_MAX - SOX_DB_MIN  // 120 dB

/**
 * SoX default colormap - matches Internet Archive exactly
 * Progression: Dark blue → blue → purple → magenta → red → orange → yellow → white
 * 
 * This is the exact formula from SoX spectrogram.c:
 * - Red:   rises from x=0.13 to x=0.73 using sin curve, then saturates at 1
 * - Green: rises from x=0.60 to x=0.91 using sin curve, then saturates at 1  
 * - Blue:  half-sin peak at x=0.30, drops to 0 at x=0.60, rises linearly from x=0.78
 * 
 * @param value - Normalized value 0 (min dB / silence) to 1 (max dB / loud)
 * @returns RGB tuple [r, g, b] each 0-255
 */
function soxColormap(value: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, value))
  
  let r: number, g: number, b: number
  
  // Red channel: rises from 0.13, saturates at 0.73
  if (x < 0.13) r = 0
  else if (x < 0.73) r = Math.sin((x - 0.13) / 0.60 * Math.PI / 2)
  else r = 1
  
  // Green channel: rises from 0.60, saturates at 0.91
  if (x < 0.60) g = 0
  else if (x < 0.91) g = Math.sin((x - 0.60) / 0.31 * Math.PI / 2)
  else g = 1
  
  // Blue channel: peaks at 0.30, drops to 0 at 0.60, rises again after 0.78
  if (x < 0.60) b = 0.5 * Math.sin(x / 0.60 * Math.PI)
  else if (x < 0.78) b = 0
  else b = (x - 0.78) / 0.22
  
  return [
    Math.round(r * 255),
    Math.round(g * 255),
    Math.round(b * 255)
  ]
}

/**
 * Convert dBFS value to normalized 0-1 range for colormap
 * Uses FIXED SoX range of -120 to 0 dBFS (120 dB dynamic range)
 * 
 * Values below -120 dBFS are clipped to 0 (darkest color)
 * Values above 0 dBFS are clipped to 1 (brightest color)
 * 
 * @param dB - Value in dBFS
 * @returns Normalized value 0-1 where 0 = -120 dBFS, 1 = 0 dBFS
 */
function dBToNormalized(dB: number): number {
  // Clip to SoX range: -120 to 0 dBFS
  const clipped = Math.max(SOX_DB_MIN, Math.min(SOX_DB_MAX, dB))
  // Normalize: -120 → 0, 0 → 1
  return (clipped - SOX_DB_MIN) / SOX_DYNAMIC_RANGE
}

export function SpectrogramViewer({ data, metrics, fileName }: SpectrogramViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 950, height: 500 })
  
  // Margins matching Internet Archive layout
  const MARGIN = { left: 50, right: 75, top: 25, bottom: 45 }
  const CHANNEL_GAP = 2 // Thin line between L and R channels
  
  const isStereo = data.channels === 2 && data.right && data.right.length > 0
  
  // Calculate canvas size based on stereo/mono
  useEffect(() => {
    if (isStereo) {
      setCanvasSize({ width: 970, height: 540 })
    } else {
      setCanvasSize({ width: 970, height: 370 })
    }
  }, [isStereo])
  
  const drawSpectrogram = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const { frequencyBins } = data
    
    const plotWidth = canvasSize.width - MARGIN.left - MARGIN.right
    const totalPlotHeight = canvasSize.height - MARGIN.top - MARGIN.bottom
    
    // For stereo: split height between two channels
    const singleChannelHeight = isStereo 
      ? Math.floor((totalPlotHeight - CHANNEL_GAP) / 2)
      : totalPlotHeight
    
    // Fill entire canvas with BLACK background (like Internet Archive)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)
    
    const numBins = frequencyBins.length
    const nyquist = metrics.nyquistFrequency
    
    // Helper to draw one channel
    // Uses FIXED SoX dB range: -120 to 0 dBFS
    const drawChannel = (channelData: number[][], yOffset: number) => {
      const imageData = ctx.createImageData(plotWidth, singleChannelHeight)
      const pixels = imageData.data
      const numFrames = channelData.length
      
      for (let y = 0; y < singleChannelHeight; y++) {
        // Map y to frequency bin (flip so high frequencies are at top)
        const binIdx = Math.floor((1 - y / singleChannelHeight) * numBins)
        
        for (let x = 0; x < plotWidth; x++) {
          const frameIdx = Math.floor((x / plotWidth) * numFrames)
          const pixelIdx = (y * plotWidth + x) * 4
          
          if (frameIdx >= 0 && frameIdx < numFrames && binIdx >= 0 && binIdx < numBins) {
            const dB = channelData[frameIdx][binIdx]
            // Use FIXED SoX range for normalization
            const normalized = dBToNormalized(dB)
            const [r, g, b] = soxColormap(normalized)
            
            pixels[pixelIdx] = r
            pixels[pixelIdx + 1] = g
            pixels[pixelIdx + 2] = b
            pixels[pixelIdx + 3] = 255
          } else {
            // Silence = darkest SoX color (normalized = 0)
            const [r, g, b] = soxColormap(0)
            pixels[pixelIdx] = r
            pixels[pixelIdx + 1] = g
            pixels[pixelIdx + 2] = b
            pixels[pixelIdx + 3] = 255
          }
        }
      }
      
      ctx.putImageData(imageData, MARGIN.left, yOffset)
    }
    
    // Draw channels
    if (isStereo && data.right) {
      // Top: Left channel
      drawChannel(data.left, MARGIN.top)
      // Bottom: Right channel  
      drawChannel(data.right, MARGIN.top + singleChannelHeight + CHANNEL_GAP)
    } else {
      // Mono
      drawChannel(data.left, MARGIN.top)
    }
    
    // Calculate appropriate time step based on duration
    const duration = metrics.duration
    
    let timeStep: number
    if (duration > 600) timeStep = 60
    else if (duration > 300) timeStep = 40
    else if (duration > 120) timeStep = 20
    else if (duration > 60) timeStep = 10
    else if (duration > 30) timeStep = 5
    else timeStep = 2
    
    // Style for axis labels  
    ctx.fillStyle = '#cccccc'
    ctx.font = '10px sans-serif'
    
    // TIME AXIS - TOP (like Internet Archive)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (let t = 0; t <= duration; t += timeStep) {
      const x = MARGIN.left + (t / duration) * plotWidth
      if (x >= MARGIN.left && x <= MARGIN.left + plotWidth) {
        ctx.fillText(`${Math.round(t)}`, x, MARGIN.top - 5)
      }
    }
    
    // TIME AXIS - BOTTOM
    ctx.textBaseline = 'top'
    for (let t = 0; t <= duration; t += timeStep) {
      const x = MARGIN.left + (t / duration) * plotWidth
      if (x >= MARGIN.left && x <= MARGIN.left + plotWidth) {
        ctx.fillText(`${Math.round(t)}`, x, MARGIN.top + totalPlotHeight + 5)
      }
    }
    
    // Time axis label at bottom center
    ctx.fillStyle = '#ffffff'
    ctx.font = '11px sans-serif'
    ctx.fillText('Time (s)', MARGIN.left + plotWidth / 2, MARGIN.top + totalPlotHeight + 28)
    
    // FREQUENCY AXIS - Both left and right sides
    // Calculate appropriate frequency steps based on actual Nyquist
    let freqSteps: number[]
    const nyquistKHz = nyquist / 1000
    
    if (nyquistKHz > 80) {
      // Hi-res 176.4/192 kHz (Nyquist ~88-96 kHz)
      freqSteps = [0, 10, 20, 30, 40, 50, 60, 70, 80]
    } else if (nyquistKHz > 40) {
      // Hi-res 88.2/96 kHz (Nyquist ~44-48 kHz)
      freqSteps = [0, 10, 20, 30, 40]
    } else if (nyquistKHz > 20) {
      // Standard 44.1/48 kHz (Nyquist ~22-24 kHz)
      freqSteps = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]
    } else {
      // Lower sample rates
      freqSteps = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    }
    freqSteps = freqSteps.filter(f => f <= nyquistKHz)
    
    // Add "Frequency (kHz)" label on the LEFT side, rotated vertically
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.font = '11px sans-serif'
    ctx.translate(12, MARGIN.top + totalPlotHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Frequency (kHz)', 0, 0)
    ctx.restore()
    
    // Draw frequency labels for each channel region
    const drawFreqAxis = (yOffset: number, channelHeight: number) => {
      ctx.fillStyle = '#cccccc'
      ctx.font = '10px sans-serif'
      
      for (const freqKHz of freqSteps) {
        // Calculate Y position based on frequency relative to Nyquist
        const y = yOffset + channelHeight * (1 - freqKHz / nyquistKHz)
        
        if (y >= yOffset - 5 && y <= yOffset + channelHeight + 5) {
          // Left side labels
          ctx.textAlign = 'right'
          ctx.textBaseline = 'middle'
          if (freqKHz === 0) {
            ctx.fillText('DC', MARGIN.left - 4, y)
          } else {
            ctx.fillText(`${freqKHz}`, MARGIN.left - 4, y)
          }
          
          // Right side labels (at right edge of spectrogram, before colorbar)
          ctx.textAlign = 'left'
          if (freqKHz === 0) {
            ctx.fillText('DC', MARGIN.left + plotWidth + 4, y)
          } else {
            ctx.fillText(`${freqKHz}`, MARGIN.left + plotWidth + 4, y)
          }
        }
      }
    }
    
    if (isStereo) {
      drawFreqAxis(MARGIN.top, singleChannelHeight)
      drawFreqAxis(MARGIN.top + singleChannelHeight + CHANNEL_GAP, singleChannelHeight)
    } else {
      drawFreqAxis(MARGIN.top, singleChannelHeight)
    }
    
    // COLOR SCALE (dBFS) - Right side, after frequency labels
    // Uses FIXED SoX range: 0 to -120 dBFS
    const scaleWidth = 10
    const scaleHeight = totalPlotHeight
    const scaleX = canvasSize.width - 35
    
    // Draw color gradient using SoX colormap
    for (let y = 0; y < scaleHeight; y++) {
      const normalized = 1 - y / scaleHeight  // 1 at top (0 dBFS), 0 at bottom (-120 dBFS)
      const [r, g, b] = soxColormap(normalized)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(scaleX, MARGIN.top + y, scaleWidth, 1)
    }
    
    // Color scale border
    ctx.strokeStyle = '#555555'
    ctx.lineWidth = 1
    ctx.strokeRect(scaleX, MARGIN.top, scaleWidth, scaleHeight)
    
    // dB scale labels - FIXED SoX range: 0 to -120 dBFS
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#cccccc'
    ctx.font = '9px sans-serif'
    
    // Show labels at standard intervals matching SoX
    const dBLabels = [0, -20, -40, -60, -80, -100, -120]
    
    for (const dB of dBLabels) {
      // Normalize using SoX range
      const normalized = (dB - SOX_DB_MIN) / SOX_DYNAMIC_RANGE
      const y = MARGIN.top + scaleHeight * (1 - normalized)
      ctx.fillText(`${dB}`, scaleX + scaleWidth + 3, y)
    }
    
    // dBFS label at bottom of colorbar
    ctx.fillStyle = '#ffffff'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('dBFS', scaleX + scaleWidth / 2, MARGIN.top + scaleHeight + 15)
    
  }, [data, metrics, canvasSize, isStereo, CHANNEL_GAP])
  
  // Redraw on data or size change
  useEffect(() => {
    drawSpectrogram()
  }, [drawSpectrogram])
  
  // Handle PNG export
  const handleDownloadPng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // Create export canvas with branding footer
    const exportCanvas = document.createElement('canvas')
    const brandingHeight = 25
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height + brandingHeight
    
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return
    
    // Black background
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    
    // Copy spectrogram
    ctx.drawImage(canvas, 0, 0)
    
    // File info bar at bottom
    const brandingY = canvas.height
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, brandingY, exportCanvas.width, brandingHeight)
    
    // File info on left
    if (fileName) {
      ctx.fillStyle = '#888888'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(fileName, 10, brandingY + brandingHeight / 2)
    }
    
    // NavOS branding on right
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('NavOS · Audio DOC', exportCanvas.width - 10, brandingY + brandingHeight / 2)
    
    // Download
    const link = document.createElement('a')
    link.download = `${fileName?.replace(/\.[^.]+$/, '') || 'audio'}_spectrogram.png`
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
  }, [fileName])
  
  return (
    <div className="spectrogram-viewer">
      <div className="spectrogram-controls">
        <button type="button" className="download-png-btn" onClick={handleDownloadPng}>
          Download PNG
        </button>
      </div>
      
      <div className="spectrogram-canvas-container">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="spectrogram-canvas"
        />
      </div>
      
      <div className="spectrogram-info">
        <span>FFT: {metrics.fftSize}</span>
        <span>Window: {metrics.windowFunction}</span>
        <span>Freq Resolution: {metrics.frequencyResolution.toFixed(1)} Hz</span>
        <span>Time Resolution: {(metrics.timeResolution * 1000).toFixed(1)} ms</span>
        <span>Dynamic Range: {SOX_DYNAMIC_RANGE} dB</span>
      </div>
    </div>
  )
}
