import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER_PORT = Number(process.env.PORT || 3000)

/** Scrive dist/precache.json con l'elenco dei file da mettere in cache per l'uso offline. */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).map((f) => '/' + f)
      this.emitFile({
        type: 'asset',
        fileName: 'precache.json',
        source: JSON.stringify({ version: Date.now().toString(36), files: ['/', ...files] }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': `http://localhost:${SERVER_PORT}`,
      '/sync': { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
})
