import { useState, FormEvent } from 'react'
import type { LessonDetail, LessonInput, Student } from '@/types'
import { toLocalInput, fromLocalInput } from '@/utils/format'

interface Props {
  students: Student[]
  initial?: LessonDetail
  /** Предвыбранный ученик — когда урок создают из карточки ученика */
  presetStudentId?: string
  submitLabel?: string
  onSubmit: (data: LessonInput) => Promise<void>
  onCancel?: () => void
}

/** Время, длительность, ученики и комментарий — всё можно оставить пустым. */
export function LessonForm({
  students, initial, presetStudentId, submitLabel = 'Создать', onSubmit, onCancel,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(initial?.scheduledAt ?? null))
  const [duration, setDuration] = useState(initial?.duration ? String(initial.duration) : '')
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [hasWhiteboard, setHasWhiteboard] = useState(initial?.hasWhiteboard ?? true)
  const [selected, setSelected] = useState<string[]>(
    initial?.students.map((s) => s.id) ?? (presetStudentId ? [presetStudentId] : []),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleStudent = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        title,
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
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Тема</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Необязательно" />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="form-group" style={{ flex: 2 }}>
          <label>Время</label>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Длительность, мин</label>
          <input
            type="number"
            min={0}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="45"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Ученики</label>
        {students.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Учеников пока нет — урок можно создать и назначить позже.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {students.map((student) => {
            const active = selected.includes(student.id)
            return (
              <button
                type="button"
                key={student.id}
                onClick={() => toggleStudent(student.id)}
                className={active ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '4px 12px', fontSize: 13 }}
              >
                {student.displayName}
              </button>
            )
          })}
        </div>
      </div>

      <div className="form-group">
        <label>Комментарий</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Например, ссылка на аудиоконференцию"
        />
      </div>

      {/* Очное занятие проходит за одним столом: доска не нужна, а заметки
          и домашние задания остаются. Вместе с доской у такого урока нет
          и ссылки для входа — заходить некуда. */}
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={hasWhiteboard}
            onChange={(e) => setHasWhiteboard(e.target.checked)}
            style={{ width: 'auto', margin: 0 }}
          />
          Совместная доска
        </label>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {hasWhiteboard
            ? 'Урок с доской и ссылкой для входа.'
            : 'Очный урок: останутся только заметки и домашние задания.'}
        </span>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Сохранение...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Отмена</button>
        )}
      </div>
    </form>
  )
}
