import type { ReactNode } from 'react'
import { Icon } from '@/components/UI/icons'
import type { Lesson } from '@/types'
import { formatDuration, formatTime, lessonTitle } from '@/utils/format'

interface Props {
  lesson: Lesson
  onOpen: () => void
  /** Меню урока — только у преподавателя */
  menu?: ReactNode
  /** Кто смотрит: себя в списке участников не называют */
  selfId?: string
}

/**
 * Строка урока в списке дня.
 *
 * Идущий урок зовёт на доску, будущий и прошедший — просто открываются:
 * доска у прошедшего никуда не девается, но звать в неё уже незачем.
 */
export function LessonCard({ lesson, onOpen, menu, selfId }: Props) {
  const cancelled = lesson.status === 'cancelled'
  const active = lesson.status === 'active'
  // Под названием писать нечего: участники ушли в само название. Остаётся
  // причина отмены — единственное, что не влезает в строку значками
  const meta = cancelled && lesson.cancelReason
    ? `Отменил ${lesson.cancelledByName}: ${lesson.cancelReason}`
    : ''

  return (
    <div className={`lesson-card${cancelled ? ' lesson-card--cancelled' : ''}`}>
      <button className="lesson-card__link" onClick={onOpen}>
        <span className="lesson-card__time">
          <span className="lesson-card__hour">{formatTime(lesson.scheduledAt)}</span>
          <span className="lesson-card__dur">{formatDuration(lesson.duration)}</span>
        </span>

        <span className="lesson-card__main">
          <span className="lesson-card__row">
            <span className="lesson-card__title">{lessonTitle(lesson, selfId)}</span>
            {active && (
              <span className="badge badge-brand badge-row">
                <Icon name="signal" size={12} />
                Идёт сейчас
              </span>
            )}
            {lesson.status === 'finished' && <span className="badge badge-neutral">Завершён</span>}
            {cancelled && <span className="badge badge-danger">Отменён</span>}
            {!lesson.hasWhiteboard && <span className="badge badge-neutral">Очный</span>}
          </span>
          {meta && <span className="lesson-card__meta">{meta}</span>}
        </span>
      </button>

      <span className="lesson-card__side">
        {/* Звать на доску есть смысл, пока урок не прошёл: у завершённого она
            никуда не делась, но открывают его ради заметок и домашки */}
        {lesson.hasWhiteboard && !cancelled && lesson.status !== 'finished' ? (
          <button
            className={`${active ? 'btn-primary' : 'btn-secondary'} btn-md btn-row`}
            onClick={onOpen}
          >
            <Icon name="play" size={16} />
            Войти на доску
          </button>
        ) : (
          <button className="btn-outline btn-md btn-row" onClick={onOpen}>
            Открыть урок
            <Icon name="chevron" size={16} />
          </button>
        )}
        {menu}
      </span>
    </div>
  )
}
