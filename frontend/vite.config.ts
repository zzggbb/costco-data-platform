import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/costco-data/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/costco': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/costco/, ''),
      },
    },
  },
})
