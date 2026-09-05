import { defineConfig, devices } from '@playwright/test'

/**
 * Сквозные тесты идут через nginx на 8000 — ту же дверь, что и живой браузер.
 * Внутри docker-сети это `http://nginx`, снаружи `http://localhost:8000`.
 *
 * Стек эти тесты не поднимают: он и так работает при разработке, а поднимать
 * второй ради проверки — лишние минуты на каждый запуск.
 */
export default defineConfig({
  testDir: './tests',
  // Данные общие на весь стек, поэтому параллелить нельзя: тесты
  // переступали бы друг другу через уроки и задания
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8000',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    // След пишем только по упавшему: смотреть его иначе незачем, а места занимает
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
