import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // Excalidraw использует process.env.NODE_ENV внутри своего бандла,
  // но Vite не полифиллит Node.js-глобалы в браузере — задаём явно.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // yjs должен быть в единственном экземпляре: и @hocuspocus/provider, и наш код
    // создают Y.Doc, а при двух копиях ломаются instanceof-проверки внутри yjs.
    dedupe: ['yjs'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/board': {
        target: 'ws://hocuspocus:1234',
        ws: true,
        // nginx в prod делает то же самое
        rewrite: (p) => p.replace(/^\/board/, ''),
      },
    },
  },
})
