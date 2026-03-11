import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3031,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3032',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://127.0.0.1:3032',
        changeOrigin: true
      }
    }
  },
  preview: {
    host: true,
    port: 3031,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3032',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://127.0.0.1:3032',
        changeOrigin: true
      }
    }
  }
})
