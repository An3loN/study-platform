import { expect, signIn, test, STUDENT_PASSWORD, TEACHER_PASSWORD, TEACHER_PHONE } from './fixtures'

/**
 * Пять путей, которые до этого проверялись руками после каждой правки.
 *
 * Здесь не проверяется логика — на неё есть модульные тесты. Здесь проверяется,
 * что слои сходятся: nginx пропускает, фронт доходит до API, API отвечает тем,
 * что фронт умеет читать.
 */

test('преподаватель входит и видит свою главную', async ({ page, actors }) => {
  await signIn(page, TEACHER_PHONE, TEACHER_PASSWORD)

  await expect(page).toHaveURL('/')
  await expect(page.getByText('Уроков сегодня')).toBeVisible()
  await expect(page.getByRole('heading', { name: actors.studentName })).toBeVisible()
})

test('неверный пароль показывает ошибку и не перезагружает страницу', async ({ page }) => {
  await page.goto('/login')
  // Метка на перезагрузку: она переживёт перерисовку, но не новый документ
  await page.evaluate(() => { (window as unknown as { __alive?: boolean }).__alive = true })

  await page.getByLabel('Телефон').fill(TEACHER_PHONE)
  await page.getByLabel('Пароль').fill('заведомо неверный')
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByText('Неверный телефон или пароль.')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
  expect(await page.evaluate(() => (window as unknown as { __alive?: boolean }).__alive)).toBe(true)
})

test('созданный урок появляется в календаре', async ({ page, actors }) => {
  await signIn(page, TEACHER_PHONE, TEACHER_PASSWORD)
  await page.getByRole('button', { name: 'Добавить урок' }).first().click()

  const at = new Date()
  at.setHours(at.getHours() + 2, 0, 0, 0)
  const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)

  await page.getByLabel('Время').fill(local)
  await page.getByLabel('Длительность').fill('45')
  await page.getByRole('button', { name: actors.studentName }).click()
  await page.getByRole('button', { name: 'Создать урок' }).click()

  // Урок подписан участниками — темы у него больше нет
  await expect(page.getByText(actors.studentName).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Войти на доску/ }).first()).toBeVisible()
})

test('задание с главной открывается окном, а не переходом на урок', async ({ page, actors }) => {
  await actors.api.post('/api/homework/', {
    headers: actors.headers,
    data: { text: 'Учебник стр. 51, №12–15.', students: [actors.studentId] },
  })

  await signIn(page, TEACHER_PHONE, TEACHER_PASSWORD)
  await page.getByText('Учебник стр. 51, №12–15.').click()

  await expect(page.getByText('Домашнее задание')).toBeVisible()
  await expect(page.getByText('Работы')).toBeVisible()
  // Никуда не ушли: разбор идёт поверх главной
  await expect(page).toHaveURL('/')
})

test('ученик входит и видит своё задание', async ({ page, actors }) => {
  await actors.api.post('/api/homework/', {
    headers: actors.headers,
    data: { text: 'Повторить признаки подобия', students: [actors.studentId] },
  })

  await signIn(page, actors.studentPhone, STUDENT_PASSWORD)

  await expect(page.getByRole('heading', { name: /Привет/ })).toBeVisible()
  await expect(page.getByText('Повторить признаки подобия')).toBeVisible()
})

test('гость заходит на урок по ссылке', async ({ page, actors }) => {
  const created = await actors.api.post('/api/lessons/', {
    headers: actors.headers,
    data: {
      scheduled_at: new Date().toISOString(),
      duration: 60,
      students: [actors.studentId],
      has_whiteboard: true,
    },
  })
  const lesson = await created.json()

  await page.goto(`/j/${lesson.share_token}`)
  await page.getByLabel(/зовут/i).fill('Дядя Вася')
  await page.getByRole('button', { name: /Войти/ }).click()

  // Доска — тяжёлый бандл, ей нужно время
  await expect(page.locator('.excalidraw')).toBeVisible({ timeout: 20_000 })
})
