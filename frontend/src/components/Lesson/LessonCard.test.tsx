import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lesson } from '@/types'
import { LessonCard } from './LessonCard'

/**
 * Строка урока в списке дня.
 *
 * Главное здесь — какая кнопка показана. Звать на доску есть смысл, пока урок
 * не прошёл: у завершённого она никуда не делась, но открывают его ради
 * заметок и домашки, а у очного доски нет вовсе.
 */

function person(id: string, displayName: string) {
  return {
    id, displayName, firstName: displayName, lastName: '', alias: '',
    avatar: null, role: 'student' as const,
  }
}

function lesson(fields: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    title: '',
    scheduledAt: '2026-03-10T12:00:00Z',
    duration: 45,
    status: 'scheduled',
    comment: '',
    students: [person('s1', 'Матвей')],
    homeworkCount: 0,
    createdAt: '2026-03-01T00:00:00Z',
    cancelledAt: null,
    cancelReason: '',
    cancelledByName: '',
    hasWhiteboard: true,
    teacherName: 'Мария Иванова',
    notes: null,
    ...fields,
  }
}

describe('LessonCard', () => {
  it('подписывает урок участниками, а не темой', () => {
    render(<LessonCard lesson={lesson({ students: [person('s1', 'Матвей'), person('s2', 'Кира')] })} onOpen={vi.fn()} />)

    expect(screen.getByText('Матвей, Кира')).toBeInTheDocument()
  })

  it('ученик не читает в подписи своё имя', () => {
    render(<LessonCard lesson={lesson()} onOpen={vi.fn()} selfId="s1" />)

    expect(screen.getByText('Мария Иванова')).toBeInTheDocument()
  })

  it('старое название урока сохраняется', () => {
    render(<LessonCard lesson={lesson({ title: 'Математика · дроби' })} onOpen={vi.fn()} />)

    expect(screen.getByText('Математика · дроби')).toBeInTheDocument()
  })

  it('показывает время и длительность', () => {
    render(<LessonCard lesson={lesson({ duration: 90 })} onOpen={vi.fn()} />)

    expect(screen.getByText('90 мин')).toBeInTheDocument()
  })

  it.each([
    ['scheduled', 'Войти на доску'],
    ['active', 'Войти на доску'],
    ['finished', 'Открыть урок'],
    ['cancelled', 'Открыть урок'],
  ] as const)('у урока «%s» кнопка «%s»', (status, label) => {
    render(<LessonCard lesson={lesson({ status })} onOpen={vi.fn()} />)

    expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
  })

  it('у очного урока на доску не зовут', () => {
    render(<LessonCard lesson={lesson({ hasWhiteboard: false })} onOpen={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Войти на доску/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Открыть урок/ })).toBeInTheDocument()
    expect(screen.getByText('Очный')).toBeInTheDocument()
  })

  it('идущий урок помечен значком', () => {
    render(<LessonCard lesson={lesson({ status: 'active' })} onOpen={vi.fn()} />)

    expect(screen.getByText('Идёт сейчас')).toBeInTheDocument()
  })

  it('у отменённого показывает, кто отменил и почему', () => {
    render(
      <LessonCard
        lesson={lesson({ status: 'cancelled', cancelReason: 'заболел', cancelledByName: 'Матвей' })}
        onOpen={vi.fn()}
      />,
    )

    expect(screen.getByText('Отменил Матвей: заболел')).toBeInTheDocument()
    expect(screen.getByText('Отменён')).toBeInTheDocument()
  })

  it('без причины отмены лишней строки не рисует', () => {
    const { container } = render(<LessonCard lesson={lesson()} onOpen={vi.fn()} />)

    // Участники ушли в заголовок — под ним писать нечего
    expect(container.querySelector('.lesson-card__meta')).toBeNull()
  })

  it('открывается и по названию, и по кнопке', async () => {
    const onOpen = vi.fn()
    render(<LessonCard lesson={lesson()} onOpen={onOpen} />)

    await userEvent.click(screen.getByText('Матвей'))
    await userEvent.click(screen.getByRole('button', { name: /Войти на доску/ }))

    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
