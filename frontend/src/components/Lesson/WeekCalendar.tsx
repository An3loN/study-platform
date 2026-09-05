import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Icon } from '@/components/UI/icons'
import { lessonsApi } from '@/services/api'
import type { Lesson } from '@/types'
import {
  addDays,
  formatDayLong,
  formatWeekLabel,
  fromDateInput,
  isSameDay,
  plural,
  startOfDay,
  startOfWeek,
  toDateInput,
  weekdayShort,
} from '@/utils/format'

interface Props {
  /** Чем заполнить список выбранного дня */
  renderLesson: (lesson: Lesson) => ReactNode
  /** Кнопки справа от заголовка — «Добавить урок» у преподавателя */
  tools?: ReactNode
  /** Показывать ли что-то вместо списка, когда день пуст */
  emptyAction?: ReactNode
  /** Считаем день загруженным начиная с этого числа уроков */
  busyFrom?: number
  /** Чтобы обновиться после создания или отмены урока */
  reloadKey?: number
}

/**
 * Неделя слева, уроки выбранного дня справа.
 *
 * Уроки грузятся сразу на всю неделю одним запросом: перелистывание дней
 * внутри недели тогда не ходит на сервер, а число уроков в дне известно
 * заранее — по нему и рисуется пометка загруженности.
 */
export function WeekCalendar({
  renderLesson, tools, emptyAction, busyFrom = 3, reloadKey = 0,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [selected, setSelected] = useState(today)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)

  // Зависимость по числу, а не по объекту Date: startOfWeek возвращает новый
  // объект на каждый пересчёт, и на нём эффект перезапускался при выборе
  // другого дня той же недели — то есть неделя грузилась заново на каждый клик
  const mondayTime = useMemo(() => startOfWeek(selected).getTime(), [selected])
  const monday = useMemo(() => new Date(mondayTime), [mondayTime])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  )

  useEffect(() => {
    const from = new Date(mondayTime)
    let cancelled = false
    setLoading(true)
    lessonsApi
      .list({ from: from.toISOString(), to: addDays(from, 7).toISOString() })
      .then(({ data }) => { if (!cancelled) setLessons(data.results) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mondayTime, reloadKey])

  const lessonsOf = (day: Date) => lessons.filter(
    (lesson) => lesson.scheduledAt && isSameDay(new Date(lesson.scheduledAt), day),
  )
  const dayLessons = lessonsOf(selected)

  return (
    <section className="section">
      <div className="section__head">
        <h3 className="section__title">Уроки</h3>
        <div className="section__tools">
          <label className="date-jump">
            <span className="date-jump__label">Перейти к дню</span>
            <input
              type="date"
              value={toDateInput(selected)}
              onChange={(e) => e.target.value && setSelected(fromDateInput(e.target.value))}
            />
          </label>
          {tools}
        </div>
      </div>

      <div className="calendar">
        <div className="calendar__aside">
          <div className="calendar__nav">
            <button
              className="icon-button"
              onClick={() => setSelected(addDays(selected, -7))}
              title="Предыдущая неделя"
            >
              <Icon name="chevron" size={18} className="icon-flip" />
            </button>
            <span className="calendar__nav-label">{formatWeekLabel(monday)}</span>
            <button
              className="icon-button"
              onClick={() => setSelected(addDays(selected, 7))}
              title="Следующая неделя"
            >
              <Icon name="chevron" size={18} />
            </button>
          </div>

          <div className="calendar__caption">
            <span>Дни</span>
            <span>уроков</span>
          </div>

          {days.map((day) => {
            const count = lessonsOf(day).length
            const active = isSameDay(day, selected)
            return (
              <button
                key={day.toISOString()}
                className={[
                  'calendar__day',
                  active ? 'calendar__day--active' : '',
                  isSameDay(day, today) ? 'calendar__day--today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelected(day)}
              >
                <span className="calendar__day-text">
                  <span>{weekdayShort(day)}, {day.getDate()}</span>
                  <span className="calendar__day-note">
                    {isSameDay(day, today) ? 'сегодня' : day.toLocaleDateString('ru-RU', { month: 'short' })}
                  </span>
                </span>
                <span className={`calendar__pill${count >= busyFrom ? ' calendar__pill--busy' : ''}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="calendar__list">
          <div className="page-head" style={{ gap: 2 }}>
            <span className="section__title">{formatDayLong(selected)}</span>
            <span className="page-head__sub">
              {loading
                ? 'Загрузка...'
                : dayLessons.length > 0
                  ? `${dayLessons.length} ${plural(dayLessons.length, 'урок', 'урока', 'уроков')}`
                  : 'Свободный день'}
            </span>
          </div>

          {dayLessons.map((lesson) => renderLesson(lesson))}

          {!loading && dayLessons.length === 0 && (
            <div className="empty-block">
              <Icon name="calendar" size={28} />
              <span>В этот день уроков нет.</span>
              {emptyAction}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
