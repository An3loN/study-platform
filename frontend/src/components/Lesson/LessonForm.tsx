import { useState, FormEvent } from 'react'
import { Field } from '@/components/UI/Field'
import type { LessonDetail, LessonInput, Student } from '@/types'
import { toLocalInput, fromLocalInput } from '@/utils/format'

interface Props {
  students: Student[]
  initial?: LessonDetail
  /** Предвыбранный ученик — когда урок создают из карточки ученика */
  presetStudentId?: string
  /** Длительность из настроек ученика: подставляется в новый урок */
  defaultDuration?: number | null
  submitLabel?: string
  onSubmit: (data: LessonInput) => Promise<void>
  onCancel?: () => void
}

/**
 * Время, длительность, ученики и комментарий — всё можно оставить пустым.
 *
 * Темы урока в форме нет: на каждое занятие с одним и тем же учеником её
 * заполняли бы одинаково, а в списке урок и так подписан именами участников.
 * У старых уроков тема осталась в базе — форма её не трогает, потому что
 * `title` в запрос не попадает вовсе.
 */
export function LessonForm({
  students, initial, presetStudentId, defaultDuration,
  submitLabel = 'Создать урок', onSubmit, onCancel,
}: Props) {
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(initial?.scheduledAt ?? null))
  const [duration, setDuration] = useState(
    initial?.duration ? String(initial.duration) : (defaultDuration ? String(defaultDuration) : ''),
  )
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [hasWhiteboard, setHasWhiteboard] = useState(initial?.hasWhiteboard ?? true)
  const [selected, setSelected] = useState<string[]>(
    initial?.students.map((s) => s.id) ?? (presetStudentId ? [presetStudentId] : []),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleStudent = (id: string) => {
    // Ученика, с чьей страницы пришли, не снимаем: урок создаётся для него
    if (id === presetStudentId) return
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        scheduledAt: fromLocalInput(scheduledAt),
        duration: duration ? Number(duration) : null,
        comment,
        students: selected,
        hasWhiteboard,
      })
    } catch {
      setError('Не удалось сохранить урок.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        <div style={{ flex: 2 }}>
          <Field
            label="Время"
            type="datetime-local"
            numeric
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Field
            label="Длительность"
            type="number"
            min={0}
            step={5}
            numeric
            placeholder="45"
            hint={defaultDuration ? 'По умолчанию у ученика' : undefined}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span className="field__label">Ученики</span>
          <span className="section__count">
            {selected.length > 0 ? `выбрано ${selected.length}` : 'никто не выбран'}
          </span>
        </div>

        {students.length === 0 ? (
          <span className="field__hint">Учеников пока нет — урок можно создать и назначить позже.</span>
        ) : (
          <div className="chips">
            {students.map((student) => {
              const on = selected.includes(student.id)
              const locked = student.id === presetStudentId
              return (
                <button
                  type="button"
                  key={student.id}
                  className={`chip${on ? ' chip--on' : ''}${locked ? ' chip--locked' : ''}`}
                  onClick={() => toggleStudent(student.id)}
                >
                  {student.displayName}
                </button>
              )
            })}
          </div>
        )}
        <span className="field__hint">
          {presetStudentId
            ? 'Ученик выбран — вы пришли с его страницы. Можно добавить ещё.'
            : 'Можно назначить позже — из карточки ученика.'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span className="field__label">Комментарий</span>
        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например, ссылка на аудиоконференцию"
          style={{ resize: 'none' }}
        />
      </div>

      <label className="switch-row">
        <span className="switch-row__text">
          <span className="switch-row__label">Совместная доска</span>
          <span className="switch-row__hint">
            {hasWhiteboard
              ? 'Урок онлайн: доска и вход по ссылке'
              : 'Очный урок: останутся заметки и домашние задания'}
          </span>
        </span>
        <input
          type="checkbox"
          checked={hasWhiteboard}
          onChange={(e) => setHasWhiteboard(e.target.checked)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
        <span className={`switch${hasWhiteboard ? ' switch--on' : ''}`} />
      </label>

      {error && <p className="error-text">{error}</p>}

      <div className="dialog__actions">
        {onCancel && (
          <button type="button" className="btn-ghost btn-md" onClick={onCancel}>Отмена</button>
        )}
        <button type="submit" className="btn-primary btn-md" disabled={saving}>
          {saving ? 'Сохранение...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
