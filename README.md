# NavOS - Audio DOC

A browser-based audio file analyzer that examines metadata and spectral content to assess audio quality, identify likely sources, and provide educational context — all without uploading files to any server.

<img width="1672" height="941" alt="Audio_Doc" src="https://github.com/user-attachments/assets/05dcdac5-6e9c-4a6c-8f02-e6b60044a432" />

## Features

- **Quality Analysis**: Scores audio files based on codec, bitrate, sample rate, and bit depth
- **Source Estimation**: Identifies likely provenance (CD rip, streaming, Hi-Res download, etc.)
- **Spectral Analysis**: SoX-compatible spectrograms with full frequency visualization
- **Hi-Res Audio Support**: Native sample rate decoding up to 192 kHz — no resampling artifacts
- **Educational Content**: Contextual explanations about audio formats and quality
- **Export Options**: PDF reports, copy summary, and technical details clipboard export
- **Privacy-First**: All processing happens in your browser — files never leave your device

## Spectral Analysis

The spectrogram display matches Internet Archive / SoX reference output:

- **Full dynamic range**: 0 to -120 dBFS (120 dB)
- **SoX default colormap**: Dark blue → purple → magenta → red → orange → yellow → white
- **Hi-Res support**: Analyzes up to 96 kHz frequencies (192 kHz sample rate)
- **Sample rate preservation**: Creates AudioContext at the file's native sample rate to prevent browser resampling
- **Stereo display**: Stacked L/R channel visualization

### Sample Rate Integrity

| Source Sample Rate | Analysis Rate | Max Frequency |
|-------------------|---------------|---------------|
| 44.1 kHz | 44.1 kHz | 22.05 kHz |
| 48 kHz | 48 kHz | 24 kHz |
| 88.2 kHz | 88.2 kHz | 44.1 kHz |
| 96 kHz | 96 kHz | 48 kHz |
| 176.4 kHz | 176.4 kHz | 88.2 kHz |
| 192 kHz | 192 kHz | 96 kHz |

## Supported Formats

- MP3 (all bitrates)
- FLAC (including Hi-Res 24-bit up to 192 kHz)
- WAV
- M4A / AAC
- OGG / Vorbis
- Opus
- AIFF

## Usage

1. Visit the deployed site or run locally
2. Drop an audio file into the upload zone (or click to select)
3. View the analysis results including:
   - Quality score and tier
   - Likely source classification
   - Technical audio specifications
   - Spectral analysis with SoX-compatible spectrogram
   - Educational context
4. Export results as PDF or copy to clipboard

<img width="949" height="864" alt="image" src="https://github.com/user-attachments/assets/1549f040-ed06-406f-a660-92b2a16e7700" />

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Run Tests

```bash
npm test
```

### Build for Production

```bash
npm run build
```

Output goes to `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Architecture

```
src/
├── engine/           # Analysis logic
│   ├── analysisEngine.ts      # Main orchestrator
│   ├── qualityScorer.ts       # Quality scoring algorithm
│   ├── sourceEstimator.ts     # Source provenance detection
│   ├── spectralAnalyzer.ts    # FFT spectral analysis
│   └── educationSelector.ts   # Contextual education selection
├── workers/          # Web Workers
│   └── spectralWorker.ts      # Background spectral processing
├── components/       # React components
│   └── analysis/
│       ├── SpectrogramViewer.tsx      # SoX-compatible spectrogram
│       └── SpectralAnalysisSection.tsx # Spectral results UI
├── extractor/        # File metadata extraction
├── parser/           # FFprobe-format parser
├── normalizer/       # Metadata normalization
├── export/           # PDF and text export
├── rules/            # JSON-driven scoring rules
├── types/            # TypeScript definitions
│   └── spectral.ts            # Spectral analysis types
└── App.tsx           # Main UI component
```

## Technical Details

### Spectrogram Parameters

- **FFT Size**: 4096 samples
- **Window**: Hann
- **Overlap**: 75%
- **Dynamic Range**: 120 dB (0 to -120 dBFS)
- **Colormap**: SoX default palette

### Browser Compatibility

Sample rate preservation requires `AudioContext({ sampleRate: N })`:
- Chrome 55+
- Firefox 50+
- Safari 14.1+
- Edge 79+

## File Size Limits

- Maximum file size: 500 MB
- Files are processed entirely in-browser
- Large files may take longer to analyze

## Privacy

NavOS Audio DOC processes files entirely in your browser:

- No files are uploaded to any server
- No analytics or tracking
- No user accounts required
- Works offline after initial page load

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

NavOS-OpenSource

- GitHub: https://github.com/sponsors/NavOS-OpenSource

## Support

If you find this tool useful, consider supporting development:

[![Sponsor](https://img.shields.io/badge/Sponsor-❤-red)](https://github.com/sponsors/NavOS-OpenSource)

## Credits

Built with:
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [music-metadata](https://github.com/borewit/music-metadata)
- [jsPDF](https://github.com/parallax/jsPDF)
