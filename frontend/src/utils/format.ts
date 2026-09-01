import type { Lesson, LessonStatus } from '@/types'

export const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Запланирован',
  active: 'Идёт',
  finished: 'Завершён',
}

/** 27 авг, 14:30 — без года, если год текущий */
export function formatDateTime(value: string | null): string {
  if (!value) return 'Время не назначено'
  const date = new Date(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDuration(minutes: number | null): string {
  return minutes ? `${minutes} мин` : 'без длительности'
}

/** Заголовок урока: тема, а если её нет — дата */
export function lessonTitle(lesson: Pick<Lesson, 'title' | 'scheduledAt'>): string {
  return lesson.title || `Урок ${formatDateTime(lesson.scheduledAt)}`
}

/** Значение для <input type="datetime-local"> из ISO-строки */
export function toLocalInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Обратно в ISO для API */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}
