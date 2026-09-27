import { jsPDF } from 'jspdf'
import type { HiFiNaviReport } from '../types/report'
import type { ExtractedFileInfo } from '../extractor/audioMetadataExtractor'

// NavOS Colors - Brutalist
const COLORS = {
  yellow: '#FFD93D',
  black: '#1A1A1A',
  textPrimary: '#1A1A1A',
  textSecondary: '#333333',
  textMuted: '#666666',
  positive: '#1A1A1A',
  concern: '#1A1A1A',
  border: '#1A1A1A',
  bgLight: '#F5F5F5',
}

// Fonts
const FONT = {
  regular: 'helvetica',
  bold: 'helvetica',
}

interface ExportOptions {
  report: HiFiNaviReport
  fileInfo?: ExtractedFileInfo | null
}

/**
 * Format a tier name for display
 */
function formatTier(tier: string): string {
  return tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Sanitize filename for safe export
 */
function sanitizeFilename(name: string): string {
  // Remove unsafe characters
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100) // Limit length
}

/**
 * Generate a report filename
 */
function generateFilename(fileInfo?: ExtractedFileInfo | null): string {
  const baseName = fileInfo?.fileName
    ? sanitizeFilename(fileInfo.fileName.replace(/\.[^/.]+$/, ''))
    : 'audio-analysis'
  return `NavOS_AudioDOC_${baseName}.pdf`
}

/**
 * Draw a section header with gold accent
 */
