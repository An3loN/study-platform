import nock from 'nock'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadYjsState, saveYjsState, validateAccess } from './api.js'

/**
 * Разговор с Django.
 *
 * Здесь важнее всего `saveYjsState`. Шанс сохранить доску ровно один: сразу
 * после `onStoreDocument` документ выгружается из памяти. Раньше один
 * неудачный PUT молча стирал доску за весь урок — отсюда повторы, и отсюда же
 * правило «не бросать исключений»: падение хука состояние уже не вернёт.
 *
 * Адрес и секрет модуль читает из окружения при импорте — значения по
 * умолчанию для тестов заданы в `vitest.config.ts`.
 *
 * Паузы между попытками ждутся по-настоящему — отсюда девять секунд на весь
 * файл. Подменять таймеры пробовал: `runAllTimersAsync` прокручивает часы
 * раньше, чем перехваченный запрос успевает ответить, и пауза, поставленная
 * уже после этого, зависает навсегда. Ради нескольких секунд городить
 * ручную синхронизацию не стоит.
 */

const DJANGO = 'http://backend:8000'
const ROOM = '0f3c1d5e-1111-2222-3333-444455556666'
// Сверяемся с тем, что модуль прочитал сам: важно, что секрет уходит, а не
// какой он именно — в контейнере разработки он свой
const SECRET = process.env.HOCUSPOCUS_SECRET

beforeAll(() => {
  nock.disableNetConnect()
})

afterAll(() => {
  nock.enableNetConnect()
})

beforeEach(() => {
  // Ошибки сохранения логируются намеренно — в тестах они только шумят
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  nock.cleanAll()
  vi.restoreAllMocks()
  vi.useRealTimers()
})


// ── Проверка доступа ─────────────────────────────────────────────────────────

describe('validateAccess', () => {
  it('возвращает пользователя, которого признал Django', async () => {
    nock(DJANGO)
      .post('/api/whiteboard/validate-access/', { token: 'jwt', room_id: ROOM })
      .reply(200, { user: { id: 'u1', username: 'Мария Иванова', role: 'teacher' } })

    await expect(validateAccess('jwt', ROOM)).resolves.toEqual({
      id: 'u1',
      username: 'Мария Иванова',
      role: 'teacher',
    })
  })

  it('шлёт общий секрет: без него Django не отвечает', async () => {
    let sentSecret: string | undefined
    nock(DJANGO)
      .post('/api/whiteboard/validate-access/')
      .reply(function () {
        sentSecret = this.req.headers['x-hocuspocus-secret'] as string
        return [200, { user: { id: 'u1', username: 'кто-то', role: 'student' } }]
      })

    await validateAccess('jwt', ROOM)

    expect(sentSecret).toBe(SECRET)
  })

  it('бросает на отказ: соединение должно закрыться, а не открыться молча', async () => {
    nock(DJANGO).post('/api/whiteboard/validate-access/').reply(403, { detail: 'Нет доступа' })

    await expect(validateAccess('jwt', ROOM)).rejects.toThrow()
  })

  it('бросает и на обрыве сети', async () => {
    nock(DJANGO).post('/api/whiteboard/validate-access/').replyWithError('ECONNREFUSED')

    await expect(validateAccess('jwt', ROOM)).rejects.toThrow()
  })
})

// ── Загрузка состояния ───────────────────────────────────────────────────────

describe('loadYjsState', () => {
  it('отдаёт сохранённое состояние', async () => {
    nock(DJANGO).get(`/api/whiteboard/${ROOM}/yjs-state/`).reply(200, { state: 'AAECAw==' })

    await expect(loadYjsState(ROOM)).resolves.toBe('AAECAw==')
  })

  it('404 — это новая комната, а не ошибка', async () => {
    // На этот контракт рассчитывает и Django: YjsStateView.get отдаёт 404
    nock(DJANGO).get(`/api/whiteboard/${ROOM}/yjs-state/`).reply(404, { detail: 'нет' })

    await expect(loadYjsState(ROOM)).resolves.toBeNull()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('на 500 отдаёт null, но жалуется в лог', async () => {
    // Пустить в комнату всё равно надо: иначе урок вообще не состоится
    nock(DJANGO).get(`/api/whiteboard/${ROOM}/yjs-state/`).reply(500)

    await expect(loadYjsState(ROOM)).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('на обрыве сети тоже не бросает', async () => {
    nock(DJANGO).get(`/api/whiteboard/${ROOM}/yjs-state/`).replyWithError('ECONNRESET')

    await expect(loadYjsState(ROOM)).resolves.toBeNull()
  })
})

// ── Сохранение состояния ─────────────────────────────────────────────────────

describe('saveYjsState', () => {
  it('сохраняет с первой попытки', async () => {
    const scope = nock(DJANGO)
      .put(`/api/whiteboard/${ROOM}/yjs-state/`, { state: 'AAECAw==' })
      .reply(200, {})

    await expect(saveYjsState(ROOM, 'AAECAw==')).resolves.toBe(true)
    expect(scope.isDone()).toBe(true)
  })

  it('повторяет после 500 и досохраняет', async () => {
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).reply(500)
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).reply(200, {})

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(true)
  })

  it('повторяет и после обрыва сети — Django мог перезапускаться', async () => {
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).replyWithError('ECONNREFUSED')
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).reply(200, {})

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(true)
  })

  it('429 считается временным', async () => {
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).reply(429)
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).reply(200, {})

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(true)
  })

  it('сдаётся после трёх попыток и говорит об этом', async () => {
    let attempts = 0
    nock(DJANGO)
      .put(`/api/whiteboard/${ROOM}/yjs-state/`)
      .times(3)
      .reply(() => { attempts += 1; return [503] })

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(false)
    expect(attempts).toBe(3)
    expect(console.error).toHaveBeenCalled()
  })

  it('на 400 не повторяет: запрос неверен сам по себе', async () => {
    let attempts = 0
    nock(DJANGO)
      .put(`/api/whiteboard/${ROOM}/yjs-state/`)
      .times(3)
      .reply(() => { attempts += 1; return [400] })

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(false)
    expect(attempts).toBe(1)
  })

  it('на 403 тоже не повторяет: секрет от повторов не исправится', async () => {
    let attempts = 0
    nock(DJANGO)
      .put(`/api/whiteboard/${ROOM}/yjs-state/`)
      .times(3)
      .reply(() => { attempts += 1; return [403] })

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(false)
    expect(attempts).toBe(1)
  })

  it('никогда не бросает: падение хука доску уже не вернёт', async () => {
    nock(DJANGO).put(`/api/whiteboard/${ROOM}/yjs-state/`).times(3).replyWithError('всё плохо')

    await expect(saveYjsState(ROOM, 'состояние')).resolves.toBe(false)
  })

  it('шлёт секрет и телом — само состояние', async () => {
    let body: unknown
    let secret: string | undefined
    nock(DJANGO)
      .put(`/api/whiteboard/${ROOM}/yjs-state/`)
      .reply(function (_uri, requestBody) {
        body = requestBody
        secret = this.req.headers['x-hocuspocus-secret'] as string
        return [200, {}]
      })

    await saveYjsState(ROOM, 'AAECAw==')

    expect(body).toEqual({ state: 'AAECAw==' })
    expect(secret).toBe(SECRET)
  })
})
