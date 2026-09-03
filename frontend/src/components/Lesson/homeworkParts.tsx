import { Icon, type IconName } from '@/components/UI/icons'
import { SUBMISSION_LABEL, type Homework, type SubmissionStatus } from '@/types'
import { formatDateTime } from '@/utils/format'

/**
 * Общие детали домашних заданий: как выглядит состояние сдачи и срок.
 * И карточка в панели, и окно задания показывают одно и то же — считаться
 * это должно в одном месте, иначе они начнут расходиться.
 */

/** «Просрочено» — не состояние сдачи, а срок, поэтому отдельным видом */
export type PillKind = SubmissionStatus | 'late'

const PILL_ICON: Record<PillKind, IconName | null> = {
  pending: null,
  submitted: 'clock',
  revision: 'revision',
  accepted: 'check',
  late: 'alert',
}

export function StatusPill({ kind, label }: { kind: PillKind; label: string }) {
  const icon = PILL_ICON[kind]
  return (
    <span className={`hw-pill hw-pill--${kind}`}>
      {icon && <Icon name={icon} size={13} width={kind === 'accepted' ? 2.4 : 2.2} />}
      {label}
    </span>
  )
}

function plural(count: number, forms: [string, string, string]): string {
  const tens = count % 100
  const ones = count % 10
  if (tens > 10 && tens < 20) return forms[2]
  if (ones === 1) return forms[0]
  if (ones >= 2 && ones <= 4) return forms[1]
  return forms[2]
}

export interface DueState {
  text: string
  /** Осталось столько-то дней — приписка рядом со сроком */
  note: string
  late: boolean
}

/** Срок словами: «Срок 3 сен, 15:00 · осталось 6 дней» либо «Срок был ...» */
export function dueState(dueAt: string | null, forStudent = false): DueState {
  if (!dueAt) return { text: 'Срок не назначен', note: '', late: false }

  const due = new Date(dueAt).getTime()
  const left = due - Date.now()
  if (left < 0) {
    return { text: `Срок был ${formatDateTime(dueAt)}`, note: '', late: true }
  }

  const days = Math.ceil(left / 86_400_000)
  const note = days > 1
    ? `· осталось ${days} ${plural(days, ['день', 'дня', 'дней'])}`
    : '· сегодня'
  return {
    text: `${forStudent ? 'Сдать до' : 'Срок'} ${formatDateTime(dueAt)}`,
    note,
    late: false,
  }
}

export interface Aggregate {
  kind: PillKind
  label: string
}

/**
 * Одна плашка на всё задание. Преподавателю важнее всего то, что ждёт его
 * действия, поэтому «на проверке» перебивает остальное; дальше идёт
 * просрочка, и только потом спокойные состояния.
 */
export function aggregate(homework: Homework, isTeacher: boolean): Aggregate {
  if (!isTeacher) {
    const status = homework.mySubmission?.status ?? 'pending'
    const late = status === 'pending' && dueState(homework.effectiveDueAt).late
    if (late) return { kind: 'late', label: 'Просрочено' }
    return { kind: status, label: SUBMISSION_LABEL[status] }
  }

  const submissions = homework.submissions
  const waiting = submissions.filter((item) => item.status === 'submitted').length
  if (waiting) return { kind: 'submitted', label: `На проверке · ${waiting}` }

  const overdue = dueState(homework.effectiveDueAt).late
  const notDone = submissions.filter((item) => !item.isDone && item.status !== 'accepted').length
  if (overdue && notDone) return { kind: 'late', label: `Просрочено · ${notDone}` }

  const revision = submissions.filter((item) => item.status === 'revision').length
  if (revision) return { kind: 'revision', label: `На правках · ${revision}` }

  if (submissions.length > 0 && submissions.every((item) => item.status === 'accepted')) {
    return { kind: 'accepted', label: 'Принято' }
  }
  return { kind: 'pending', label: 'Не сдано' }
}

/** «Сдали 1 из 3» — считаем принятые тоже: принятое точно сдано */
export function doneCount(homework: Homework): { done: number; total: number } {
  const total = homework.submissions.length
  const done = homework.submissions.filter((item) => item.isDone || item.status === 'accepted').length
  return { done, total }
}
