import type { Homework } from '@/types'
import { formatDateTime } from '@/utils/format'

/**
 * Разбор ленты «требуют внимания» на главной преподавателя.
 *
 * Вынесен из страницы отдельным модулем: это единственное место, где решается,
 * что важнее — присланная работа, просроченный срок или просто ожидание, — и
 * проверять такое правило удобнее без разметки вокруг.
 */

/** Что с заданием не так — по нему и сортируется лента. */
export type Attention = {
  homework: Homework
  tone: 'brand' | 'warning' | 'neutral'
  status: string
  meta: string
  urgent: boolean
  /** Срок уже прошёл или истекает в ближайшие сутки */
  expiring: boolean
  order: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function attentionOf(homework: Homework, now: Date): Attention | null {
  const submitted = homework.submissions.filter((s) => s.isDone && !s.acceptedAt)
  const due = homework.effectiveDueAt ? new Date(homework.effectiveDueAt) : null
  const overdue = Boolean(due && due < now)
  const waiting = homework.submissions.filter((s) => !s.isDone && !s.acceptedAt)
  const expiring = Boolean(
    due && waiting.length > 0 && due.getTime() - now.getTime() < DAY_MS,
  )

  if (submitted.length > 0) {
    return {
      homework,
      tone: 'brand',
      status: `Прислали ${submitted.length}`,
      meta: submitted.map((s) => s.student.displayName).join(', '),
      urgent: false,
      expiring,
      order: 0,
    }
  }
  if (overdue && waiting.length > 0) {
    return {
      homework,
      tone: 'warning',
      status: 'Просрочено',
      meta: `Срок ${formatDateTime(homework.effectiveDueAt)} · не сдали: ${waiting.map((s) => s.student.displayName).join(', ')}`,
      urgent: true,
      expiring,
      order: 1,
    }
  }
  if (waiting.length > 0) {
    return {
      homework,
      tone: 'neutral',
      status: 'Ждём сдачи',
      meta: due ? `Срок ${formatDateTime(homework.effectiveDueAt)}` : 'Срок — следующий урок',
      urgent: false,
      expiring,
      order: 2,
    }
  }
  return null
}
