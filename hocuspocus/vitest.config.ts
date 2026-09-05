import { defineConfig } from 'vitest/config'

/**
 * Адрес Django и общий секрет модуль `api.ts` читает из окружения при импорте,
 * поэтому их надо задать до запуска, а не внутри теста.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      DJANGO_API_URL: 'http://backend:8000',
      HOCUSPOCUS_SECRET: 'test-secret',
    },
  },
})
