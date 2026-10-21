import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves this repo at https://<domain>/<repo-name>/, so every
// asset URL has to start with the repo name. package.json "name" is the repo name.
export default defineConfig({
  base: `/${pkg.name}/`,
  plugins: [react()],
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {},
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx,js,jsx}'], exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**'] },
  // the ledger in its own chunk, so a code change doesn't refetch 1.7MB of data and a data refresh doesn't refetch the app
  build: {
    chunkSizeWarningLimit: 8000,
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'ledger', test: /src[\\/]data[\\/]players\.json/ }] } },
    },
  },
})
