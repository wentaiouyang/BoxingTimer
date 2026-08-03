import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sayTts } from './vite-plugin-say-tts.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), sayTts()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { host: true, port: Number(process.env.PORT) || 5173 },
})
