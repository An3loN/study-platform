import axios, { AxiosError } from 'axios'
import type { AuthUser, ValidateAccessResponse, YjsStateResponse } from './types.js'

const DJANGO_URL = process.env.DJANGO_API_URL ?? 'http://backend:8000'
const HOCUSPOCUS_SECRET = process.env.HOCUSPOCUS_SECRET ?? ''

const SAVE_ATTEMPTS = 3
const SAVE_RETRY_BASE_MS = 1_000

const client = axios.create({
  baseURL: DJANGO_URL,
  headers: { 'X-Hocuspocus-Secret': HOCUSPOCUS_SECRET },
  timeout: 5_000,
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Проверяет JWT-токен пользователя и его доступ к уроку.
 * Вызывается Hocuspocus при каждом новом подключении клиента.
 * Выбрасывает ошибку если токен невалидный или нет доступа.
 */
export async function validateAccess(token: string, roomId: string): Promise<AuthUser> {
  const { data } = await client.post<ValidateAccessResponse>('/api/whiteboard/validate-access/', {
    token,
    room_id: roomId,
  })
  return data.user
}

/**
 * Загружает сохранённое Yjs-состояние для комнаты урока.
 * Возвращает base64-строку или null если состояния нет.
 */
export async function loadYjsState(roomId: string): Promise<string | null> {
  try {
    const { data } = await client.get<YjsStateResponse>(`/api/whiteboard/${roomId}/yjs-state/`)
    return data.state
  } catch (err) {
    const status = (err as AxiosError).response?.status
    // 404 — нормально для нового урока
    if (status === 404) return null
    console.error(`[persistence] Ошибка загрузки состояния для ${roomId}:`, err)
    return null
  }
}

/**
 * Сохраняет Yjs-состояние документа в Django.
 * Вызывается Hocuspocus когда все клиенты отключились от комнаты.
 *
 * Шанс сохранить ровно один: сразу после onStoreDocument документ выгружается
 * из памяти. Если Django в этот момент перезапускается, доска за весь урок
 * пропадает молча — поэтому повторяем попытки на сетевых и 5xx ошибках.
 *
 * Возвращает true, если состояние сохранено. Не бросает исключений: падение
 * хука Hocuspocus не поможет — состояние уже не восстановить.
 */
export async function saveYjsState(roomId: string, state: string): Promise<boolean> {
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
    try {
      await client.put(`/api/whiteboard/${roomId}/yjs-state/`, { state })
      return true
    } catch (err) {
      const status = (err as AxiosError).response?.status
      // 4xx (кроме 429) — запрос неверен сам по себе, повтор не поможет
      const retriable = !status || status >= 500 || status === 429
      if (!retriable || attempt === SAVE_ATTEMPTS) {
        console.error(
          `[persistence] Не удалось сохранить состояние ${roomId} (попытка ${attempt}/${SAVE_ATTEMPTS}):`,
          err,
        )
        return false
      }
      await sleep(SAVE_RETRY_BASE_MS * attempt)
    }
  }
  return false
}
