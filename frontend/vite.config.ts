import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: command === 'serve'
      ? {
          openvera: resolve(__dirname, '../packages/openvera/src/index.ts'),
        }
      : undefined,
  },
  optimizeDeps: {
    exclude: ['openvera'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': 'http://localhost:8888',
    },
  },
  build: {
    outDir: 'dist',
  },
}))
