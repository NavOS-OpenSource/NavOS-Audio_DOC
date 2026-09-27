# NavOS · Audio DOC

A browser-based audio file analyzer that examines metadata to assess audio quality, identify likely sources, and provide educational context — all without uploading files to any server.

![NavOS Audio DOC](./src/assets/hero.png)

## Features

- **Quality Analysis**: Scores audio files based on codec, bitrate, sample rate, and bit depth
- **Source Estimation**: Identifies likely provenance (CD rip, streaming, Hi-Res download, etc.)
- **Educational Content**: Contextual explanations about audio formats and quality
- **Export Options**: PDF reports, copy summary, and technical details clipboard export
- **Privacy-First**: All processing happens in your browser — files never leave your device

## Supported Formats

- MP3 (all bitrates)
- FLAC (including Hi-Res 24-bit)
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
   - Educational context
4. Export results as PDF or copy to clipboard

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

## Deployment

### GitHub Pages

1. Build the project: `npm run build`
2. The `dist/` folder contains static files ready for deployment
3. Configure GitHub Pages to serve from the `dist/` folder or use a GitHub Action

For a custom subdirectory (e.g., `username.github.io/repo-name/`), update `base` in `vite.config.ts`:

```ts
base: '/repo-name/',
```

### Other Static Hosts

The build output is a standard static site (HTML + JS + CSS) that works on any static hosting:

- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront
- Any web server

## Architecture

```
src/
├── engine/           # Analysis logic
│   ├── analysisEngine.ts      # Main orchestrator
│   ├── qualityScorer.ts       # Quality scoring algorithm
│   ├── sourceEstimator.ts     # Source provenance detection
│   └── educationSelector.ts   # Contextual education selection
├── extractor/        # File metadata extraction
├── parser/           # FFprobe-format parser
├── normalizer/       # Metadata normalization
├── export/           # PDF and text export
├── rules/            # JSON-driven scoring rules
├── types/            # TypeScript definitions
└── App.tsx           # Main UI component
```

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

Private project. All rights reserved.

## Credits

Built with:
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [music-metadata](https://github.com/borewit/music-metadata)
- [jsPDF](https://github.com/parallax/jsPDF)
