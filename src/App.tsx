import { useCallback, useState, useEffect, useRef } from 'react'

import { analyzeFFprobeText } from './engine/analysisEngine'
import {
  extractMetadata,
  metadataToFFprobeText,
  type ExtractedFileInfo,
  type ExtractionResult,
} from './extractor/audioMetadataExtractor'
import {
  generatePdfReport,
  generateTextSummary,
  generateTechnicalDetails,
} from './export/reportExporter'
import type { HiFiNaviReport } from './types/report'
import type { ParsedMetadata } from './types/metadata'
import './App.css'

type InputMode = 'file' | 'ffprobe'

interface FileState {
  file: File | null
  info: ExtractedFileInfo | null
  error: string | null
  isLoading: boolean
}

interface RawMetadataState {
  parsed: ParsedMetadata | null
  ffprobeText: string | null
  musicMetadata: unknown | null
}

const sampleInput = `codec_name=mp3
sample_rate=48000
bit_rate=128000
channels=2`

type Theme = 'dark' | 'light'

// Floating music note type
interface FloatingNote {
  id: number
  symbol: string
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  direction: number
}

// Generate random floating notes
function generateNotes(count: number): FloatingNote[] {
  const symbols = ['♪', '♫', '♬', '♩', '𝄞', '𝄢']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    symbol: symbols[Math.floor(Math.random() * symbols.length)],
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 32 + Math.random() * 48,
    speed: 0.5 + Math.random() * 1.5,
    opacity: 0.3 + Math.random() * 0.4,
    direction: Math.random() * 360,
  }))
}

