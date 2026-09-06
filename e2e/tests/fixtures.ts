import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Данные под сквозные тесты.
 *
 * Преподаватель заводится до запуска командой `manage.py e2e_seed` — своего
 * маршрута регистрации у него нет, а служебный HTTP-маршрут пришлось бы
 * чем-то закрывать на боевом стенде. Всё остальное каждый тест создаёт себе
 * сам через API и за собой же убирает: сквозные идут по живому стеку, и
 * зависеть от того, что там накопилось при разработке, нельзя.
 */

export const TEACHER_PHONE = '+70000000001'
export const TEACHER_PASSWORD = 'e2eTeacher!7391'
export const STUDENT_PASSWORD = 'e2eStudent!7391'

export interface Actors {
  api: APIRequestContext
  headers: Record<string, string>
  studentId: string
  studentName: string
  studentPhone: string
  inviteUrl: string | null
}

/** Код региона 000 живым абонентам не выдаётся — столкнуться не с чем. */
function uniquePhone(): string {
  return `+7000${String(Date.now()).slice(-7)}`
}

export const test = base.extend<{ actors: Actors }>({
  actors: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext({ baseURL })

    const auth = await api.post('/api/auth/login/', {
      data: { phone: TEACHER_PHONE, password: TEACHER_PASSWORD },
    })
    expect(
      auth.ok(),
      'Преподавателя нет. Перед запуском: manage.py e2e_seed в контейнере backend',
    ).toBeTruthy()

    const headers = { Authorization: `Bearer ${(await auth.json()).access}` }
    const studentPhone = uniquePhone()
    const studentName = `Ученик${String(Date.now()).slice(-5)}`

    const created = await api.post('/api/students/', {
      headers,
      data: { first_name: studentName, phone: studentPhone, password: STUDENT_PASSWORD },
    })
    expect(created.ok()).toBeTruthy()
    const student = await created.json()

    await use({
      api,
      headers,
      studentId: student.id,
      studentName,
      studentPhone,
      inviteUrl: student.invite_url ?? null,
    })

    // Уроки и задания уйдут каскадом за учеником
    await api.delete(`/api/students/${student.id}/`, { headers })
    await api.dispose()
  },
})

export { expect }

/** Вход через форму — то, что делает человек, а не подстановка токена. */
export async function signIn(page: Page, phone: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Телефон').fill(phone)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}
