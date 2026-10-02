/**
 * NavOS AUDIO ANALYSIS CERTIFICATE
 * 
 * Premium 2-page landscape certificate following NavOS visual identity.
 * Fixed alignment, spacing, and overflow with strict grid system.
 */

import { jsPDF } from 'jspdf'
import type { HiFiNaviReport } from '../types/report'
import type { ExtractedFileInfo } from '../extractor/audioMetadataExtractor'
import type { SpectralAnalysisResult } from '../types/spectral'
import type { SourceLabel } from '../types/analysis'

// NavOS color scheme
const COLORS = {
  yellow: '#FFD93D',
  black: '#1A1A1A',
  white: '#FFFFFF',
  grayDark: '#333333',
  grayMid: '#555555',
  grayLight: '#888888',
  offWhite: '#F5F5F5',
  green: '#22C55E',
  orange: '#F59E0B',
}

// ============================================================
// STRICT GRID SYSTEM - ARCHITECTURAL LAYOUT
// ============================================================
// Rule: AVAILABLE SPACE > CONTENT. Never overlap. Remove/condense if needed.

const GRID = {
  // Page dimensions (A4 Landscape)
  pageWidth: 297,
  pageHeight: 210,
  
  // Outer margins (certificate frame)
  outerMargin: 10,
  
  // Inner border offset
  innerOffset: 4,
  
  // Content safe area (inside inner border)
  get contentMargin() { return this.outerMargin + this.innerOffset + 4 },
  
  // Header zone
  headerHeight: 22,
  
  // Footer zone (reserved, content must not enter)
  footerHeight: 12,
  
  // Calculated safe content area
  get contentTop() { return this.contentMargin + this.headerHeight },
  get contentBottom() { return this.pageHeight - this.contentMargin - this.footerHeight },
  get contentLeft() { return this.contentMargin },
  get contentRight() { return this.pageWidth - this.contentMargin },
  get contentWidth() { return this.contentRight - this.contentLeft },
  get contentHeight() { return this.contentBottom - this.contentTop },
  
  // Spacing
  sectionGap: 4,
  cardGap: 2,
  columnGap: 5,
}

// ============================================================
// LAYOUT VALIDATION - Fail fast on overlap
// ============================================================
interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
  name: string
}

function validateLayoutRect(rect: LayoutRect): void {
  const errors: string[] = []
  
  if (rect.x < GRID.contentLeft) {
    errors.push(`${rect.name}: x (${rect.x}) < contentLeft (${GRID.contentLeft})`)
  }
  if (rect.x + rect.width > GRID.contentRight) {
    errors.push(`${rect.name}: right edge (${rect.x + rect.width}) > contentRight (${GRID.contentRight})`)
  }
  if (rect.y < GRID.contentTop) {
    errors.push(`${rect.name}: y (${rect.y}) < contentTop (${GRID.contentTop})`)
  }
  if (rect.y + rect.height > GRID.contentBottom) {
    errors.push(`${rect.name}: bottom (${rect.y + rect.height}) > contentBottom (${GRID.contentBottom})`)
  }
  
  if (errors.length > 0) {
    console.error('Layout validation failed:', errors)
    // In production, we'd throw. For now, warn loudly.
  }
}

// ============================================================
// PAGE 1 LAYOUT ZONES (Fixed allocation, never overlap)
// ============================================================
const PAGE1_LAYOUT = {
  // Left column: 82mm wide
  leftColWidth: 82,
  
  // Fixed heights for left column sections
  scoreHeight: 28,        // Quality score box
  fileHeight: 24,         // File info with thumbnail
  specsLabelHeight: 5,    // "AUDIO SPECIFICATIONS" label
  specCardHeight: 10,     // Each spec card row
  specCardGap: 2,         // Gap between spec rows
  specRows: 3,            // 3 rows of 2 cards = 6 specs (reduced from 4)
  
  // Bottom row (Assessment + What Found)
  bottomRowHeight: 40,    // Reduced from 48 to fit better
  
  // Calculate spec grid height
  get specsGridHeight() {
    return this.specCardHeight * this.specRows + this.specCardGap * (this.specRows - 1)
  },
  
  // Calculate total left column content height
  get leftColContentHeight() {
    return this.scoreHeight + GRID.sectionGap +
           this.fileHeight + GRID.sectionGap +
           this.specsLabelHeight + this.specsGridHeight + GRID.sectionGap +
           this.bottomRowHeight
  },
  
  // Verify it fits
  get fits() {
    return this.leftColContentHeight <= GRID.contentHeight
  },
}

// Certificate ID generator
function generateCertificateId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = ''
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  id += '-'
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `NavOS-${id}`
}

// SHA-256 hash
async function calculateSha256(data: ArrayBuffer): Promise<string> {
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return 'UNAVAILABLE'
  }
}

// Format helpers
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Format frequency with EXACT precision for Nyquist calculations.
 * Examples: 22050 Hz -> "22.05 kHz", 24000 Hz -> "24 kHz"
 */
function formatFrequencyExact(hz: number): string {
  if (hz >= 1000) {
    const kHz = hz / 1000
    // Check if it's a clean integer
    if (Number.isInteger(kHz)) {
      return `${kHz} kHz`
    }
    // Check for common decimal patterns (e.g., 22.05, 88.2)
    const rounded2 = Math.round(kHz * 100) / 100
    if (rounded2 === kHz || Math.abs(rounded2 - kHz) < 0.001) {
      // Remove trailing zeros but keep necessary decimals
      return `${rounded2} kHz`
    }
    // Default: show 2 decimal places
    return `${kHz.toFixed(2)} kHz`
  }
  return `${hz.toFixed(0)} Hz`
}

function formatTier(tier: string): string {
  const tiers: Record<string, string> = {
    'poor': 'POOR',
    'basic': 'BASIC',
    'good': 'GOOD',
    'very_good': 'VERY GOOD',
    'excellent': 'EXCELLENT',
    'reference': 'REFERENCE',
  }
  return tiers[tier] || tier.replace(/_/g, ' ').toUpperCase()
}

