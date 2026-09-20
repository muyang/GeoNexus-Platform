import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 两个后端，按职责分流（这也是部署形态）：
//   · 身份权威 → Java/RuoYi 管理面（/api/auth、/api/system、/.well-known）
//   · 门户业务与治理面 → Node BFF（案例、审批、配额、九大模块内容、SDK 代理）
const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:3101'
const IDENTITY_TARGET = process.env.VITE_IDENTITY_TARGET || 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: process.env.HOST || '127.0.0.1',   // 显式 IPv4：Vite 默认只绑 localhost(::1)，127.0.0.1 会连不上
    port: Number(process.env.PORT || 5173),
    proxy: {
      // 身份与权限先分流到 Java，避免被 Node BFF 的通用 /api 处理器吃掉
      '/api/auth': { target: IDENTITY_TARGET, changeOrigin: true },
      '/api/system': { target: IDENTITY_TARGET, changeOrigin: true },
      '/.well-known': { target: IDENTITY_TARGET, changeOrigin: true },
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
