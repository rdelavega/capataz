import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/webhook': 'http://localhost:8000',
      '/dashboard': 'http://localhost:8000',
      '/workers': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
