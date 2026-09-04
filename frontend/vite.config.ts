import { cpSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Обе папки нужны: собранный Excalidraw просит `excalidraw-assets`,
 * а сборка для разработки — `excalidraw-assets-dev`.
 */
const EXCALIDRAW_ASSET_DIRS = ['excalidraw-assets', 'excalidraw-assets-dev']

/**
 * Excalidraw подгружает шрифты и файлы локализации в рантайме, и по умолчанию
 * тянет их с unpkg. Для урока это лишняя зависимость от внешней сети, а с
 * русской локалью — ещё и обязательная. Кладём ассеты рядом со статикой:
 * `window.EXCALIDRAW_ASSET_PATH = '/'` в index.html указывает искать их у нас.
 *
 * Копия лежит в public/ и не хранится в git — она собирается из node_modules.
 */
function excalidrawAssets() {
  return {
    name: 'excalidraw-assets',
    buildStart() {
      for (const dir of EXCALIDRAW_ASSET_DIRS) {
        cpSync(
          path.resolve(__dirname, 'node_modules/@excalidraw/excalidraw/dist', dir),
          path.resolve(__dirname, 'public', dir),
          { recursive: true },
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), excalidrawAssets()],
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