function App() {
  // Landing page state
  const [showLanding, setShowLanding] = useState(() => {
    return !sessionStorage.getItem('navos-entered')
  })

  // Floating notes for background
  const [floatingNotes, setFloatingNotes] = useState<FloatingNote[]>(() => generateNotes(20))

  // Handle keypress to dismiss landing
  useEffect(() => {
    if (!showLanding) return
    
    const handleKeyPress = () => {
      sessionStorage.setItem('navos-entered', 'true')
      setShowLanding(false)
    }
    
    window.addEventListener('keydown', handleKeyPress)
    window.addEventListener('click', handleKeyPress)
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
      window.removeEventListener('click', handleKeyPress)
    }
  }, [showLanding])

  // Animate floating notes (both landing and main app)
  useEffect(() => {
    const interval = setInterval(() => {
      setFloatingNotes(notes => notes.map(note => {
        const radians = note.direction * (Math.PI / 180)
        let newX = note.x + Math.cos(radians) * note.speed * 0.1
        let newY = note.y + Math.sin(radians) * note.speed * 0.1
        let newDirection = note.direction
        
        // Bounce off edges
        if (newX < 0 || newX > 100) {
          newDirection = 180 - newDirection
          newX = Math.max(0, Math.min(100, newX))
        }
        if (newY < 0 || newY > 100) {
          newDirection = -newDirection
          newY = Math.max(0, Math.min(100, newY))
        }
        
        // Add slight random drift
        newDirection += (Math.random() - 0.5) * 5
        
        return { ...note, x: newX, y: newY, direction: newDirection }
      }))
    }, 50)
    
    return () => clearInterval(interval)
  }, [])

  // Theme state (dark = yellow bg, light = black bg with gold accents)
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('navos-theme')
    return (saved === 'light' || saved === 'dark') ? saved : 'dark'
  })

  // Apply theme class to document
  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light')
    document.documentElement.classList.add(`theme-${theme}`)
    localStorage.setItem('navos-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('file')
  
  // File input state
  const [fileState, setFileState] = useState<FileState>({
    file: null,
    info: null,
    error: null,
    isLoading: false,
  })
  
  // FFprobe text input state
  const [rawText, setRawText] = useState(sampleInput)
  
  // Analysis result
  const [report, setReport] = useState<HiFiNaviReport | null>(null)
  
  // Raw metadata for Advanced section
  const [rawMetadata, setRawMetadata] = useState<RawMetadataState>({
    parsed: null,
    ffprobeText: null,
    musicMetadata: null,
  })
  
  // Advanced panel open state
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  
  // Raw metadata view mode
  const [rawViewMode, setRawViewMode] = useState<'formatted' | 'json'>('formatted')
  
  // Drag state for visual feedback
  const [isDragging, setIsDragging] = useState(false)

  // Copy feedback state
  const [copyFeedback, setCopyFeedback] = useState<'summary' | 'technical' | null>(null)

  // Support dialog state
  const [showSupport, setShowSupport] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [floatingHearts, setFloatingHearts] = useState<Array<{ id: number; x: number; y: number; color: string; size: number }>>([])

  // Audio player state
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Spawn floating heart animation
  const spawnHeart = useCallback(() => {
    const colors = ['#ff2d55', '#e0245e', '#ff375f', '#ff6482', '#ec4899', '#f43f5e', '#a855f7', '#fbbf24']
    const newHeart = {
      id: Date.now() + Math.random(),
      x: 50 + (Math.random() - 0.5) * 40,
      y: 50,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 20 + Math.random() * 16,
    }
    setFloatingHearts(prev => [...prev, newHeart])
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h.id !== newHeart.id))
    }, 2000)
  }, [])

  // Album art URL
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  // Handle file selection
  const handleFile = useCallback(async (file: File) => {
    // Revoke previous album art URL to prevent memory leaks
    if (albumArtUrl) {
      URL.revokeObjectURL(albumArtUrl)
      setAlbumArtUrl(null)
    }
    
    // Revoke previous audio URL and reset player
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setAudioUrl(URL.createObjectURL(file))
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    
    setFileState({
      file,
      info: null,
      error: null,
      isLoading: true,
    })
    setReport(null)
    setRawMetadata({ parsed: null, ffprobeText: null, musicMetadata: null })
    setIsAdvancedOpen(false)
    
    const result = await extractMetadata(file)
    
    if (result.success) {
      const extractionResult = result as ExtractionResult
      const ffprobeText = metadataToFFprobeText(extractionResult.metadata)
      const analysisReport = analyzeFFprobeText(ffprobeText)
      
      setFileState({
        file,
        info: extractionResult.fileInfo,
        error: null,
        isLoading: false,
      })
      setReport(analysisReport)
      setRawMetadata({
        parsed: extractionResult.metadata,
        ffprobeText,
        musicMetadata: extractionResult.rawMetadata,
      })
      // Store album art if present
      if (extractionResult.albumArtUrl) {
        setAlbumArtUrl(extractionResult.albumArtUrl)
      }
    } else {
      setFileState({
        file,
        info: result.fileInfo || null,
        error: result.error,
        isLoading: false,
      })
    }
  }, [])

  // Handle file input change
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  // Handle drag events
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    
    const file = event.dataTransfer.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  // Handle FFprobe text analysis
  const handleFFprobeAnalyze = useCallback(() => {
    const analysisReport = analyzeFFprobeText(rawText)
    setReport(analysisReport)
    setFileState({ file: null, info: null, error: null, isLoading: false })
    setRawMetadata({
      parsed: null,
      ffprobeText: rawText,
      musicMetadata: null,
    })
  }, [rawText])

  // Copy text to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }, [])

  // Export PDF report
  const handleExportPdf = useCallback(() => {
    if (!report) return
    generatePdfReport({ report, fileInfo: fileState.info })
  }, [report, fileState.info])

  // Copy summary to clipboard
  const handleCopySummary = useCallback(async () => {
    if (!report) return
    const text = generateTextSummary(report, fileState.info)
    await copyToClipboard(text)
    setCopyFeedback('summary')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [report, fileState.info, copyToClipboard])

  // Copy technical details to clipboard
  const handleCopyTechnical = useCallback(async () => {
    if (!report) return
    const text = generateTechnicalDetails(report, fileState.info)
    await copyToClipboard(text)
    setCopyFeedback('technical')
    setTimeout(() => setCopyFeedback(null), 2000)
  }, [report, fileState.info, copyToClipboard])

  // Audio player handlers
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }, [])

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }, [])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }, [])

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Format tier for display
  const formatTier = (tier: string): string => {
    return tier.replace(/_/g, ' ')
  }

  // Get tier class for styling
  const getTierClass = (tier: string): string => {
    return `tier-badge ${tier}`
  }

  // Render a reason with appropriate styling
  const renderReason = (reason: string, index: number) => {
    const isPositive = reason.startsWith('✓')
    const isConcern = reason.startsWith('⚠')
    const isNeutral = reason.startsWith('•')
    
    // Extract text (skip the icon character)
    let text = reason
    let type: 'positive' | 'concern' | 'neutral' = 'neutral'
    
    if (isPositive) {
      text = reason.slice(1).trim()
      type = 'positive'
    } else if (isConcern) {
      text = reason.slice(1).trim()
      type = 'concern'
    } else if (isNeutral) {
      text = reason.slice(1).trim()
    }
    
    return (
      <li key={index} className={`reason-item reason-${type}`}>
        {text}
      </li>
    )
  }

  // Get technical field explanation
  const getTechnicalExplanation = (field: string, value: string | number | undefined): string | null => {
    if (value === undefined || value === null) return null
    
    switch (field) {
      case 'sampleRate': {
        const rate = typeof value === 'number' ? value : parseInt(value as string, 10)
        if (rate >= 88200) return 'High-resolution sample rate'
        if (rate === 44100) return 'CD standard sample rate'
        if (rate === 48000) return 'Professional audio standard'
        if (rate < 44100) return 'Below CD quality'
        return null
      }
      case 'bitDepth': {
        const depth = typeof value === 'number' ? value : parseInt(value as string, 10)
        if (depth >= 24) return 'High-resolution bit depth'
        if (depth === 16) return 'CD standard bit depth'
        if (depth < 16) return 'Below CD quality'
        return null
      }
      case 'bitRate': {
        const rate = typeof value === 'number' ? value : parseInt(value as string, 10)
        if (rate >= 320000) return 'High bitrate (near-transparent)'
        if (rate >= 256000) return 'Good quality bitrate'
        if (rate >= 192000) return 'Standard quality bitrate'
        if (rate < 128000) return 'Low bitrate (noticeable loss)'
        return null
      }
      case 'compressionType': {
        const type = String(value).toLowerCase()
        if (type === 'lossless') return 'No audio data is discarded'
        if (type === 'uncompressed') return 'Raw audio, largest file size'
        if (type === 'lossy') return 'Some audio data discarded'
        return null
      }
      default:
        return null
    }
  }

  // Format metadata value with status indicator
  const formatMetadataValue = (value: unknown, fallback = 'Not available'): { text: string; status: 'detected' | 'unavailable' | 'inferred' } => {
    if (value === undefined || value === null || value === '') {
      return { text: fallback, status: 'unavailable' }
    }
    return { text: String(value), status: 'detected' }
  }

  // Render formatted raw metadata
  const renderFormattedMetadata = () => {
    if (!rawMetadata.parsed && !rawMetadata.ffprobeText) {
      return <p className="metadata-empty">No metadata available</p>
    }

    if (rawMetadata.ffprobeText && !rawMetadata.parsed) {
      // FFprobe text mode - just show the text
      return (
        <pre className="metadata-raw">{rawMetadata.ffprobeText}</pre>
      )
    }

    const parsed = rawMetadata.parsed!
    const entries = [
      { key: 'Codec', value: parsed.codec_name },
      { key: 'Container', value: parsed.format_name },
      { key: 'Sample Rate', value: parsed.sample_rate ? `${parsed.sample_rate} Hz` : undefined },
      { key: 'Bit Rate', value: parsed.bit_rate ? `${Math.round(parsed.bit_rate / 1000)} kbps` : undefined },
      { key: 'Bit Depth', value: parsed.bits_per_raw_sample ? `${parsed.bits_per_raw_sample}-bit` : undefined },
      { key: 'Channels', value: parsed.channels },
      { key: 'Duration', value: parsed.duration ? `${parsed.duration.toFixed(2)} seconds` : undefined },
      { key: 'Encoder', value: parsed.encoder },
      { key: 'Album Art', value: parsed.has_album_art !== undefined ? (parsed.has_album_art ? 'Present' : 'Not detected') : undefined },
      { key: 'Filename', value: parsed.filename },
    ]

    return (
      <dl className="metadata-list">
        {entries.map(({ key, value }) => {
          const formatted = formatMetadataValue(value)
          return (
            <div key={key} className="metadata-item">
              <dt>{key}</dt>
              <dd className={`metadata-status-${formatted.status}`}>
                {formatted.text}
                {formatted.status === 'unavailable' && (
                  <span className="metadata-status-badge">Not detected</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    )
  }

  // Render JSON metadata view
  const renderJsonMetadata = () => {
    const data = rawMetadata.musicMetadata || rawMetadata.parsed || rawMetadata.ffprobeText
    if (!data) {
      return <p className="metadata-empty">No metadata available</p>
    }
    
    const jsonString = JSON.stringify(data, null, 2)
    return (
      <pre className="metadata-json">{jsonString}</pre>
    )
  }

  // Landing page
  if (showLanding) {
    return (
      <div className="landing-page">
        {/* Floating music notes on landing */}
        <div className="floating-notes landing-notes" aria-hidden="true">
          {floatingNotes.map(note => (
            <span
              key={note.id}
              className="floating-note"
              style={{
                left: `${note.x}%`,
                top: `${note.y}%`,
                fontSize: `${note.size}px`,
                opacity: note.opacity,
              }}
            >
              {note.symbol}
            </span>
          ))}
        </div>
        <img src="/landing.png" alt="NavOS Audio DOC" className="landing-image" />
        <p className="landing-hint">PRESS ANY KEY TO CONTINUE</p>
      </div>
    )
  }

  return (
    <>
      {/* Floating music notes background */}
      <div className="floating-notes" aria-hidden="true">
        {floatingNotes.map(note => (
          <span
            key={note.id}
            className="floating-note"
            style={{
              left: `${note.x}%`,
              top: `${note.y}%`,
              fontSize: `${note.size}px`,
              opacity: note.opacity,
            }}
          >
            {note.symbol}
          </span>
        ))}
      </div>
      
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>NavOS · Audio DOC</h1>
            <p>Analyze and understand your audio files</p>
          </div>
          <div className="header-actions">
            <button 
              type="button"
              className="support-btn"
              onClick={() => setShowSupport(true)}
              title="Support this project"
            >
              <svg className="heart-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              Support
            </button>
            <button 
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? 'LIGHT' : 'DARK'}
            </button>
          </div>
        </header>

      {/* Input Section */}
      <section className="input-section">
        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button 
            type="button"
            className={inputMode === 'file' ? 'active' : ''}
            onClick={() => setInputMode('file')}
          >
            Analyze File
          </button>
          <button 
            type="button"
            className={inputMode === 'ffprobe' ? 'active' : ''}
            onClick={() => setInputMode('ffprobe')}
          >
            FFprobe Input
          </button>
        </div>

        {/* File Upload Mode */}
        {inputMode === 'file' && (
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${fileState.error ? 'error' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                document.getElementById('file-input')?.click()
              }
            }}
            aria-label="Upload audio file"
          >
            {fileState.isLoading ? (
              <div className="drop-zone-content">
                <div className="loading-spinner" aria-hidden="true" />
                <p>Analyzing audio file...</p>
              </div>
            ) : fileState.info && !fileState.error ? (
              <div className="drop-zone-content file-info">
                {albumArtUrl && (
                  <img src={albumArtUrl} alt="Album artwork" className="file-album-art" />
                )}
                {!albumArtUrl && (
                  <div className="file-icon" aria-hidden="true"></div>
                )}
                <p className="file-name">{fileState.info.fileName}</p>
                <p className="file-details">
                  {formatFileSize(fileState.info.fileSize)}
                  {fileState.info.mimeType && ` · ${fileState.info.mimeType}`}
                </p>
                <button 
                  type="button" 
                  className="change-file-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    document.getElementById('file-input')?.click()
                  }}
                >
                  Choose different file
                </button>
                
                {/* Audio Player */}
                {audioUrl && (
                  <div className="audio-player" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="play-pause-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePlayPause()
                      }}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      )}
                    </button>
                    <div className="audio-progress" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        onClick={(e) => e.stopPropagation()}
                        className="audio-slider"
                        aria-label="Seek"
                      />
                      <div className="audio-time">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={handleAudioEnded}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="drop-zone-content">
                <div className="drop-icon" aria-hidden="true"></div>
                <p className="drop-primary">Drop your audio file here</p>
                <p className="drop-secondary">or click to choose a file</p>
                <p className="drop-formats">MP3 · FLAC · WAV · M4A · AAC · OGG · Opus</p>
                {fileState.error && (
                  <p className="drop-error" role="alert">{fileState.error}</p>
                )}
              </div>
            )}
            <input
              id="file-input"
              type="file"
              accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus"
              onChange={handleFileInputChange}
              className="file-input-hidden"
              aria-label="Choose audio file"
            />
          </div>
        )}

        {/* FFprobe Paste Mode */}
        {inputMode === 'ffprobe' && (
          <div className="ffprobe-input">
            <p className="ffprobe-hint">
              Paste raw FFprobe or metadata output for direct analysis
            </p>
            <textarea
              aria-label="FFprobe output"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              spellCheck={false}
              placeholder="codec_name=mp3&#10;sample_rate=44100&#10;bit_rate=320000&#10;channels=2"
            />
            <button type="button" onClick={handleFFprobeAnalyze}>
              Analyze
            </button>
          </div>
        )}
      </section>

      {/* Results Section */}
      {report && (
        <section className="report-grid" aria-label="Analysis results">
          {/* Export Actions */}
          <div className="export-actions" style={{ gridColumn: 'span 3' }}>
            <button
              type="button"
              className="export-btn export-btn-primary"
              onClick={handleExportPdf}
              aria-label="Save as PDF"
            >
              Save PDF Report
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={handleCopySummary}
              aria-label="Copy summary"
            >
              {copyFeedback === 'summary' ? 'Copied' : 'Copy Summary'}
            </button>
            <button
              type="button"
              className="export-btn"
              onClick={handleCopyTechnical}
              aria-label="Copy technical details"
            >
              {copyFeedback === 'technical' ? 'Copied' : 'Copy Technical'}
            </button>
          </div>

          {/* Quality Result - Primary */}
          <article className="card">
            <p className="section-kicker">Quality</p>
            <h2>Analysis Result</h2>
            <div className="score-row">
              <strong>{report.analysis.qualityScore}</strong>
              <span>/ 100</span>
            </div>
            <p>
              <span className={getTierClass(report.analysis.qualityTier)}>
                {formatTier(report.analysis.qualityTier)}
              </span>
            </p>
            
            {/* Confidence indicator */}
            <div className="confidence-bar">
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Confidence
              </span>
              <div className="confidence-track">
                <div 
                  className="confidence-fill" 
                  style={{ width: `${report.analysis.analysisConfidence}%` }}
                />
              </div>
              <span className="confidence-label">
                {report.analysis.analysisConfidenceLabel}
              </span>
            </div>
            
            {/* Summary */}
            <p className="summary">{report.analysis.summary}</p>
            
            {/* Why - Structured reasons */}
            <h3 style={{ fontSize: '14px', margin: '16px 0 12px', color: 'var(--color-text-primary)' }}>
              Why this result?
            </h3>
            <ul>
              {report.analysis.reasons.map((reason, i) => renderReason(reason, i))}
            </ul>
          </article>

          {/* Likely Source - Secondary */}
          <article className="card">
            <p className="section-kicker">Source</p>
            <h2>Likely Source</h2>
            <dl>
              <div>
                <dt>Classification</dt>
                <dd>{report.analysis.likelySource.displayLabel}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{report.analysis.likelySource.confidenceLabel} ({report.analysis.likelySource.confidence}%)</dd>
              </div>
            </dl>
            
            <h3 style={{ fontSize: '14px', margin: '16px 0 12px', color: 'var(--color-text-primary)' }}>
              Supporting evidence
            </h3>
            <ul>
              {report.analysis.likelySource.reasons.map((reason, i) => renderReason(reason, i))}
            </ul>
            
            {/* Alternative sources if low confidence */}
            {report.analysis.likelySource.alternatives && report.analysis.likelySource.alternatives.length > 0 && (
              <>
                <h3 style={{ fontSize: '14px', margin: '16px 0 8px', color: 'var(--color-text-muted)' }}>
                  Other possibilities
                </h3>
                <ul>
                  {report.analysis.likelySource.alternatives.map((alt, i) => (
                    <li key={i} style={{ color: 'var(--color-text-muted)' }}>
                      {alt.displayLabel} ({alt.confidence}%)
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>

          {/* Technical Details */}
          <article className="card">
            <p className="section-kicker">Technical</p>
            <h2>Audio Inspector</h2>
            <dl>
              <div>
                <dt>Format</dt>
                <dd>{report.inspector.codec.display || 'Not available'}</dd>
              </div>
              <div>
                <dt>Compression</dt>
                <dd>
                  {report.inspector.codec.compressionType || 'Unknown'}
                  {getTechnicalExplanation('compressionType', report.inspector.codec.compressionType) && (
                    <span className="tech-hint">
                      {getTechnicalExplanation('compressionType', report.inspector.codec.compressionType)}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Bitrate</dt>
                <dd>
                  {report.inspector.technical.bitRateDisplay || 'Not available'}
                  {report.inspector.technical.bitRateBps && getTechnicalExplanation('bitRate', report.inspector.technical.bitRateBps) && (
                    <span className="tech-hint">
                      {getTechnicalExplanation('bitRate', report.inspector.technical.bitRateBps)}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Sample Rate</dt>
                <dd>
                  {report.inspector.technical.sampleRateDisplay || 'Not available'}
                  {report.inspector.technical.sampleRateHz && getTechnicalExplanation('sampleRate', report.inspector.technical.sampleRateHz) && (
                    <span className="tech-hint">
                      {getTechnicalExplanation('sampleRate', report.inspector.technical.sampleRateHz)}
                    </span>
                  )}
                </dd>
              </div>
              {report.inspector.technical.bitDepth && (
                <div>
                  <dt>Bit Depth</dt>
                  <dd>
                    {report.inspector.technical.bitDepth}-bit
                    {getTechnicalExplanation('bitDepth', report.inspector.technical.bitDepth) && (
                      <span className="tech-hint">
                        {getTechnicalExplanation('bitDepth', report.inspector.technical.bitDepth)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>Channels</dt>
                <dd>{report.inspector.technical.channelLayoutDisplay || 'Not available'}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{report.inspector.file.durationDisplay || 'Not available'}</dd>
              </div>
              {report.inspector.tags.encoder && (
                <div>
                  <dt>Encoder</dt>
                  <dd style={{ textTransform: 'none' }}>{report.inspector.tags.encoder}</dd>
                </div>
              )}
              <div>
                <dt>Album Art</dt>
                <dd>{report.inspector.tags.hasAlbumArt ? 'Present' : 'Not detected'}</dd>
              </div>
            </dl>
            
            {/* Flags summary */}
            {(report.analysis.flags.archiveWorthy || report.analysis.flags.audiophileGrade || report.analysis.flags.hiRes) && (
              <div style={{ 
                marginTop: '16px', 
                padding: '12px', 
                background: 'var(--color-bg-tertiary)', 
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px'
              }}>
                {report.analysis.flags.hiRes && <p style={{ margin: '0 0 4px', color: 'var(--color-accent)' }}>✓ Hi-Res Audio</p>}
                {report.analysis.flags.archiveWorthy && <p style={{ margin: '0 0 4px', color: 'var(--color-positive)' }}>✓ Archive worthy</p>}
                {report.analysis.flags.audiophileGrade && <p style={{ margin: 0, color: 'var(--color-positive)' }}>✓ Audiophile grade</p>}
              </div>
            )}

            {/* File Information */}
            {fileState.info && (
              <>
                <h3 style={{ fontSize: '14px', margin: '20px 0 8px', color: 'var(--color-text-primary)' }}>
                  File Information
                </h3>
                <dl>
                  <div>
                    <dt>Filename</dt>
                    <dd style={{ textTransform: 'none', wordBreak: 'break-all' }}>{fileState.info.fileName}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatFileSize(fileState.info.fileSize)}</dd>
                  </div>
                  {fileState.info.mimeType && (
                    <div>
                      <dt>MIME Type</dt>
                      <dd style={{ textTransform: 'none' }}>{fileState.info.mimeType}</dd>
                    </div>
                  )}
                </dl>
              </>
            )}
          </article>

          {/* What This Means - Concise interpretation */}
          {report.education.whatThisMeans && (
            <article className="card what-this-means" style={{ gridColumn: 'span 3' }}>
              <p className="section-kicker">Summary</p>
              <h2>In Simple Terms</h2>
              <p className="interpretation">{report.education.whatThisMeans}</p>
            </article>
          )}

          {/* Learn More */}
          {(report.education.topics.length > 0 || report.education.guidance) && (
            <article className="card" style={{ gridColumn: 'span 3' }}>
              <p className="section-kicker">Learn More</p>
              <h2>Understanding Your Audio</h2>
              
              {/* Educational Topics */}
              {report.education.topics.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {report.education.topics.map((topic) => (
                    <section className="topic" key={topic.id}>
                      <h3>{topic.title}</h3>
                      <p>{topic.body}</p>
                    </section>
                  ))}
                </div>
              )}
              
              {report.education.suggestedUpgradePath && (
                <p className="summary" style={{ marginTop: '16px' }}>
                  {report.education.suggestedUpgradePath}
                </p>
              )}

              {/* Guidance Section */}
              {report.education.guidance && report.education.guidance.length > 0 && (
                <div className="guidance-section">
                  <h3>What Should I Look For?</h3>
                  <ul className="guidance-list">
                    {report.education.guidance.map((item, index) => (
                      <li key={index} className={`guidance-item guidance-${item.type}`}>
                        <span className="guidance-label">
                          {item.type === 'archive' && '[ARCHIVE]'}
                          {item.type === 'everyday' && '[DAILY]'}
                          {item.type === 'hires' && '[HI-RES]'}
                        </span>
                        <span className="guidance-text">{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )}

          {/* Advanced Section - Collapsible */}
          <article className="card advanced-section" style={{ gridColumn: 'span 3' }}>
            <button
              type="button"
              className="advanced-toggle"
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              aria-expanded={isAdvancedOpen}
              aria-controls="advanced-content"
            >
              <p className="section-kicker">Advanced</p>
              <h2>
                Technical Details
                <span className="toggle-icon" aria-hidden="true">
                  {isAdvancedOpen ? '−' : '+'}
                </span>
              </h2>
            </button>
            
            {isAdvancedOpen && (
              <div id="advanced-content" className="advanced-content">
                {/* Quality Factors */}
                <section className="advanced-subsection">
                  <h3>Quality Factors</h3>
                  <p className="advanced-description">
                    These factors determined the quality score and tier:
                  </p>
                  <ul className="quality-factors">
                    {report.analysis.reasons.map((reason, i) => renderReason(reason, i))}
                  </ul>
                </section>

                {/* Source Estimation Reasoning */}
                <section className="advanced-subsection">
                  <h3>Source Estimation</h3>
                  <p className="advanced-description">
                    The likely source classification is based on metadata patterns. 
                    Source provenance cannot be verified from metadata alone.
                  </p>
                  <dl className="source-factors">
                    <div>
                      <dt>Primary Estimate</dt>
                      <dd>{report.analysis.likelySource.displayLabel}</dd>
                    </div>
                    <div>
                      <dt>Confidence Level</dt>
                      <dd>{report.analysis.likelySource.confidenceLabel} ({report.analysis.likelySource.confidence}%)</dd>
                    </div>
                  </dl>
                  <h4>Evidence</h4>
                  <ul>
                    {report.analysis.likelySource.reasons.map((reason, i) => renderReason(reason, i))}
                  </ul>
                </section>

                {/* Raw Metadata */}
                <section className="advanced-subsection">
                  <div className="metadata-header">
                    <h3>Raw Metadata</h3>
                    <div className="metadata-controls">
                      <div className="view-toggle">
                        <button
                          type="button"
                          className={rawViewMode === 'formatted' ? 'active' : ''}
                          onClick={() => setRawViewMode('formatted')}
                        >
                          Formatted
                        </button>
                        <button
                          type="button"
                          className={rawViewMode === 'json' ? 'active' : ''}
                          onClick={() => setRawViewMode('json')}
                        >
                          JSON
                        </button>
                      </div>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => {
                          const text = rawViewMode === 'json'
                            ? JSON.stringify(rawMetadata.musicMetadata || rawMetadata.parsed || rawMetadata.ffprobeText, null, 2)
                            : rawMetadata.ffprobeText || ''
                          copyToClipboard(text)
                        }}
                        aria-label="Copy metadata"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className="advanced-description">
                    {rawViewMode === 'formatted' 
                      ? 'Extracted metadata fields from the audio file:'
                      : 'Complete metadata in JSON format:'}
                  </p>
                  <div className="metadata-content">
                    {rawViewMode === 'formatted' ? renderFormattedMetadata() : renderJsonMetadata()}
                  </div>
                </section>

                {/* Metadata Availability Summary */}
                <section className="advanced-subsection">
                  <h3>Metadata Availability</h3>
                  <p className="advanced-description">
                    Analysis confidence is affected by available metadata. Missing fields may reduce accuracy.
                  </p>
                  <div className="availability-grid">
                    <div className={`availability-item ${report.inspector.codec.raw ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.codec.raw ? '✓' : '○'}</span>
                      <span>Codec</span>
                    </div>
                    <div className={`availability-item ${report.inspector.technical.bitRateBps ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.technical.bitRateBps ? '✓' : '○'}</span>
                      <span>Bitrate</span>
                    </div>
                    <div className={`availability-item ${report.inspector.technical.sampleRateHz ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.technical.sampleRateHz ? '✓' : '○'}</span>
                      <span>Sample Rate</span>
                    </div>
                    <div className={`availability-item ${report.inspector.technical.bitDepth ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.technical.bitDepth ? '✓' : '○'}</span>
                      <span>Bit Depth</span>
                    </div>
                    <div className={`availability-item ${report.inspector.technical.channels ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.technical.channels ? '✓' : '○'}</span>
                      <span>Channels</span>
                    </div>
                    <div className={`availability-item ${report.inspector.tags.encoder ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.tags.encoder ? '✓' : '○'}</span>
                      <span>Encoder</span>
                    </div>
                    <div className={`availability-item ${report.inspector.file.durationSeconds ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.file.durationSeconds ? '✓' : '○'}</span>
                      <span>Duration</span>
                    </div>
                    <div className={`availability-item ${report.inspector.tags.hasAlbumArt !== undefined ? 'available' : 'unavailable'}`}>
                      <span className="availability-indicator">{report.inspector.tags.hasAlbumArt !== undefined ? '✓' : '○'}</span>
                      <span>Album Art</span>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </article>
        </section>
      )}

      {/* Empty state when no analysis */}
      {!report && inputMode === 'file' && !fileState.isLoading && (
        <section className="empty-state">
          <p>Drop an audio file above to see its quality analysis</p>
        </section>
      )}

      {/* Support Dialog */}
      {showSupport && (
        <div className="support-overlay" onClick={() => setShowSupport(false)}>
          <div className="support-dialog" onClick={e => e.stopPropagation()}>
            {/* Floating hearts container */}
            <div className="floating-hearts-container">
              {floatingHearts.map(heart => (
                <div
                  key={heart.id}
                  className="floating-heart"
                  style={{
                    left: `${heart.x}%`,
                    color: heart.color,
                    fontSize: `${heart.size}px`,
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </div>
              ))}
            </div>

            <div className="support-header">
              <h2>SUPPORT THIS PROJECT</h2>
              <button type="button" className="close-btn" onClick={() => setShowSupport(false)}>X</button>
            </div>

            <div className="support-content">
              <button type="button" className="heart-badge" onClick={spawnHeart}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </button>
              <p className="support-text">Thanks for using this project! If you find it useful, every bit of support helps.</p>

              <div className="payment-grid">
                <a href="https://razorpay.me/@navin007" target="_blank" rel="noopener noreferrer" className="payment-link">
                  <span className="payment-icon">IN</span>
                  <div className="payment-info">
                    <span className="payment-title">Razorpay</span>
                    <span className="payment-subtitle">@navin007</span>
                  </div>
                  <span className="payment-action">PAY</span>
                </a>

                <a href="https://paypal.me/Navin007143" target="_blank" rel="noopener noreferrer" className="payment-link">
                  <span className="payment-icon">GL</span>
                  <div className="payment-info">
                    <span className="payment-title">PayPal</span>
                    <span className="payment-subtitle">@Navin007143</span>
                  </div>
                  <span className="payment-action">PAY</span>
                </a>

                <a href="https://github.com/sponsors/Xx7Navin7xX" target="_blank" rel="noopener noreferrer" className="payment-link">
                  <span className="payment-icon">GH</span>
                  <div className="payment-info">
                    <span className="payment-title">GitHub Sponsors</span>
                    <span className="payment-subtitle">@Xx7Navin7xX</span>
                  </div>
                  <span className="payment-action">SPONSOR</span>
                </a>

                <a href="https://ko-fi.com/navin007" target="_blank" rel="noopener noreferrer" className="payment-link">
                  <span className="payment-icon">KO</span>
                  <div className="payment-info">
                    <span className="payment-title">Ko-fi</span>
                    <span className="payment-subtitle">@navin007</span>
                  </div>
                  <span className="payment-action">SUPPORT</span>
                </a>
              </div>

              <div className="upi-section">
                <button 
                  type="button" 
                  className="upi-qr-toggle"
                  onClick={() => setShowQR(!showQR)}
                >
                  {showQR ? 'HIDE QR' : 'SHOW UPI QR'}
                </button>
                {showQR && (
                  <div className="upi-qr">
                    <img src="/GooglePay_QR.png" alt="UPI QR Code" />
                  </div>
                )}
                <div className="upi-id">
                  <span className="upi-label">UPI ID:</span>
                  <code className="upi-code">navinbalaji004@okhdfcbank</code>
                  <button 
                    type="button" 
                    className="copy-upi-btn"
                    onClick={() => {
                      navigator.clipboard.writeText('navinbalaji004@okhdfcbank')
                    }}
                  >
                    COPY
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  )
}

export default App
