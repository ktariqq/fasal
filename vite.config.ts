import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' lets the static build run on Netlify, Vercel, GitHub Pages or a cPanel folder
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
})