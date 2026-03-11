import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3031,
    proxy: {
      '/api': 'http://localhost:3032',
      '/v1': 'http://localhost:3032'
    }
  },
  preview: {
    port: 3031
  }
})
