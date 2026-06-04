import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress @vueuse/core pure comment annotation warnings
        if (warning.code === 'THIS_IS_UNDEFINED' || warning.message.includes('@vueuse')) return
        warn(warning)
      },
    },
  },
})
