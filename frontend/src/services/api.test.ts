import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from './api'

/**
 * Транспортный слой: конвертация ключей и обработка 401.
 *
 * Оба поведения невидимы снаружи и потому легко ломаются. Конвертация — это
 * договорённость «API отдаёт snake_case, компоненты знают только camelCase».
 * Обработка 401 однажды уже съела сообщение об ошибке на форме входа, утащив
 * страницу на перезагрузку.
 */

let onHttp: MockAdapter
let onBareAxios: MockAdapter

beforeEach(() => {
  onHttp = new MockAdapter(http)
  // Рефреш идёт мимо инстанса http — на голом axios, чтобы не попасть
  // в собственный перехватчик. Значит и мок ему нужен отдельный.
  onBareAxios = new MockAdapter(axios)

  localStorage.clear()
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  onHttp.restore()
  onBareAxios.restore()
  vi.restoreAllMocks()
})

// ── Конвертация ключей ───────────────────────────────────────────────────────

describe('snake_case ↔ camelCase', () => {
  it('переводит ответ в camelCase', async () => {
    onHttp.onGet('/lessons/1/').reply(200, {
      scheduled_at: '2026-03-10T12:00:00Z',
      has_whiteboard: true,
    })

    const { data } = await http.get('/lessons/1/')

    expect(data).toEqual({ scheduledAt: '2026-03-10T12:00:00Z', hasWhiteboard: true })
  })

  it('разбирает вложенные объекты и массивы', async () => {
    onHttp.onGet('/lessons/').reply(200, {
      results: [
        { teacher_name: 'Мария', students: [{ display_name: 'Матвей' }] },
      ],
    })

    const { data } = await http.get('/lessons/')

    expect(data.results[0].teacherName).toBe('Мария')
    expect(data.results[0].students[0].displayName).toBe('Матвей')
  })

  it('переводит тело запроса в snake_case', async () => {
    let sent: unknown
    onHttp.onPost('/lessons/').reply((config) => {
      sent = JSON.parse(config.data)
      return [201, {}]
    })

    await http.post('/lessons/', { scheduledAt: null, hasWhiteboard: false })

    expect(sent).toEqual({ scheduled_at: null, has_whiteboard: false })
  })

  it('не трогает ключи, уже записанные в snake_case', async () => {
    let sent: Record<string, unknown> = {}
    onHttp.onPost('/homework/').reply((config) => {
      sent = JSON.parse(config.data)
      return [201, {}]
    })

    await http.post('/homework/', { due_at: '2026-03-10' })

    expect(sent).toEqual({ due_at: '2026-03-10' })
  })

  it('оставляет FormData как есть', async () => {
    const form = new FormData()
    form.append('text', 'работа')

    let sent: unknown
    onHttp.onPost('/homework/').reply((config) => {
      sent = config.data
      return [201, {}]
    })

    await http.post('/homework/', form)

    expect(sent).toBeInstanceOf(FormData)
    expect((sent as FormData).get('text')).toBe('работа')
  })

  it('не спотыкается о null и примитивы', async () => {
    onHttp.onGet('/x/').reply(200, { a: null, b: 1, c: 'строка', d: [1, 2] })

    const { data } = await http.get('/x/')

    expect(data).toEqual({ a: null, b: 1, c: 'строка', d: [1, 2] })
  })
})

// ── 401 на логине ────────────────────────────────────────────────────────────

describe('401 при входе', () => {
  it('не уходит в рефреш и не перезагружает страницу', async () => {
    onHttp.onPost('/auth/login/').reply(401, { detail: 'Неверный телефон или пароль.' })

    await expect(http.post('/auth/login/', { phone: '+79990000001', password: 'мимо' }))
      .rejects.toMatchObject({ response: { status: 401 } })

    // Ни попытки обновить сессию, которой нет...
    expect(onBareAxios.history.post).toHaveLength(0)
    // ...ни ухода на /login, который стёр бы сообщение об ошибке вместе со страницей
    expect(window.location.href).toBe('')
  })

  it('не чистит уже сохранённую сессию', async () => {
    // Кто-то вошёл, потом на той же вкладке ошибся паролем в другой форме —
    // его сессия к этому отношения не имеет
    localStorage.setItem('access_token', 'живой')
    localStorage.setItem('refresh_token', 'тоже живой')
    onHttp.onPost('/auth/login/').reply(401, {})

    await expect(http.post('/auth/login/', {})).rejects.toBeDefined()

    expect(localStorage.getItem('access_token')).toBe('живой')
  })
})

