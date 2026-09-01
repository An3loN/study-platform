import axios, { AxiosError } from 'axios'
import type { AuthUser, ValidateAccessResponse, YjsStateResponse } from './types.js'

const DJANGO_URL = process.env.DJANGO_API_URL ?? 'http://backend:8000'
const HOCUSPOCUS_SECRET = process.env.HOCUSPOCUS_SECRET ?? ''

const client = axios.create({
  baseURL: DJANGO_URL,
  headers: { 'X-Hocuspocus-Secret': HOCUSPOCUS_SECRET },
  timeout: 5_000,
})

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
 */
export async function saveYjsState(roomId: string, state: string): Promise<void> {
  await client.put(`/api/whiteboard/${roomId}/yjs-state/`, { state })
}
