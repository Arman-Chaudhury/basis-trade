import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// One origin for three things: this React app, the Python service (:8001) and the Atropos Node service (:4411).
//   /py/*    → Python root (Basis, pipeline, ledger, voice, timeseries)
//   /leaf/*  → Python /api/* (Leaf's routers)
//   /api/*   → Node /api/* untouched, so Atropos's own pages (landing, console, Atty) work as written
//   /node/*  → Node root (its static pages)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: {
    '/py': { target: 'http://localhost:8001', changeOrigin: true, rewrite: p => p.replace(/^\/py/, '') },
    '/leaf': { target: 'http://localhost:8001', changeOrigin: true, rewrite: p => p.replace(/^\/leaf/, '/api') },
    '/api': { target: 'http://localhost:4411', changeOrigin: true },
    '^/node(/|$)': { target: 'http://localhost:4411', changeOrigin: true, rewrite: p => p.replace(/^\/node/, '') },
  } },
})