// ── 401 на остальных запросах ────────────────────────────────────────────────

describe('401 на обычном запросе', () => {
  it('обновляет токен и повторяет запрос', async () => {
    localStorage.setItem('access_token', 'протухший')
    localStorage.setItem('refresh_token', 'годный')

    onHttp.onGet('/students/').replyOnce(401, {})
    onHttp.onGet('/students/').replyOnce(200, { display_name: 'Матвей' })
    onBareAxios.onPost('/api/auth/refresh/').reply(200, { access: 'свежий' })

    const { data } = await http.get('/students/')

    expect(data).toEqual({ displayName: 'Матвей' })
    expect(localStorage.getItem('access_token')).toBe('свежий')
    expect(onHttp.history.get).toHaveLength(2)
    expect(onHttp.history.get[1].headers?.Authorization).toBe('Bearer свежий')
  })

  it('сохраняет новый refresh, если сервер его прислал', async () => {
    localStorage.setItem('refresh_token', 'годный')
    onHttp.onGet('/students/').replyOnce(401, {})
    onHttp.onGet('/students/').replyOnce(200, {})
    onBareAxios.onPost('/api/auth/refresh/').reply(200, { access: 'свежий', refresh: 'новый' })

    await http.get('/students/')

    expect(localStorage.getItem('refresh_token')).toBe('новый')
  })

  it('без refresh-токена уводит на вход', async () => {
    localStorage.setItem('access_token', 'протухший')
    onHttp.onGet('/students/').reply(401, {})

    await expect(http.get('/students/')).rejects.toBeDefined()

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(window.location.href).toBe('/login')
    expect(onBareAxios.history.post).toHaveLength(0)
  })

  it('уводит на вход, если рефреш не удался', async () => {
    localStorage.setItem('refresh_token', 'протухший')
    onHttp.onGet('/students/').reply(401, {})
    onBareAxios.onPost('/api/auth/refresh/').reply(401, {})

    await expect(http.get('/students/')).rejects.toBeDefined()

    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('не зацикливается, если повтор снова отвечает 401', async () => {
    localStorage.setItem('refresh_token', 'годный')
    onHttp.onGet('/students/').reply(401, {})
    onBareAxios.onPost('/api/auth/refresh/').reply(200, { access: 'свежий' })

    await expect(http.get('/students/')).rejects.toMatchObject({ response: { status: 401 } })

    // Один рефреш и ровно один повтор: флаг _retry не даёт уйти по кругу
    expect(onBareAxios.history.post).toHaveLength(1)
    expect(onHttp.history.get).toHaveLength(2)
  })

  it('другие ошибки проходят мимо обработчика', async () => {
    localStorage.setItem('refresh_token', 'годный')
    onHttp.onGet('/students/').reply(500, {})

    await expect(http.get('/students/')).rejects.toMatchObject({ response: { status: 500 } })

    expect(onBareAxios.history.post).toHaveLength(0)
    expect(window.location.href).toBe('')
  })
})

// ── Заголовок авторизации ────────────────────────────────────────────────────

describe('заголовок Authorization', () => {
  it('подставляется из localStorage', async () => {
    localStorage.setItem('access_token', 'токен')
    onHttp.onGet('/lessons/').reply(200, {})

    await http.get('/lessons/')

    expect(onHttp.history.get[0].headers?.Authorization).toBe('Bearer токен')
  })

  it('не появляется, когда токена нет', async () => {
    onHttp.onGet('/lessons/').reply(200, {})

    await http.get('/lessons/')

    expect(onHttp.history.get[0].headers?.Authorization).toBeUndefined()
  })
})
