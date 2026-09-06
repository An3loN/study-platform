import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Отдельный конфиг, а не секция в vite.config.ts: тому нужен плагин, который
 * копирует ассеты Excalidraw, а тестам это только лишняя работа на каждом
 * запуске.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