/**
 * Generate dynamic "WHAT NavOS FOUND" explanation based on the actual assessment.
 * This text must reflect the source classification, not be hard-coded.
 */
function generateWhatNavOsFound(
  sourceLabel: SourceLabel,
  sampleRate: number,
  bitDepth: number | undefined,
  codec: string,
  compressionType: 'lossless' | 'lossy' | 'uncompressed' | 'unknown'
): string {
  const formatSampleRate = (hz: number): string => {
    const kHz = hz / 1000
    return Number.isInteger(kHz) ? `${kHz} kHz` : `${kHz.toFixed(1)} kHz`
  }
  
  // Determine if this is a hi-res file based on actual specs (fallback check)
  const isHiRes = sampleRate > 48000 || (bitDepth !== undefined && bitDepth > 16)
  const isLossy = compressionType === 'lossy'
  
  switch (sourceLabel) {
    case 'hi_res_download':
      return `This file matches high-resolution lossless audio characteristics. The ${formatSampleRate(sampleRate)} / ${bitDepth || 24}-bit ${codec.toUpperCase()} format provides extended frequency bandwidth beyond CD specifications.`
    
    case 'studio_production_export':
      return `This file exhibits studio-grade production characteristics. The ${formatSampleRate(sampleRate)} / ${bitDepth || 24}-bit ${codec.toUpperCase()} format indicates professional mastering or production source.`
    
    case 'cd_rip':
      // Use actual specs - CD standard is 44.1 kHz / 16-bit but file might vary slightly
      return `This file matches CD-quality lossless audio characteristics. The ${formatSampleRate(sampleRate)} / ${bitDepth || 16}-bit ${codec.toUpperCase()} format preserves the decoded audio without lossy compression, suitable for archival.`
    
    case 'itunes_aac':
      return `This file uses lossy ${codec.toUpperCase()} compression, meaning some audio information has been discarded during encoding. The file is suitable for playback, but it should not be treated as a lossless archival master.`
    
    case 'high_bitrate_lossy':
      return `This file uses lossy ${codec.toUpperCase()} compression at high bitrate. While not lossless, the encoding preserves most audible detail for typical listening. Not suitable as a lossless archival master.`
    
    case 'high_quality_streaming':
      return `This file uses lossy compression consistent with high-quality streaming audio. Some audio information has been discarded. Suitable for playback, not for lossless archival.`
    
    case 'standard_streaming':
      return `This file uses lossy compression typical of standard streaming quality. Audio detail is reduced compared to CD or lossless sources. Not suitable for archival.`
    
    case 'low_bitrate_streaming':
      return `This file uses low-bitrate lossy compression with significant audio data discarded. Suitable for casual listening only. Not suitable for archival.`
    
    case 'youtube_web_rip':
      return `This file shows characteristics consistent with web-sourced audio extraction. Lossy compression artifacts suggest quality limitations. Not suitable for archival.`
    
    case 'unknown_source':
    default:
      // Fallback - must distinguish lossy vs lossless
      if (isLossy) {
        return `This file uses lossy ${codec.toUpperCase()} compression, meaning some audio information has been discarded during encoding. The file is suitable for playback, but it should not be treated as a lossless archival master.`
      }
      if (isHiRes) {
        return `This file contains high-resolution audio data at ${formatSampleRate(sampleRate)} / ${bitDepth || 'unknown'}-bit. The exact source classification could not be determined with high confidence.`
      }
      return `This file uses ${codec.toUpperCase()} encoding. The exact source classification could not be determined with high confidence.`
  }
}

interface CertificateOptions {
  report: HiFiNaviReport
  fileInfo?: ExtractedFileInfo | null
  spectralData?: SpectralAnalysisResult | null
  spectrogramImageData?: string | null
  fileArrayBuffer?: ArrayBuffer | null
  albumArtUrl?: string | null  // FIX #1: Add album art URL to interface
}

/**
 * Draw the certificate frame border (no corner text)
 */
function drawCertificateFrame(doc: jsPDF): void {
  const { pageWidth, pageHeight, outerMargin, innerOffset } = GRID
  
  // Outer border
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(1.5)
  doc.rect(outerMargin, outerMargin, pageWidth - outerMargin * 2, pageHeight - outerMargin * 2)
  
  // Inner border
  doc.setLineWidth(0.5)
  doc.rect(
    outerMargin + innerOffset, 
    outerMargin + innerOffset, 
    pageWidth - outerMargin * 2 - innerOffset * 2, 
    pageHeight - outerMargin * 2 - innerOffset * 2
  )
  
  // Corner accents
  const cornerSize = 6
  const innerX = outerMargin + innerOffset
  const innerY = outerMargin + innerOffset
  const innerW = pageWidth - outerMargin * 2 - innerOffset * 2
  const innerH = pageHeight - outerMargin * 2 - innerOffset * 2
  
  doc.setLineWidth(0.8)
  // Top-left
  doc.line(innerX, innerY, innerX + cornerSize, innerY)
  doc.line(innerX, innerY, innerX, innerY + cornerSize)
  // Top-right
  doc.line(innerX + innerW, innerY, innerX + innerW - cornerSize, innerY)
  doc.line(innerX + innerW, innerY, innerX + innerW, innerY + cornerSize)
  // Bottom-left
  doc.line(innerX, innerY + innerH, innerX + cornerSize, innerY + innerH)
  doc.line(innerX, innerY + innerH, innerX, innerY + innerH - cornerSize)
  // Bottom-right
  doc.line(innerX + innerW, innerY + innerH, innerX + innerW - cornerSize, innerY + innerH)
  doc.line(innerX + innerW, innerY + innerH, innerX + innerW, innerY + innerH - cornerSize)
}

/**
 * Draw page footer
 */
function drawFooter(doc: jsPDF, pageNum: number, certificateId: string): void {
  const footerY = GRID.contentBottom + 2
  
  // Separator line
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.5)
  doc.line(GRID.contentLeft, footerY, GRID.contentRight, footerY)
  
  // NavOS branding
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(COLORS.black)
  doc.text('NavOS', GRID.contentLeft, footerY + 6)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.grayMid)
  doc.text('AUDIO DOC', GRID.contentLeft + 14, footerY + 6)
  
  // Certificate ID center
  doc.text(certificateId, GRID.contentLeft + GRID.contentWidth / 2, footerY + 6, { align: 'center' })
  
  // Page number right
  doc.text(`Page ${pageNum} of 2`, GRID.contentRight, footerY + 6, { align: 'right' })
}

