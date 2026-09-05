import { describe, expect, it } from 'vitest'
import type { Lesson } from '@/types'
import {
  addDays,
  formatDuration,
  fromDateInput,
  fromLocalInput,
  isSameDay,
  lessonTitle,
  plural,
  startOfDay,
  startOfWeek,
  toDateInput,
  toLocalInput,
} from './format'

/**
 * Подписи и календарные помощники.
 *
 * `lessonTitle` заменил собой поле «тема» и потому решает, что человек читает
 * в списке. Календарные функции считают границы дня по местному времени —
 * ошибка здесь уводит урок в соседний день.
 */

function person(id: string, displayName: string) {
  return {
    id,
    displayName,
    firstName: displayName,
    lastName: '',
    alias: '',
    avatar: null,
    role: 'student' as const,
  }
}

const MATVEY = person('s1', 'Матвей')
const KIRA = person('s2', 'Кира')

function lesson(fields: Partial<Lesson> = {}): Parameters<typeof lessonTitle>[0] {
  return {
    title: '',
    scheduledAt: '2026-03-10T12:00:00Z',
    students: [],
    teacherName: 'Мария Иванова',
    ...fields,
  }
}

describe('lessonTitle', () => {
  it('своё название побеждает: старые уроки его сохранили', () => {
    expect(lessonTitle(lesson({ title: 'Математика · дроби', students: [MATVEY] }))).toBe(
      'Математика · дроби',
    )
  })

  it('преподаватель видит учеников', () => {
    expect(lessonTitle(lesson({ students: [MATVEY, KIRA] }), 'teacher-id')).toBe('Матвей, Кира')
  })

  it('ученик видит преподавателя, а себя — нет', () => {
    expect(lessonTitle(lesson({ students: [MATVEY] }), MATVEY.id)).toBe('Мария Иванова')
  })

  it('ученик группового урока видит преподавателя и одноклассников', () => {
    expect(lessonTitle(lesson({ students: [MATVEY, KIRA] }), MATVEY.id)).toBe('Мария Иванова, Кира')
  })

  it('гость состава не видит — ему остаётся преподаватель', () => {
    const share = { title: '', scheduledAt: '2026-03-10T12:00:00Z', teacherName: 'Мария Иванова' }
    expect(lessonTitle(share)).toBe('Мария Иванова')
  })

  it('без участников и без преподавателя подписывает датой', () => {
    expect(lessonTitle({ title: '', scheduledAt: '2026-03-10T12:00:00Z' })).toContain('Урок')
  })

  it('урок без даты и без имён не остаётся безымянным', () => {
    expect(lessonTitle({ title: '', scheduledAt: null })).toBeTruthy()
  })
})

describe('границы дня и недели', () => {
  it('startOfDay обнуляет время, не сдвигая дату', () => {
    const start = startOfDay(new Date(2026, 2, 10, 23, 45))

    expect(start.getDate()).toBe(10)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  it('startOfWeek отсчитывает неделю с понедельника', () => {
    // 10 марта 2026 — вторник
    expect(startOfWeek(new Date(2026, 2, 10)).getDate()).toBe(9)
  })

  it('воскресенье относится к уходящей неделе, а не к следующей', () => {
    // 15 марта 2026 — воскресенье
    const monday = startOfWeek(new Date(2026, 2, 15))

    expect(monday.getDate()).toBe(9)
    expect(monday.getDay()).toBe(1)
  })

  it('понедельник остаётся собой', () => {
    expect(startOfWeek(new Date(2026, 2, 9)).getDate()).toBe(9)
  })

  it('addDays переходит через границу месяца', () => {
    const next = addDays(new Date(2026, 2, 31), 1)

    expect(next.getMonth()).toBe(3)
    expect(next.getDate()).toBe(1)
  })

  it('addDays переходит через границу года', () => {
    const next = addDays(new Date(2026, 11, 31), 1)

    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0)
  })

  it('addDays умеет назад', () => {
    expect(addDays(new Date(2026, 2, 1), -1).getMonth()).toBe(1)
  })

  it('неделя из семи дней начинается и кончается там, где надо', () => {
    const monday = startOfWeek(new Date(2026, 2, 10))
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

    expect(days[0].getDay()).toBe(1)
    expect(days[6].getDay()).toBe(0)
    expect(days[6].getDate()).toBe(15)
  })

  it('isSameDay не путает соседние сутки', () => {
    expect(isSameDay(new Date(2026, 2, 10, 0, 0), new Date(2026, 2, 10, 23, 59))).toBe(true)
    expect(isSameDay(new Date(2026, 2, 10, 23, 59), new Date(2026, 2, 11, 0, 0))).toBe(false)
  })
})

describe('поля ввода даты', () => {
  it('toDateInput ↔ fromDateInput возвращают тот же день', () => {
    const date = new Date(2026, 2, 5)
    expect(fromDateInput(toDateInput(date)).getTime()).toBe(date.getTime())
  })

  it('toDateInput дописывает ведущие нули', () => {
    expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('toLocalInput ↔ fromLocalInput не сдвигают время', () => {
    const iso = new Date(2026, 2, 10, 14, 30).toISOString()
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('пустое значение переживает круг', () => {
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
  })

  it('вечернее время не уезжает в соседний день', () => {
    const evening = new Date(2026, 2, 10, 23, 30)
    expect(toLocalInput(evening.toISOString())).toBe('2026-03-10T23:30')
  })
})

describe('мелочи', () => {
  it.each([
    [1, 'урок'],
    [2, 'урока'],
    [4, 'урока'],
    [5, 'уроков'],
    [11, 'уроков'],
    [21, 'урок'],
    [22, 'урока'],
    [111, 'уроков'],
    [0, 'уроков'],
  ])('plural(%i) = %s', (count, expected) => {
    expect(plural(count, 'урок', 'урока', 'уроков')).toBe(expected)
  })

  it('пустая длительность не показывается нулём', () => {
    expect(formatDuration(null)).toBe('без длительности')
    expect(formatDuration(45)).toBe('45 мин')
  })
})
