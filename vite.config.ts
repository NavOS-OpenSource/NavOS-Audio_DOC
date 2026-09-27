import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages deployment
  // Change this to your repo name: '/<repo-name>/' or '/' for custom domain
  base: './',
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
})