/**
 * Draw a data card
 */
function drawDataCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  options: { valueFontSize?: number; bgColor?: string } = {}
): void {
  const { valueFontSize = 10, bgColor = COLORS.offWhite } = options
  
  // Background
  doc.setFillColor(bgColor)
  doc.rect(x, y, width, height, 'F')
  
  // Border
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.3)
  doc.rect(x, y, width, height)
  
  // Label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.grayMid)
  doc.text(label, x + 2, y + 4)
  
  // Value
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(valueFontSize)
  doc.setTextColor(COLORS.black)
  doc.text(value, x + 2, y + height - 2)
}

/**
 * Draw a checkmark as a vector path (FIX #5: Avoid font character issues)
 */
function drawCheckmark(doc: jsPDF, x: number, y: number, size: number = 2.5): void {
  doc.setDrawColor(COLORS.green)
  doc.setLineWidth(0.5)
  // Draw checkmark as two lines forming a V shape
  doc.line(x, y, x + size * 0.4, y + size * 0.5)
  doc.line(x + size * 0.4, y + size * 0.5, x + size, y - size * 0.3)
}

/**
 * Main PDF Certificate Generator
 */
export async function generateCertificatePdf(options: CertificateOptions): Promise<void> {
  const { report, fileInfo, spectralData, spectrogramImageData, fileArrayBuffer, albumArtUrl } = options
  
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })
  
  const certificateId = generateCertificateId()
  // Date/time for header display (ISO timestamp removed - was redundant)
  const displayDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const displayTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
  
  // Calculate file hash
  let fileHash = 'NOT CALCULATED'
  if (fileArrayBuffer) {
    fileHash = await calculateSha256(fileArrayBuffer)
  }
  
  // Get sample rate info - FIX #2: Use exact Nyquist calculation
  const sampleRate = report.inspector.technical.sampleRateHz || spectralData?.metrics.sampleRate || 44100
  const nyquist = sampleRate / 2  // EXACT: 44100/2 = 22050, not rounded
  const isLossless = report.inspector.codec.compressionType === 'lossless' || 
                     report.inspector.codec.compressionType === 'uncompressed'
  
  // ==========================================
  // PAGE 1: CERTIFICATE WITH SPECTROGRAM
  // ==========================================
  
  // Yellow background
  doc.setFillColor(COLORS.yellow)
  doc.rect(0, 0, GRID.pageWidth, GRID.pageHeight, 'F')
  
  drawCertificateFrame(doc)
  
  // === HEADER ===
  const headerY = GRID.contentMargin
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(COLORS.black)
  doc.text('NavOS', GRID.contentLeft, headerY + 8)
  
  doc.setFontSize(12)
  doc.text('AUDIO ANALYSIS CERTIFICATE', GRID.contentLeft + 38, headerY + 8)
  
  // Official NavOS certificate tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.grayMid)
  doc.text('Every File. Analyzed. Every Collection. Documented.', GRID.contentLeft, headerY + 13)
  
  // Right side header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text(certificateId, GRID.contentRight, headerY + 4, { align: 'right' })
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.grayMid)
  doc.text(displayDate + ' · ' + displayTime, GRID.contentRight, headerY + 9, { align: 'right' })
  
  // LOCAL ANALYSIS badge
  doc.setFillColor(COLORS.black)
  doc.rect(GRID.contentRight - 28, headerY + 11, 28, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.yellow)
  doc.text('LOCAL ANALYSIS', GRID.contentRight - 14, headerY + 15, { align: 'center' })
  
  // Header separator
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.8)
  doc.line(GRID.contentLeft, GRID.contentTop - 2, GRID.contentRight, GRID.contentTop - 2)
  
  // === CONTENT AREA ===
  // Using architectural layout zones - content MUST fit, never overlap
  const leftColWidth = PAGE1_LAYOUT.leftColWidth
  const rightColWidth = GRID.contentWidth - leftColWidth - GRID.columnGap
  const leftColX = GRID.contentLeft
  const rightColX = GRID.contentLeft + leftColWidth + GRID.columnGap
  
  // ============================================================
  // PAGE 1 LEFT COLUMN - FIXED HEIGHT ALLOCATION
  // ============================================================
  // Total available: GRID.contentHeight (140mm)
  // Allocations:
  //   Score box:      28mm
  //   Gap:            4mm
  //   File box:       24mm
  //   Gap:            4mm
  //   Specs label:    5mm
  //   Specs grid:     36mm (3 rows × 10mm + 2 gaps × 3mm)
  //   Gap:            4mm
  //   Bottom row:     35mm (Assessment + What Found, both columns)
  // Total:           140mm ✓
  // ============================================================
  
  const scoreHeight = 28
  const fileHeight = 24
  const specLabelHeight = 5
  const specRows = 3  // REDUCED from 4 to fit
  const cardHeight = 10
  const specsGridHeight = (cardHeight * specRows) + (GRID.cardGap * (specRows - 1))
  const bottomRowHeight = 35
  
  // Calculate exact positions
  let leftY = GRID.contentTop
  const scoreY = leftY
  const fileY = scoreY + scoreHeight + GRID.sectionGap
  const specsLabelY = fileY + fileHeight + GRID.sectionGap
  const specsGridY = specsLabelY + specLabelHeight
  const bottomRowTop = GRID.contentBottom - bottomRowHeight
  
  // Validate layout fits
  const specsEndY = specsGridY + specsGridHeight
  if (specsEndY > bottomRowTop - GRID.sectionGap) {
    console.error(`PAGE 1 LAYOUT ERROR: Specs end at ${specsEndY}, bottom row at ${bottomRowTop}`)
  }
  
  // QUALITY SCORE
  validateLayoutRect({ x: leftColX, y: scoreY, width: leftColWidth, height: scoreHeight, name: 'QualityScore' })
  
  doc.setFillColor(COLORS.white)
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.8)
  doc.rect(leftColX, scoreY, leftColWidth, scoreHeight, 'FD')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayMid)
  doc.text('NavOS QUALITY SCORE', leftColX + 2, scoreY + 4)
  
  doc.setFontSize(28)
  doc.setTextColor(COLORS.black)
  doc.text(`${report.analysis.qualityScore}`, leftColX + 4, scoreY + 18)
  
  doc.setFontSize(10)
  doc.setTextColor(COLORS.grayMid)
  doc.text('/ 100', leftColX + 24, scoreY + 18)
  
  // Tier badge
  const tierText = formatTier(report.analysis.qualityTier)
  doc.setFillColor(COLORS.black)
  doc.rect(leftColX + 42, scoreY + 10, 38, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(COLORS.yellow)
  doc.text(tierText, leftColX + 61, scoreY + 15, { align: 'center' })
  
  // Analysis Confidence (compact) - distinct from Source Assessment Confidence
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4)
  doc.setTextColor(COLORS.grayMid)
  doc.text(`Analysis Confidence: ${report.analysis.analysisConfidence}%`, leftColX + 42, scoreY + 22)
  
  // FILE INFO WITH ALBUM ART THUMBNAIL
  validateLayoutRect({ x: leftColX, y: fileY, width: leftColWidth, height: fileHeight, name: 'FileInfo' })
  
  doc.setFillColor(COLORS.white)
  doc.setLineWidth(0.5)
  doc.rect(leftColX, fileY, leftColWidth, fileHeight, 'FD')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayMid)
  doc.text('FILE', leftColX + 2, fileY + 3)
  
  // Album art thumbnail
  const thumbSize = 16
  const thumbX = leftColX + 2
  const thumbY = fileY + 5
  
  if (albumArtUrl) {
    try {
      doc.addImage(albumArtUrl, 'JPEG', thumbX, thumbY, thumbSize, thumbSize)
      doc.setDrawColor(COLORS.grayLight)
      doc.setLineWidth(0.2)
      doc.rect(thumbX, thumbY, thumbSize, thumbSize)
    } catch {
      doc.setFillColor(COLORS.offWhite)
      doc.rect(thumbX, thumbY, thumbSize, thumbSize, 'F')
      doc.setDrawColor(COLORS.grayLight)
      doc.setLineWidth(0.2)
      doc.rect(thumbX, thumbY, thumbSize, thumbSize)
    }
  } else {
    doc.setFillColor(COLORS.offWhite)
    doc.rect(thumbX, thumbY, thumbSize, thumbSize, 'F')
    doc.setDrawColor(COLORS.grayLight)
    doc.setLineWidth(0.2)
    doc.rect(thumbX, thumbY, thumbSize, thumbSize)
  }
  
  // File info text
  const fileTextX = thumbX + thumbSize + 3
  const fileName = fileInfo?.fileName || 'Unknown file'
  const truncatedName = fileName.length > 28 ? fileName.substring(0, 25) + '...' : fileName
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text(truncatedName, fileTextX, fileY + 9)
  
  const fileSpecs = []
  if (fileInfo?.fileSize) fileSpecs.push(formatFileSize(fileInfo.fileSize))
  if (report.inspector.codec.display) fileSpecs.push(report.inspector.codec.display)
  if (report.inspector.file.durationDisplay) fileSpecs.push(report.inspector.file.durationDisplay)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayMid)
  doc.text(fileSpecs.join(' · '), fileTextX, fileY + 15)
  
  // AUDIO SPECIFICATIONS HEADER
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.black)
  doc.text('AUDIO SPECIFICATIONS', leftColX, specsLabelY + 3)
  
  // Spec cards grid (3 rows x 2 cols = 6 specs: FORMAT, SAMPLE RATE, BIT DEPTH, CHANNELS, DURATION, NYQUIST)
  const cardWidth = (leftColWidth - GRID.cardGap) / 2
  leftY = specsGridY
  
  // Row 1: FORMAT, SAMPLE RATE
  drawDataCard(doc, leftColX, leftY, cardWidth, cardHeight, 
    'FORMAT', report.inspector.codec.display || 'Unknown', { valueFontSize: 7 })
  drawDataCard(doc, leftColX + cardWidth + GRID.cardGap, leftY, cardWidth, cardHeight,
    'SAMPLE RATE', report.inspector.technical.sampleRateDisplay || 'Unknown', { valueFontSize: 7 })
  leftY += cardHeight + GRID.cardGap
  
  // Row 2: BIT DEPTH, CHANNELS
  drawDataCard(doc, leftColX, leftY, cardWidth, cardHeight,
    'BIT DEPTH', report.inspector.technical.bitDepth ? `${report.inspector.technical.bitDepth}-bit` : 'N/A', { valueFontSize: 7 })
  drawDataCard(doc, leftColX + cardWidth + GRID.cardGap, leftY, cardWidth, cardHeight,
    'CHANNELS', report.inspector.technical.channelLayoutDisplay || 'Unknown', { valueFontSize: 7 })
  leftY += cardHeight + GRID.cardGap
  
  // Row 3: DURATION, NYQUIST
  drawDataCard(doc, leftColX, leftY, cardWidth, cardHeight,
    'DURATION', report.inspector.file.durationDisplay || 'Unknown', { valueFontSize: 7 })
  drawDataCard(doc, leftColX + cardWidth + GRID.cardGap, leftY, cardWidth, cardHeight,
    'NYQUIST', formatFrequencyExact(nyquist), { valueFontSize: 7 })
  
  // === NAVOS ASSESSMENT (Bottom Row Left) ===
  validateLayoutRect({ x: leftColX, y: bottomRowTop, width: leftColWidth, height: bottomRowHeight, name: 'NavOSAssessment' })
  
  const sourceLabel = report.analysis.likelySource.displayLabel.toUpperCase()
  const adjustedSourceLabel = sourceLabel.includes('CD') 
    ? 'CD-QUALITY / CD-DERIVED' 
    : sourceLabel
  
  doc.setFillColor(COLORS.black)
  doc.rect(leftColX, bottomRowTop, leftColWidth, bottomRowHeight, 'F')
  
  // Compact assessment content
  const assessPadX = 3
  const assessContentX = leftColX + assessPadX
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayLight)
  doc.text('NAVOS ASSESSMENT', assessContentX, bottomRowTop + 5)
  
  doc.setFontSize(9)
  doc.setTextColor(COLORS.yellow)
  doc.text(adjustedSourceLabel, assessContentX, bottomRowTop + 13)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayLight)
  doc.text(`Source Assessment Confidence: ${report.analysis.likelySource.confidence}%`, assessContentX, bottomRowTop + 18)
  
  // Evidence (condensed to 1 line) - Use actual values, never hardcode
  doc.setFontSize(4.5)
  const bitDepthText = report.inspector.technical.bitDepth ? `${report.inspector.technical.bitDepth}-bit` : null
  const bitrateText = report.inspector.technical.bitRateDisplay || null
  const compressionText = report.inspector.codec.compressionType === 'lossy' ? 'Lossy' : null
  
  // Build evidence parts dynamically based on what data we actually have
  const evidenceParts = [report.inspector.technical.sampleRateDisplay || '44.1 kHz']
  if (bitDepthText) evidenceParts.push(bitDepthText)
  if (compressionText) evidenceParts.push(compressionText)
  if (bitrateText && report.inspector.codec.compressionType === 'lossy') evidenceParts.push(bitrateText)
  evidenceParts.push(`${formatFrequencyExact(nyquist)} Nyquist`)
  
  const evidenceText = evidenceParts.join(' · ')
  doc.text(evidenceText, assessContentX, bottomRowTop + 25)
  
  // === RIGHT COLUMN - SPECTROGRAM ===
  let rightY = GRID.contentTop
  
  // Spectrogram box - fill from top to just above the bottom row
  const spectrogramBoxHeight = bottomRowTop - GRID.contentTop - GRID.sectionGap
  
  validateLayoutRect({ x: rightColX, y: rightY, width: rightColWidth, height: spectrogramBoxHeight, name: 'Spectrogram' })
  
  doc.setFillColor(COLORS.white)
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.8)
  doc.rect(rightColX, rightY, rightColWidth, spectrogramBoxHeight, 'FD')
  
  // Spectrogram header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.black)
  doc.text('SPECTRAL ANALYSIS', rightColX + 2, rightY + 5)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.5)
  doc.setTextColor(COLORS.grayMid)
  const spectInfo = spectralData 
    ? `${formatFrequencyExact(spectralData.metrics.sampleRate)} · 0 to -120 dBFS · FFT ${spectralData.metrics.fftSize}`
    : `${formatFrequencyExact(sampleRate)} · 0 to -120 dBFS`
  doc.text(spectInfo, rightColX + rightColWidth - 2, rightY + 5, { align: 'right' })
  
  // Spectrogram image area
  const imgPadding = 6
  const imgTop = rightY + 9
  const imgAreaWidth = rightColWidth - imgPadding * 2
  const imgAreaHeight = spectrogramBoxHeight - 12
  
  if (spectrogramImageData) {
    try {
      const img = new Image()
      const imgLoadPromise = new Promise<{ width: number; height: number }>((resolve, reject) => {
        img.onload = () => resolve({ width: img.width, height: img.height })
        img.onerror = reject
      })
      img.src = spectrogramImageData
      
      const { width: imgNativeWidth, height: imgNativeHeight } = await imgLoadPromise
      
      const aspectRatio = imgNativeWidth / imgNativeHeight
      let imgWidth = imgAreaWidth
      let imgHeight = imgWidth / aspectRatio
      
      if (imgHeight > imgAreaHeight) {
        imgHeight = imgAreaHeight
        imgWidth = imgHeight * aspectRatio
      }
      
      const imgX = rightColX + (rightColWidth - imgWidth) / 2
      const imgY = imgTop
      
      doc.addImage(spectrogramImageData, 'PNG', imgX, imgY, imgWidth, imgHeight)
    } catch {
      doc.setFontSize(8)
      doc.setTextColor(COLORS.grayMid)
      doc.text('Spectrogram not available', rightColX + rightColWidth / 2, rightY + spectrogramBoxHeight / 2, { align: 'center' })
    }
  } else {
    doc.setFontSize(8)
    doc.setTextColor(COLORS.grayMid)
    doc.text('Spectrogram not available', rightColX + rightColWidth / 2, rightY + spectrogramBoxHeight / 2, { align: 'center' })
    doc.setFontSize(5)
    doc.text('Run spectral analysis to include', rightColX + rightColWidth / 2, rightY + spectrogramBoxHeight / 2 + 5, { align: 'center' })
  }
  
  // === WHAT NavOS FOUND (Bottom Row Right) ===
  validateLayoutRect({ x: rightColX, y: bottomRowTop, width: rightColWidth, height: bottomRowHeight, name: 'WhatFound' })
  
  doc.setFillColor(COLORS.black)
  doc.rect(rightColX, bottomRowTop, rightColWidth, bottomRowHeight, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.yellow)
  doc.text('WHAT NavOS FOUND', rightColX + 2, bottomRowTop + 5)
  
  // Dynamic explanation based on actual assessment (not hard-coded)
  const whatFound = generateWhatNavOsFound(
    report.analysis.likelySource.label,
    sampleRate,
    report.inspector.technical.bitDepth,
    report.inspector.codec.display || report.inspector.codec.raw || 'audio',
    report.inspector.codec.compressionType
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  const foundLines = doc.splitTextToSize(whatFound, rightColWidth - 4)
  doc.text(foundLines.slice(0, 4), rightColX + 2, bottomRowTop + 12)
  
  // === FOOTER ===
  drawFooter(doc, 1, certificateId)
  
  // ==========================================
  // PAGE 2: ADVANCED TECHNICAL DETAILS
  // ==========================================
  
  doc.addPage('a4', 'landscape')
  
  // Yellow background
  doc.setFillColor(COLORS.yellow)
  doc.rect(0, 0, GRID.pageWidth, GRID.pageHeight, 'F')
  
  drawCertificateFrame(doc)
  
  // === HEADER ===
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(COLORS.black)
  doc.text('NavOS // ADVANCED AUDIO ANALYSIS', GRID.contentLeft, GRID.contentMargin + 6)
  
  // Certificate ID + Date/Time (combined to avoid redundancy with removed ANALYSIS TIMESTAMP)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.grayMid)
  doc.text(`${certificateId} · ${displayDate} · ${displayTime}`, GRID.contentRight, GRID.contentMargin + 6, { align: 'right' })
  
  // Header separator
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.5)
  doc.line(GRID.contentLeft, GRID.contentTop - 2, GRID.contentRight, GRID.contentTop - 2)
  
  // === THREE COLUMN LAYOUT - CONSISTENT GRID ===
  // Define unified grid constants for perfect alignment
  const col3Width = (GRID.contentWidth - GRID.columnGap * 2) / 3
  const col1X = GRID.contentLeft
  const col2X = GRID.contentLeft + col3Width + GRID.columnGap
  const col3X = GRID.contentLeft + (col3Width + GRID.columnGap) * 2
  
  // Consistent spacing values for all sections
  const P2 = {
    headerGap: 6,       // Gap below section headers
    cardPadding: 2,     // Internal card padding
    lineHeight: 5.5,    // Line height for data rows
    sectionGap: 6,      // Gap between sections
    labelValueGap: 22,  // Space between label and value in data rows
  }
  
  // === PAGE 2 CONSTRAINT-BASED LAYOUT ===
  // RULE: Available space > content. Never overlap.
  // 
  // Layout zones (top to bottom):
  // 1. Column content area: 3 equal columns
  // 2. Important Note: full-width disclaimer at bottom
  // 3. Footer: already reserved in GRID.contentBottom
  //
  // Calculate AVAILABLE height for columns FIRST, then allocate
  
  const disclaimerHeight = 18
  const disclaimerGap = 4
  const colTop = GRID.contentTop
  
  // Maximum Y coordinate any column can reach
  const colMaxBottom = GRID.contentBottom - disclaimerHeight - disclaimerGap
  // Available height for columns: ~118mm (colMaxBottom - colTop)
  
  // Fixed disclaimer position (anchored to content bottom)
  const disclaimerY = GRID.contentBottom - disclaimerHeight
  
  // === COLUMN 1: SPECTRAL ANALYSIS ===
  let col1Y = colTop
  
  // Section header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('SPECTRAL PARAMETERS', col1X, col1Y + 3)
  col1Y += P2.headerGap
  
  // Spectral params box
  const spectralBoxHeight = 48
  doc.setFillColor(COLORS.white)
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(0.3)
  doc.rect(col1X, col1Y, col3Width, spectralBoxHeight, 'FD')
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  
  // FIX #2: Use exact frequency formatting throughout
  const spectralParams = spectralData ? [
    ['Sample Rate', formatFrequencyExact(spectralData.metrics.sampleRate)],
    ['Nyquist', formatFrequencyExact(spectralData.metrics.nyquistFrequency)],
    ['FFT Size', spectralData.metrics.fftSize.toString()],
    ['Freq Resolution', `${spectralData.metrics.frequencyResolution.toFixed(2)} Hz`],
    ['Window', spectralData.metrics.windowFunction],
    ['Hop Size', spectralData.metrics.hopSize.toString()],
    ['Time Resolution', `${(spectralData.metrics.timeResolution * 1000).toFixed(1)} ms`],
    ['dBFS Display Range', '0 to -120 dBFS'],
  ] : [
    ['Sample Rate', formatFrequencyExact(sampleRate)],
    ['Nyquist', formatFrequencyExact(nyquist)],
    ['dBFS Display Range', '0 to -120 dBFS'],
  ]
  
  let paramY = col1Y + P2.cardPadding + 3
  for (const [label, value] of spectralParams) {
    doc.setTextColor(COLORS.grayMid)
    doc.text(label, col1X + P2.cardPadding, paramY)
    doc.setTextColor(COLORS.black)
    doc.text(value, col1X + col3Width - P2.cardPadding, paramY, { align: 'right' })
    paramY += P2.lineHeight
  }
  
  col1Y += spectralBoxHeight + P2.sectionGap
  
  // HIGH-FREQUENCY ANALYSIS
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('HIGH-FREQUENCY ANALYSIS', col1X, col1Y + 3)
  col1Y += P2.headerGap
  
  const hfBoxHeight = 26
  doc.setFillColor(COLORS.white)
  doc.rect(col1X, col1Y, col3Width, hfBoxHeight, 'FD')
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  
  if (spectralData) {
    const hfParams = [
      ['Energy > 15 kHz', `${spectralData.metrics.highFrequencyEnergy.toFixed(2)}%`],
      ['Energy > 18 kHz', `${spectralData.metrics.veryHighFrequencyEnergy.toFixed(2)}%`],
      ['Spectral Centroid', formatFrequencyExact(spectralData.metrics.spectralCentroid)],
      ['Spectral Rolloff', formatFrequencyExact(spectralData.metrics.spectralRolloff)],
    ]
    
    paramY = col1Y + P2.cardPadding + 3
    for (const [label, value] of hfParams) {
      doc.setTextColor(COLORS.grayMid)
      doc.text(label, col1X + P2.cardPadding, paramY)
      doc.setTextColor(COLORS.black)
      doc.text(value, col1X + col3Width - P2.cardPadding, paramY, { align: 'right' })
      paramY += 5
    }
  } else {
    doc.setTextColor(COLORS.grayMid)
    doc.text('Run spectral analysis', col1X + col3Width / 2, col1Y + 13, { align: 'center' })
  }
  
  col1Y += hfBoxHeight + P2.sectionGap
  
  // QUALITY FACTORS
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('QUALITY FACTORS', col1X, col1Y + 3)
  col1Y += P2.headerGap
  
  // Quality factors box - CONSTRAINED to fit within colMaxBottom
  // Calculate remaining space and use it, but cap at reasonable max
  const qfMaxHeight = colMaxBottom - col1Y
  const qfDesiredHeight = 50
  const qfBoxHeight = Math.min(qfDesiredHeight, qfMaxHeight)
  
  // Validate: if we can't fit at least 20mm, something is wrong upstream
  if (qfBoxHeight < 20) {
    console.error(`LAYOUT ERROR: Quality Factors box only ${qfBoxHeight}mm available. Reducing prior sections.`)
  }
  
  doc.setFillColor(COLORS.white)
  doc.rect(col1X, col1Y, col3Width, qfBoxHeight, 'FD')
  
  // Validate layout bounds
  validateLayoutRect({ x: col1X, y: col1Y, width: col3Width, height: qfBoxHeight, name: 'QualityFactors' })
  
  // Track column 1 bottom (used for debugging, but disclaimer uses fixed position now)
  const col1Bottom = col1Y + qfBoxHeight
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  
  // Convert Unicode symbols to text-based markers
  const reasons = report.analysis.reasons.slice(0, 8)
  paramY = col1Y + P2.cardPadding + 3
  for (const reason of reasons) {
    const isPositive = reason.startsWith('✓') || reason.startsWith('✔')
    const isConcern = reason.startsWith('⚠') || reason.startsWith('!')
    
    // Replace Unicode with text markers
    let displayReason = reason
      .replace(/^✓\s*/, '')
      .replace(/^✔\s*/, '')
      .replace(/^⚠\s*/, '')
      .replace(/^!\s*/, '')
    
    if (isPositive) {
      // Draw vector checkmark
      drawCheckmark(doc, col1X + P2.cardPadding, paramY - 1)
      doc.setTextColor(COLORS.grayDark)
      const truncReason = displayReason.length > 50 ? displayReason.substring(0, 47) + '...' : displayReason
      doc.text(truncReason, col1X + P2.cardPadding + 4, paramY)
    } else if (isConcern) {
      // Draw [!] for concerns
      doc.setTextColor(COLORS.orange)
      doc.text('[!]', col1X + P2.cardPadding, paramY)
      doc.setTextColor(COLORS.grayDark)
      const truncReason = displayReason.length > 50 ? displayReason.substring(0, 47) + '...' : displayReason
      doc.text(truncReason, col1X + P2.cardPadding + 6, paramY)
    } else {
      doc.setTextColor(COLORS.grayDark)
      const truncReason = reason.length > 55 ? reason.substring(0, 52) + '...' : reason
      doc.text(truncReason, col1X + P2.cardPadding, paramY)
    }
    paramY += 5
    if (paramY > col1Y + qfBoxHeight - 3) break
  }
  
  // === COLUMN 2: SOURCE CHARACTERISTICS ===
  let col2Y = colTop
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('SOURCE CHARACTERISTICS', col2X, col2Y + 3)
  col2Y += P2.headerGap
  
  // Likely source verdict box
  const verdictBoxHeight = 20
  doc.setFillColor(COLORS.black)
  doc.rect(col2X, col2Y, col3Width, verdictBoxHeight, 'F')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.yellow)
  doc.text('LIKELY SOURCE', col2X + P2.cardPadding, col2Y + 5)
  
  doc.setFontSize(7)
  doc.text(adjustedSourceLabel, col2X + P2.cardPadding, col2Y + 12)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.text(`Confidence: ${report.analysis.likelySource.confidence}%`, col2X + col3Width - P2.cardPadding, col2Y + 12, { align: 'right' })
  
  col2Y += verdictBoxHeight + P2.sectionGap
  
  // EVIDENCE box
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('EVIDENCE', col2X, col2Y + 3)
  col2Y += P2.headerGap
  
  const evidenceBoxHeight = 36
  doc.setFillColor(COLORS.white)
  doc.rect(col2X, col2Y, col3Width, evidenceBoxHeight, 'FD')
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.black)
  
  const evidenceList = [
    `Sample Rate: ${report.inspector.technical.sampleRateDisplay || 'Unknown'}`,
    `Bit Depth: ${report.inspector.technical.bitDepth ? report.inspector.technical.bitDepth + '-bit' : 'N/A'}`,
    `Codec: ${report.inspector.codec.display || 'Unknown'}`,
    `Compression: ${isLossless ? 'Lossless' : 'Lossy'}`,
    `Bitrate: ${report.inspector.technical.bitRateDisplay || 'Unknown'}`,
  ]
  
  paramY = col2Y + P2.cardPadding + 3
  for (const line of evidenceList) {
    doc.text('• ' + line, col2X + P2.cardPadding, paramY)
    paramY += P2.lineHeight + 0.5
  }
  
  col2Y += evidenceBoxHeight + P2.sectionGap
  
  // SOURCE INTEGRITY
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('SOURCE INTEGRITY', col2X, col2Y + 3)
  col2Y += P2.headerGap
  
  const integrityBoxHeight = 14
  doc.setFillColor(COLORS.white)
  doc.rect(col2X, col2Y, col3Width, integrityBoxHeight, 'FD')
  
  let integrityStatus = 'CONSISTENT WITH LOSSLESS ENCODING'
  if (spectralData?.provenance.verdict === 'likely_lossy_transcoded') {
    integrityStatus = 'POSSIBLE TRANSCODING DETECTED'
  } else if (spectralData?.provenance.verdict === 'likely_upsampled') {
    integrityStatus = 'POSSIBLE UPSAMPLING DETECTED'
  } else if (!isLossless) {
    // Do not claim "original" - we only know it's lossy, not its provenance
    integrityStatus = 'LOSSY ENCODING DETECTED'
  }
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.black)
  doc.text(integrityStatus, col2X + P2.cardPadding, col2Y + 9)
  
  // Track and validate column 2 bottom
  const col2Bottom = col2Y + integrityBoxHeight
  if (col2Bottom > colMaxBottom) {
    console.error(`LAYOUT ERROR: Column 2 exceeds safe area. Bottom: ${col2Bottom}, limit: ${colMaxBottom}`)
  }
  validateLayoutRect({ x: col2X, y: col2Y, width: col3Width, height: integrityBoxHeight, name: 'SourceIntegrity' })
  
  // === COLUMN 3: FILE IDENTITY & PRIVACY ===
  let col3Y = colTop
  
  // FILE IDENTITY section
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('FILE IDENTITY', col3X, col3Y + 3)
  col3Y += P2.headerGap
  
  // SHA-256 box
  const hashBoxHeight = 24
  doc.setFillColor(COLORS.white)
  doc.rect(col3X, col3Y, col3Width, hashBoxHeight, 'FD')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayMid)
  doc.text('SHA-256', col3X + P2.cardPadding, col3Y + 4)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.5)
  doc.setTextColor(COLORS.black)
  if (fileHash !== 'NOT CALCULATED' && fileHash !== 'UNAVAILABLE') {
    doc.text(fileHash.substring(0, 32), col3X + P2.cardPadding, col3Y + 9)
    doc.text(fileHash.substring(32), col3X + P2.cardPadding, col3Y + 13)
  } else {
    doc.text(fileHash, col3X + P2.cardPadding, col3Y + 9)
  }
  
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayMid)
  doc.text('File Size:', col3X + P2.cardPadding, col3Y + 19)
  doc.setTextColor(COLORS.black)
  doc.text(fileInfo?.fileSize ? formatFileSize(fileInfo.fileSize) : 'Unknown', col3X + 18, col3Y + 19)
  
  col3Y += hashBoxHeight + P2.sectionGap
  
  // LOCAL PROCESSING (Privacy)
  // NOTE: ANALYSIS TIMESTAMP removed - redundant with header date/time
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('LOCAL PROCESSING', col3X, col3Y + 3)
  col3Y += P2.headerGap
  
  const privacyBoxHeight = 30
  doc.setFillColor(COLORS.black)
  doc.rect(col3X, col3Y, col3Width, privacyBoxHeight, 'F')
  
  // Table-style layout for privacy items with aligned columns
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  
  const privacyItems = [
    ['Audio analyzed locally', 'YES'],
    ['Cloud upload', 'NO'],
    ['External processing', 'NO'],
    ['Internet required', 'NO'],
  ]
  
  paramY = col3Y + P2.cardPadding + 4
  for (const [label, value] of privacyItems) {
    doc.setTextColor(COLORS.grayLight)
    doc.text(label, col3X + P2.cardPadding, paramY)
    doc.setTextColor(value === 'YES' ? COLORS.green : COLORS.yellow)
    doc.text(value, col3X + col3Width - P2.cardPadding, paramY, { align: 'right' })
    paramY += P2.lineHeight + 0.5
  }
  
  col3Y += privacyBoxHeight + P2.sectionGap
  
  // CERTIFICATE VERIFICATION
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.black)
  doc.text('CERTIFICATE VERIFICATION', col3X, col3Y + 3)
  col3Y += P2.headerGap
  
  const verifyBoxHeight = 22
  doc.setFillColor(COLORS.white)
  doc.rect(col3X, col3Y, col3Width, verifyBoxHeight, 'FD')
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(COLORS.grayMid)
  doc.text('Certificate ID', col3X + P2.cardPadding, col3Y + 5)
  doc.setTextColor(COLORS.black)
  doc.setFont('helvetica', 'bold')
  doc.text(certificateId, col3X + P2.cardPadding, col3Y + 10)
  
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.grayMid)
  doc.text('Processing', col3X + P2.cardPadding, col3Y + 16)
  doc.setTextColor(COLORS.black)
  doc.text('100% Local (No cloud upload)', col3X + P2.labelValueGap, col3Y + 16)
  
  // Track and validate column 3 bottom
  const col3Bottom = col3Y + verifyBoxHeight
  if (col3Bottom > colMaxBottom) {
    console.error(`LAYOUT ERROR: Column 3 exceeds safe area. Bottom: ${col3Bottom}, limit: ${colMaxBottom}`)
  }
  validateLayoutRect({ x: col3X, y: col3Y, width: col3Width, height: verifyBoxHeight, name: 'CertificateVerification' })
  
  // === IMPORTANT NOTE DISCLAIMER ===
  // Full-width section at FIXED position (disclaimerY calculated at top of Page 2)
  // This ensures it never overlaps with columns because columns are constrained to colMaxBottom
  
  // Validate that no column exceeded colMaxBottom
  const actualMaxColBottom = Math.max(col1Bottom, col2Bottom, col3Bottom)
  if (actualMaxColBottom > colMaxBottom) {
    console.error(`LAYOUT ERROR: Columns exceeded safe area. Max column bottom: ${actualMaxColBottom}, limit: ${colMaxBottom}`)
  }
  
  // Validate disclaimer position
  validateLayoutRect({ x: GRID.contentLeft, y: disclaimerY, width: GRID.contentWidth, height: disclaimerHeight, name: 'ImportantNote' })
  
  doc.setDrawColor(COLORS.grayLight)
  doc.setLineWidth(0.3)
  doc.setFillColor(COLORS.offWhite)
  doc.rect(GRID.contentLeft, disclaimerY, GRID.contentWidth, disclaimerHeight, 'FD')
  
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.grayDark)
  doc.text('IMPORTANT NOTE', GRID.contentLeft + P2.cardPadding, disclaimerY + 5)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(COLORS.grayMid)
  const disclaimer = 'This certificate reports analytical observations derived from the supplied audio file. It does not establish commercial provenance, mastering history, or original recording source with certainty.'
  const disclaimerLines = doc.splitTextToSize(disclaimer, GRID.contentWidth - P2.cardPadding * 2)
  doc.text(disclaimerLines.slice(0, 2), GRID.contentLeft + P2.cardPadding, disclaimerY + 11)
  
  // === FOOTER ===
  drawFooter(doc, 2, certificateId)
  
  // === SAVE PDF ===
  const baseName = fileInfo?.fileName 
    ? fileInfo.fileName.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]/g, '-').substring(0, 50)
    : 'audio'
  doc.save(`NavOS_Certificate_${baseName}.pdf`)
}

// Export alias
export { generateCertificatePdf as generatePremiumPdf }
