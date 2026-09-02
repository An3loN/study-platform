import type { GuestSession } from '@/types'

/**
 * Гостевая сессия переживает перезагрузку страницы, но не закрытие вкладки:
 * sessionStorage, а не localStorage — временный токен на комнату не должен
 * оставаться на чужом компьютере после того, как вкладку закрыли.
 *
 * Ключ привязан к ссылке: по двум разным приглашениям гость может быть
 * представлен по-разному, и одна вкладка не должна затирать другую.
 */
const KEY_PREFIX = 'guest_session:'

const storageKey = (shareToken: string) => `${KEY_PREFIX}${shareToken}`

/**
 * Токен выдаётся на 12 часов (GUEST_TOKEN_LIFETIME в apps/lessons/views.py).
 * Просроченный брать незачем: чат закроется с кодом 4001, а доска покажет
 * «нет доступа» — лучше сразу спросить имя заново.
 */
function isExpired(accessToken: string): boolean {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return true
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    if (!exp) return true
    // Небольшой запас: токен, истекающий через минуту, уже не стоит подхватывать
    return Date.now() >= (exp - 60) * 1000
  } catch {
    return true
  }
}

export function loadGuestSession(shareToken: string): GuestSession | null {
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(storageKey(shareToken))
  } catch {
    // Приватный режим или запрет на хранилище — просто представимся заново
    return null
  }
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as GuestSession
    if (!session?.access || !session.roomId || isExpired(session.access)) {
      clearGuestSession(shareToken)
      return null
    }
    return session
  } catch {
    clearGuestSession(shareToken)
    return null
  }
}

export function saveGuestSession(shareToken: string, session: GuestSession): void {
  try {
    window.sessionStorage.setItem(storageKey(shareToken), JSON.stringify(session))
  } catch {
    // Не сохранили — гость просто назовётся заново после перезагрузки
  }
}

export function clearGuestSession(shareToken: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(shareToken))
  } catch {
    // Нечего чистить
  }
}
