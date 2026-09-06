import type { Lesson, LessonStatus } from '@/types'

export const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Запланирован',
  active: 'Идёт',
  finished: 'Завершён',
  cancelled: 'Отменён',
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

/**
 * Чем подписан урок в списке — именами участников.
 *
 * Своего названия у урока больше нет: заполнять его на каждое занятие
 * с одним и тем же учеником нечего. Называют урок те, кто на нём: своё имя
 * смотрящий в подписи не читает, поэтому преподаватель видит учеников,
 * ученик — преподавателя и, если урок групповой, одноклассников. Гостю по
 * ссылке состав не отдают вовсе — ему остаётся преподаватель.
 *
 * Уроки, созданные когда тему ещё заполняли, показывают её как раньше.
 */
export function lessonTitle(
  lesson: Pick<Lesson, 'title' | 'scheduledAt'> & Partial<Pick<Lesson, 'students' | 'teacherName'>>,
  selfId?: string,
): string {
  if (lesson.title) return lesson.title

  const students = lesson.students ?? []
  const watchesFromInside = students.some((student) => student.id === selfId)
  const others = students.filter((student) => student.id !== selfId).map((s) => s.displayName)
  // Преподавателя дописываем тем, кто на урок смотрит со стороны учеников,
  // и тому, кто состава не видит совсем
  const names = watchesFromInside || students.length === 0
    ? [lesson.teacherName, ...others]
    : others

  return names.filter(Boolean).join(', ') || `Урок ${formatDateTime(lesson.scheduledAt)}`
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

/** 27 авг — день без времени и без года, если год текущий */
export function formatDay(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}

/** 14:30 — без даты, для строки урока в списке дня */
export function formatTime(value: string | null): string {
  if (!value) return '--:--'
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ── Календарь ────────────────────────────────────────────────────────────────
// Неделя считается с понедельника, а границы дня берутся по местному времени:
// бэкенду они уезжают полным ISO со смещением, иначе на границе суток уроки
// уехали бы в соседний день.

export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fromDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/** Понедельник недели, в которую попадает дата */
export function startOfWeek(date: Date): Date {
  const copy = startOfDay(date)
  const weekday = (copy.getDay() + 6) % 7
  return addDays(copy, -weekday)
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

/** «Пятница, 4 сентября» — заголовок выбранного дня */
export function formatDayLong(date: Date): string {
  const text = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** «1–7 сентября» — подпись недели над днями */
export function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const left = monday.toLocaleDateString('ru-RU', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const right = sunday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return `${left} – ${right}`
}

/** «пн», «вт» — колонка дня в календаре */
export function weekdayShort(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'short' })
}

/** Склонение: 1 урок, 2 урока, 5 уроков */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