function drawSectionHeader(
  doc: jsPDF,
  text: string,
  y: number,
  _pageWidth: number,
  margin: number
): number {
  // Black accent line (brutalist)
  doc.setDrawColor(COLORS.black)
  doc.setLineWidth(2)
  doc.line(margin, y, margin + 20, y)
  
  // Section title
  doc.setFont(FONT.bold, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(COLORS.textPrimary)
  doc.text(text.toUpperCase(), margin + 25, y + 1)
  
  return y + 10
}

/**
 * Draw a key-value pair
 */
function drawKeyValue(
  doc: jsPDF,
  key: string,
  value: string,
  y: number,
  margin: number,
  keyWidth: number = 45
): number {
  doc.setFont(FONT.regular, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(COLORS.textSecondary)
  doc.text(key, margin, y)
  
  doc.setTextColor(COLORS.textPrimary)
  doc.text(value, margin + keyWidth, y)
  
  return y + 6
}

/**
 * Check if we need a new page
 */
function checkPageBreak(
  doc: jsPDF,
  y: number,
  margin: number,
  requiredSpace: number,
  pageHeight: number
): number {
  if (y + requiredSpace > pageHeight - margin) {
    doc.addPage()
    return margin + 15
  }
  return y
}

/**
 * Generate PDF report
 */
export function generatePdfReport(options: ExportOptions): void {
  const { report, fileInfo } = options
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  
  let y = margin
  
  // Header with NavOS branding - Brutalist
  doc.setFillColor(COLORS.yellow)
  doc.rect(0, 0, pageWidth, 40, 'F')
  
  // NavOS title
  doc.setFont(FONT.bold, 'bold')
  doc.setFontSize(24)
  doc.setTextColor(COLORS.black)
  doc.text('NAVOS', margin, 18)
  
  // Audio DOC subtitle
  doc.setFontSize(24)
  doc.text('// AUDIO DOC', margin + 28, 18)
  
  // Report subtitle
  doc.setFont(FONT.regular, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(COLORS.black)
  doc.text('AUDIO QUALITY ANALYSIS REPORT', margin, 30)
  
  // Timestamp
  const timestamp = new Date().toLocaleString()
  doc.text(`Generated: ${timestamp}`, pageWidth - margin - 60, 30)
  
  y = 55
  
  // === File Information ===
  if (fileInfo) {
    y = drawSectionHeader(doc, 'FILE INFORMATION', y, pageWidth, margin)
    y += 5
    
    y = drawKeyValue(doc, 'Filename:', fileInfo.fileName, y, margin)
    y = drawKeyValue(doc, 'Size:', formatFileSize(fileInfo.fileSize), y, margin)
    if (fileInfo.mimeType) {
      y = drawKeyValue(doc, 'Type:', fileInfo.mimeType, y, margin)
    }
    
    y += 10
  }
  
  // === Quality Analysis ===
  y = checkPageBreak(doc, y, margin, 50, pageHeight)
  y = drawSectionHeader(doc, 'QUALITY ANALYSIS', y, pageWidth, margin)
  y += 5
  
  // Score display
  doc.setFont(FONT.bold, 'bold')
  doc.setFontSize(36)
  doc.setTextColor(COLORS.black)
  doc.text(`${report.analysis.qualityScore}`, margin, y + 10)
  
  doc.setFontSize(14)
  doc.setTextColor(COLORS.textSecondary)
  doc.text('/ 100', margin + 25, y + 10)
  
  // Tier badge
  doc.setFontSize(12)
  doc.setTextColor(COLORS.textPrimary)
  doc.text(formatTier(report.analysis.qualityTier), margin + 45, y + 10)
  
  y += 20
  
  // Confidence
  y = drawKeyValue(doc, 'Confidence:', `${report.analysis.analysisConfidenceLabel} (${report.analysis.analysisConfidence}%)`, y, margin)
  
  y += 5
  
  // Summary
  doc.setFont(FONT.regular, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(COLORS.textPrimary)
  const summaryLines = doc.splitTextToSize(report.analysis.summary, contentWidth)
  doc.text(summaryLines, margin, y)
  y += summaryLines.length * 5 + 5
  
  // === Quality Factors ===
  y = checkPageBreak(doc, y, margin, 40, pageHeight)
  y = drawSectionHeader(doc, 'QUALITY FACTORS', y, pageWidth, margin)
  y += 5
  
  report.analysis.reasons.forEach((reason) => {
    y = checkPageBreak(doc, y, margin, 8, pageHeight)
    
    const isPositive = reason.startsWith('✓')
    const isConcern = reason.startsWith('⚠')
    
    doc.setFont(FONT.regular, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(
      isPositive ? COLORS.positive : isConcern ? COLORS.concern : COLORS.textSecondary
    )
    
    const reasonLines = doc.splitTextToSize(reason, contentWidth - 5)
    doc.text(reasonLines, margin + 5, y)
    y += reasonLines.length * 4 + 2
  })
  
  y += 5
  
  // === Likely Source ===
  y = checkPageBreak(doc, y, margin, 40, pageHeight)
  y = drawSectionHeader(doc, 'LIKELY SOURCE', y, pageWidth, margin)
  y += 5
  
  y = drawKeyValue(doc, 'Classification:', report.analysis.likelySource.displayLabel, y, margin)
  y = drawKeyValue(doc, 'Confidence:', `${report.analysis.likelySource.confidenceLabel} (${report.analysis.likelySource.confidence}%)`, y, margin)
  
  y += 3
  
  // Source evidence
  doc.setFont(FONT.regular, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.textMuted)
  doc.text('Supporting evidence:', margin, y)
  y += 5
  
  report.analysis.likelySource.reasons.forEach((reason) => {
    y = checkPageBreak(doc, y, margin, 8, pageHeight)
    
    const isPositive = reason.startsWith('✓')
    const isConcern = reason.startsWith('⚠')
    
    doc.setTextColor(
      isPositive ? COLORS.positive : isConcern ? COLORS.concern : COLORS.textSecondary
    )
    
    const reasonLines = doc.splitTextToSize(reason, contentWidth - 5)
    doc.text(reasonLines, margin + 5, y)
    y += reasonLines.length * 4 + 2
  })
  
  y += 5
  
  // === Technical Details ===
  y = checkPageBreak(doc, y, margin, 60, pageHeight)
  y = drawSectionHeader(doc, 'TECHNICAL DETAILS', y, pageWidth, margin)
  y += 5
  
  const technicalDetails = [
    ['Format:', report.inspector.codec.display || 'Not available'],
    ['Compression:', report.inspector.codec.compressionType || 'Unknown'],
    ['Bitrate:', report.inspector.technical.bitRateDisplay || 'Not available'],
    ['Sample Rate:', report.inspector.technical.sampleRateDisplay || 'Not available'],
    ['Bit Depth:', report.inspector.technical.bitDepth ? `${report.inspector.technical.bitDepth}-bit` : 'Not available'],
    ['Channels:', report.inspector.technical.channelLayoutDisplay || 'Not available'],
    ['Duration:', report.inspector.file.durationDisplay || 'Not available'],
  ]
  
  if (report.inspector.tags.encoder) {
    technicalDetails.push(['Encoder:', report.inspector.tags.encoder])
  }
  
  technicalDetails.push(['Album Art:', report.inspector.tags.hasAlbumArt ? 'Present' : 'Not detected'])
  
  technicalDetails.forEach(([key, value]) => {
    y = checkPageBreak(doc, y, margin, 8, pageHeight)
    y = drawKeyValue(doc, key, value, y, margin)
  })
  
  // Flags
  if (report.analysis.flags.hiRes || report.analysis.flags.archiveWorthy || report.analysis.flags.audiophileGrade) {
    y += 5
    doc.setFont(FONT.regular, 'normal')
    doc.setFontSize(9)
    doc.setTextColor(COLORS.positive)
    
    if (report.analysis.flags.hiRes) {
      doc.text('✓ Hi-Res Audio', margin, y)
      y += 5
    }
    if (report.analysis.flags.archiveWorthy) {
      doc.text('✓ Archive worthy', margin, y)
      y += 5
    }
    if (report.analysis.flags.audiophileGrade) {
      doc.text('✓ Audiophile grade', margin, y)
      y += 5
    }
  }
  
  y += 5
  
  // === What This Means ===
  if (report.education.whatThisMeans) {
    y = checkPageBreak(doc, y, margin, 30, pageHeight)
    y = drawSectionHeader(doc, 'IN SIMPLE TERMS', y, pageWidth, margin)
    y += 5
    
    doc.setFont(FONT.regular, 'normal')
    doc.setFontSize(10)
    doc.setTextColor(COLORS.textPrimary)
    
    const meaningLines = doc.splitTextToSize(report.education.whatThisMeans, contentWidth)
    doc.text(meaningLines, margin, y)
    y += meaningLines.length * 5 + 10
  }
  
  // === Guidance ===
  if (report.education.guidance && report.education.guidance.length > 0) {
    y = checkPageBreak(doc, y, margin, 30, pageHeight)
    y = drawSectionHeader(doc, 'GUIDANCE', y, pageWidth, margin)
    y += 5
    
    report.education.guidance.forEach((item) => {
      y = checkPageBreak(doc, y, margin, 15, pageHeight)
      
      const icon = item.type === 'archive' ? '📁' : item.type === 'everyday' ? '🎧' : '✨'
      
      doc.setFont(FONT.regular, 'normal')
      doc.setFontSize(9)
      doc.setTextColor(COLORS.textPrimary)
      
      const guidanceLines = doc.splitTextToSize(`${icon} ${item.text}`, contentWidth - 5)
      doc.text(guidanceLines, margin + 5, y)
      y += guidanceLines.length * 4 + 3
    })
    
    y += 5
  }
  
  // === Footer ===
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    
    // Footer line
    doc.setDrawColor(COLORS.border)
    doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15)
    
    // Footer text
    doc.setFont(FONT.regular, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(COLORS.textMuted)
    doc.text('NAVOS // AUDIO DOC', margin, pageHeight - 10)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 10)
  }
  
  // Save the PDF
  const filename = generateFilename(fileInfo)
  doc.save(filename)
}

/**
 * Generate text summary for clipboard
 */
export function generateTextSummary(report: HiFiNaviReport, fileInfo?: ExtractedFileInfo | null): string {
  const lines: string[] = []
  
  lines.push('═══════════════════════════════════════')
  lines.push('NAVOS // AUDIO DOC - ANALYSIS SUMMARY')
  lines.push('═══════════════════════════════════════')
  lines.push('')
  
  if (fileInfo) {
    lines.push(`[FILE] ${fileInfo.fileName}`)
    lines.push(`       ${formatFileSize(fileInfo.fileSize)}`)
    lines.push('')
  }
  
  lines.push(`[QUALITY] ${report.analysis.qualityScore}/100`)
  lines.push(`          ${formatTier(report.analysis.qualityTier)}`)
  lines.push(`          Confidence: ${report.analysis.analysisConfidenceLabel}`)
  lines.push('')
  
  lines.push(`[FORMAT] ${report.inspector.codec.display || 'Unknown'}`)
  lines.push(`         ${report.inspector.codec.compressionType || 'Unknown'}`)
  if (report.inspector.technical.bitRateDisplay) {
    lines.push(`         ${report.inspector.technical.bitRateDisplay}`)
  }
  if (report.inspector.technical.sampleRateDisplay) {
    lines.push(`         ${report.inspector.technical.sampleRateDisplay}`)
  }
  if (report.inspector.technical.bitDepth) {
    lines.push(`         ${report.inspector.technical.bitDepth}-bit`)
  }
  lines.push('')
  
  lines.push(`[SOURCE] ${report.analysis.likelySource.displayLabel}`)
  lines.push(`         Confidence: ${report.analysis.likelySource.confidence}%`)
  lines.push('')
  
  if (report.education.whatThisMeans) {
    lines.push('[SUMMARY]')
    lines.push(`${report.education.whatThisMeans}`)
    lines.push('')
  }
  
  lines.push('───────────────────────────────────────')
  lines.push(`Generated: ${new Date().toLocaleString()}`)
  
  return lines.join('\n')
}

/**
 * Generate technical details for clipboard
 */
export function generateTechnicalDetails(report: HiFiNaviReport, fileInfo?: ExtractedFileInfo | null): string {
  const lines: string[] = []
  
  lines.push('NavOS · Audio DOC - Technical Details')
  lines.push('═════════════════════════════════════════')
  lines.push('')
  
  if (fileInfo) {
    lines.push('[File]')
    lines.push(`Filename: ${fileInfo.fileName}`)
    lines.push(`Size: ${formatFileSize(fileInfo.fileSize)}`)
    if (fileInfo.mimeType) {
      lines.push(`MIME Type: ${fileInfo.mimeType}`)
    }
    lines.push('')
  }
  
  lines.push('[Codec]')
  lines.push(`Format: ${report.inspector.codec.display || 'Unknown'}`)
  lines.push(`Raw: ${report.inspector.codec.raw || 'Unknown'}`)
  lines.push(`Compression: ${report.inspector.codec.compressionType || 'Unknown'}`)
  lines.push('')
  
  lines.push('[Technical]')
  lines.push(`Bitrate: ${report.inspector.technical.bitRateDisplay || 'Not available'} (${report.inspector.technical.bitRateBps || 'N/A'} bps)`)
  lines.push(`Sample Rate: ${report.inspector.technical.sampleRateDisplay || 'Not available'} (${report.inspector.technical.sampleRateHz || 'N/A'} Hz)`)
  lines.push(`Bit Depth: ${report.inspector.technical.bitDepth ? `${report.inspector.technical.bitDepth}-bit` : 'Not available'}`)
  lines.push(`Channels: ${report.inspector.technical.channelLayoutDisplay || 'Not available'} (${report.inspector.technical.channels || 'N/A'})`)
  lines.push(`Duration: ${report.inspector.file.durationDisplay || 'Not available'} (${report.inspector.file.durationSeconds?.toFixed(2) || 'N/A'} seconds)`)
  lines.push('')
  
  lines.push('[Tags]')
  lines.push(`Encoder: ${report.inspector.tags.encoder || 'Not detected'}`)
  lines.push(`Album Art: ${report.inspector.tags.hasAlbumArt ? 'Present' : 'Not detected'}`)
  lines.push('')
  
  lines.push('[Quality Analysis]')
  lines.push(`Score: ${report.analysis.qualityScore}/100`)
  lines.push(`Tier: ${report.analysis.qualityTier}`)
  lines.push(`Confidence: ${report.analysis.analysisConfidence}%`)
  lines.push('')
  
  lines.push('[Flags]')
  lines.push(`Hi-Res: ${report.analysis.flags.hiRes ? 'Yes' : 'No'}`)
  lines.push(`Archive Worthy: ${report.analysis.flags.archiveWorthy ? 'Yes' : 'No'}`)
  lines.push(`Audiophile Grade: ${report.analysis.flags.audiophileGrade ? 'Yes' : 'No'}`)
  lines.push(`Collector Grade: ${report.analysis.flags.collectorGrade ? 'Yes' : 'No'}`)
  lines.push('')
  
  lines.push('═════════════════════════════════════════')
  lines.push(`Generated: ${new Date().toISOString()}`)
  
  return lines.join('\n')
}

/**
 * Format file size
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
