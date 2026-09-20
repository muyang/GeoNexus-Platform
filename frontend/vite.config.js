import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 后端（Node BFF / 未来的 RuoYi）地址；前端只认 /api 前缀，便于整体切到 Java
const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:3100'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: process.env.HOST || '127.0.0.1',   // 显式 IPv4：Vite 默认只绑 localhost(::1)，127.0.0.1 会连不上
    port: Number(process.env.PORT || 5173),
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': { target: API_TARGET, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          maplibre: ['maplibre-gl']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.js']
  }
})
