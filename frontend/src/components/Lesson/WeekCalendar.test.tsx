import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockAdapter from 'axios-mock-adapter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from '@/services/api'
import type { Lesson } from '@/types'
import { addDays, startOfWeek, toDateInput } from '@/utils/format'
import { WeekCalendar } from './WeekCalendar'

/**
 * Календарь недели.
 *
 * Ради этого он и грузит неделю целиком одним запросом: перелистывание дней
 * внутри недели не должно ходить на сервер, а число уроков в дне известно
 * заранее. Если запрос начнёт уходить на каждый день, счётчики останутся
 * правильными и заметить это будет нечем — поэтому здесь считаются запросы.
 */

let mock: MockAdapter
const MONDAY = startOfWeek(new Date(2026, 2, 10))

function person(id: string, displayName: string) {
  return {
    id, displayName, firstName: displayName, lastName: '', alias: '',
    avatar: null, role: 'student' as const,
  }
}

function lesson(id: string, at: Date, fields: Partial<Lesson> = {}): Lesson {
  return {
    id,
    title: '',
    scheduledAt: at.toISOString(),
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

/** Ответ отдаём в snake_case: интерцептор переведёт его сам, как в бою */
function paginated(lessons: Lesson[]) {
  return {
    count: lessons.length,
    next: null,
    previous: null,
    results: lessons.map((item) => ({
      ...item,
      scheduled_at: item.scheduledAt,
      has_whiteboard: item.hasWhiteboard,
      homework_count: item.homeworkCount,
      cancelled_at: item.cancelledAt,
      cancel_reason: item.cancelReason,
      cancelled_by_name: item.cancelledByName,
      teacher_name: item.teacherName,
    })),
  }
}

beforeEach(() => {
  mock = new MockAdapter(http)
  vi.setSystemTime(new Date(2026, 2, 10, 9, 0))
})

afterEach(() => {
  mock.restore()
  vi.useRealTimers()
})

const renderLesson = (item: Lesson) => <div key={item.id}>урок {item.id}</div>

describe('WeekCalendar', () => {
  it('грузит неделю одним запросом', async () => {
    mock.onGet('/lessons/').reply(200, paginated([lesson('a', new Date(2026, 2, 10, 12))]))

    render(<WeekCalendar renderLesson={renderLesson} />)

    await waitFor(() => expect(mock.history.get).toHaveLength(1))
    expect(mock.history.get[0].params).toMatchObject({
      from: MONDAY.toISOString(),
      to: addDays(MONDAY, 7).toISOString(),
    })
  })

  it('показывает уроки выбранного дня', async () => {
    mock.onGet('/lessons/').reply(200, paginated([
      lesson('a', new Date(2026, 2, 10, 12)),
      lesson('b', new Date(2026, 2, 12, 12)),
    ]))

    render(<WeekCalendar renderLesson={renderLesson} />)

    expect(await screen.findByText('урок a')).toBeInTheDocument()
    expect(screen.queryByText('урок b')).not.toBeInTheDocument()
  })

  it('считает уроки по дням недели', async () => {
    mock.onGet('/lessons/').reply(200, paginated([
      lesson('a', new Date(2026, 2, 10, 10)),
      lesson('b', new Date(2026, 2, 10, 14)),
      lesson('c', new Date(2026, 2, 12, 12)),
    ]))

    const { container } = render(<WeekCalendar renderLesson={renderLesson} />)

    await waitFor(() => {
      const pills = [...container.querySelectorAll('.calendar__pill')].map((p) => p.textContent)
      expect(pills).toEqual(['0', '2', '0', '1', '0', '0', '0'])
    })
  })

  it('переключение дня внутри недели не ходит на сервер', async () => {
    mock.onGet('/lessons/').reply(200, paginated([
      lesson('a', new Date(2026, 2, 10, 12)),
      lesson('b', new Date(2026, 2, 12, 12)),
    ]))

    render(<WeekCalendar renderLesson={renderLesson} />)
    await screen.findByText('урок a')

    await userEvent.click(screen.getByRole('button', { name: /чт, 12/ }))

    expect(await screen.findByText('урок b')).toBeInTheDocument()
    expect(mock.history.get).toHaveLength(1)
  })

  it('переключение недели грузит новую', async () => {
    mock.onGet('/lessons/').reply(200, paginated([]))

    render(<WeekCalendar renderLesson={renderLesson} />)
    await waitFor(() => expect(mock.history.get).toHaveLength(1))

    await userEvent.click(screen.getByTitle('Следующая неделя'))

    await waitFor(() => expect(mock.history.get).toHaveLength(2))
    expect(mock.history.get[1].params.from).toBe(addDays(MONDAY, 7).toISOString())
  })

  it('пустой день предлагает добавить урок', async () => {
    mock.onGet('/lessons/').reply(200, paginated([]))

    render(
      <WeekCalendar renderLesson={renderLesson} emptyAction={<button>Добавить урок</button>} />,
    )

    expect(await screen.findByText('В этот день уроков нет.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить урок' })).toBeInTheDocument()
  })

  it('загруженный день помечается', async () => {
    mock.onGet('/lessons/').reply(200, paginated([
      lesson('a', new Date(2026, 2, 10, 9)),
      lesson('b', new Date(2026, 2, 10, 11)),
      lesson('c', new Date(2026, 2, 10, 13)),
    ]))

    const { container } = render(<WeekCalendar renderLesson={renderLesson} busyFrom={3} />)

    await waitFor(() => {
      expect(container.querySelector('.calendar__pill--busy')?.textContent).toBe('3')
    })
  })

  it('перезагружается по смене ключа', async () => {
    mock.onGet('/lessons/').reply(200, paginated([]))

    const { rerender } = render(<WeekCalendar renderLesson={renderLesson} reloadKey={0} />)
    await waitFor(() => expect(mock.history.get).toHaveLength(1))

    rerender(<WeekCalendar renderLesson={renderLesson} reloadKey={1} />)

    await waitFor(() => expect(mock.history.get).toHaveLength(2))
  })

  it('прыжок по дате уводит на нужный день', async () => {
    mock.onGet('/lessons/').reply(200, paginated([lesson('b', new Date(2026, 2, 12, 12))]))

    const { container } = render(<WeekCalendar renderLesson={renderLesson} />)
    await waitFor(() => expect(mock.history.get).toHaveLength(1))

    // Поле типа date заполняем разом: посимвольный ввод в него зависит от
    // раскладки браузера и к делу отношения не имеет
    const input = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: toDateInput(new Date(2026, 2, 12)) } })

    expect(await screen.findByText('урок b')).toBeInTheDocument()
  })
})
