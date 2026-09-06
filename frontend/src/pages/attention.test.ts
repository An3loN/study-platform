import { describe, expect, it } from 'vitest'
import type { Homework, HomeworkSubmission } from '@/types'
import { attentionOf } from './attention'

/**
 * Лента «требуют внимания».
 *
 * Порядок здесь — это порядок дел преподавателя: сначала то, что прислали и
 * ждут ответа, потом просроченное, потом просто ожидание. Отдельно считается
 * `expiring` — по нему плитка «Срок истекает» берёт и просроченное, и то, чему
 * остались сутки.
 */

const NOW = new Date('2026-03-10T12:00:00Z')
const HOUR = 60 * 60 * 1000

function person(id: string, displayName: string) {
  return {
    id, displayName, firstName: displayName, lastName: '', alias: '',
    avatar: null, role: 'student' as const,
  }
}

function submission(student: string, fields: Partial<HomeworkSubmission> = {}): HomeworkSubmission {
  return {
    id: `sub-${student}`,
    student: person(student, student),
    status: 'pending',
    isDone: false,
    doneAt: null,
    grade: null,
    acceptedAt: null,
    revisionRequestedAt: null,
    files: [],
    messagesCount: 0,
    ...fields,
  }
}

function homework(fields: Partial<Homework> = {}): Homework {
  return {
    id: 'h1',
    lesson: 'l1',
    lessonTitle: 'Урок',
    lessonScheduledAt: null,
    teacher: { ...person('t1', 'Мария'), role: 'teacher' as const },
    text: 'Учебник стр. 51',
    attachment: null,
    dueAt: null,
    effectiveDueAt: null,
    submissions: [],
    mySubmission: null,
    messagesCount: 0,
    students: [],
    createdAt: '2026-03-01T00:00:00Z',
    ...fields,
  } as Homework
}

describe('attentionOf', () => {
  it('присланная работа идёт первой', () => {
    const item = attentionOf(homework({
      submissions: [submission('Матвей', { isDone: true })],
    }), NOW)

    expect(item).toMatchObject({ order: 0, status: 'Прислали 1', tone: 'brand' })
    expect(item!.meta).toBe('Матвей')
  })

  it('считает всех приславших', () => {
    const item = attentionOf(homework({
      submissions: [
        submission('Матвей', { isDone: true }),
        submission('Кира', { isDone: true }),
      ],
    }), NOW)

    expect(item!.status).toBe('Прислали 2')
    expect(item!.meta).toBe('Матвей, Кира')
  })

  it('принятая работа внимания больше не требует', () => {
    const item = attentionOf(homework({
      submissions: [submission('Матвей', { isDone: true, acceptedAt: '2026-03-09T00:00:00Z' })],
    }), NOW)

    expect(item).toBeNull()
  })

  it('просроченное идёт вторым и помечено срочным', () => {
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() - HOUR).toISOString(),
      submissions: [submission('Матвей')],
    }), NOW)

    expect(item).toMatchObject({ order: 1, status: 'Просрочено', urgent: true })
    expect(item!.meta).toContain('не сдали: Матвей')
  })

  it('ожидание идёт последним и срочным не считается', () => {
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() + 5 * 24 * HOUR).toISOString(),
      submissions: [submission('Матвей')],
    }), NOW)

    expect(item).toMatchObject({ order: 2, status: 'Ждём сдачи', urgent: false })
  })

  it('без срока пишет, что ждать до следующего урока', () => {
    const item = attentionOf(homework({ submissions: [submission('Матвей')] }), NOW)

    expect(item!.meta).toBe('Срок — следующий урок')
  })

  it('присланное важнее просроченного у того же задания', () => {
    // Один сдал, второй нет и срок прошёл: разбирать надо присланное
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() - HOUR).toISOString(),
      submissions: [
        submission('Матвей', { isDone: true }),
        submission('Кира'),
      ],
    }), NOW)

    expect(item!.order).toBe(0)
  })

  it('задание, где всем всё принято, из ленты уходит', () => {
    const item = attentionOf(homework({
      submissions: [
        submission('Матвей', { isDone: true, acceptedAt: '2026-03-09T00:00:00Z' }),
        submission('Кира', { isDone: true, acceptedAt: '2026-03-09T00:00:00Z' }),
      ],
    }), NOW)

    expect(item).toBeNull()
  })

  it('задание без адресатов в ленту не попадает', () => {
    expect(attentionOf(homework(), NOW)).toBeNull()
  })
})

describe('«Срок истекает»', () => {
  it('считает просроченное', () => {
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() - HOUR).toISOString(),
      submissions: [submission('Матвей')],
    }), NOW)

    expect(item!.expiring).toBe(true)
  })

  it('считает то, чему остались сутки', () => {
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() + 5 * HOUR).toISOString(),
      submissions: [submission('Матвей')],
    }), NOW)

    expect(item!.expiring).toBe(true)
  })

  it('не считает то, до чего ещё далеко', () => {
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() + 30 * HOUR).toISOString(),
      submissions: [submission('Матвей')],
    }), NOW)

    expect(item!.expiring).toBe(false)
  })

  it('не считает задания без срока', () => {
    const item = attentionOf(homework({ submissions: [submission('Матвей')] }), NOW)

    expect(item!.expiring).toBe(false)
  })

  it('не подгоняет тех, кто уже сдал', () => {
    const item = attentionOf(homework({
      effectiveDueAt: new Date(NOW.getTime() + HOUR).toISOString(),
      submissions: [submission('Матвей', { isDone: true })],
    }), NOW)

    expect(item!.expiring).toBe(false)
  })
})
