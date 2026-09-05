import { useState, FormEvent } from 'react'
import { Field } from '@/components/UI/Field'
import { Icon } from '@/components/UI/icons'
import { homeworkApi } from '@/services/api'
import type { Student } from '@/types'
import { fromLocalInput } from '@/utils/format'

interface Props {
  students: Student[]
  /** Ученик, с чьей страницы пришли: выбран заранее и не снимается */
  presetStudentId?: string
  onDone: () => void
  onCancel: () => void
}

/**
 * Задание без урока: адресатов перечисляем сами.
 *
 * Задание к занятию заводится на самом уроке — там адресаты уже известны,
 * и спрашивать их второй раз незачем.
 */
export function HomeworkForm({ students, presetStudentId, onDone, onCancel }: Props) {
  const [selected, setSelected] = useState<string[]>(presetStudentId ? [presetStudentId] : [])
  const [text, setText] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) => {
    if (id === presetStudentId) return
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (selected.length === 0) {
      setError('Отметьте, кому задано.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await homeworkApi.createForStudents({
        students: selected,
        text: text.trim(),
        dueAt: fromLocalInput(dueAt),
        attachment: file,
      })
      onDone()
    } catch {
      setError('Не удалось создать задание.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span className="field__label">Кому</span>
          <span className="section__count">
            {selected.length > 0 ? `выбрано ${selected.length}` : 'никто не выбран'}
          </span>
        </div>

        {students.length === 0 ? (
          <span className="field__hint">Учеников пока нет — сначала заведите ученика.</span>
        ) : (
          <div className="chips">
            {students.map((student) => (
              <button
                type="button"
                key={student.id}
                className={[
                  'chip',
                  selected.includes(student.id) ? 'chip--on' : '',
                  student.id === presetStudentId ? 'chip--locked' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggle(student.id)}
              >
                {student.displayName}
              </button>
            ))}
          </div>
        )}
        <span className="field__hint">Задание увидят только отмеченные ученики.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span className="field__label">Задание</span>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Что сделать к следующему уроку"
          style={{ resize: 'none' }}
          autoFocus
        />
        <span className="field__hint">Первая строка станет заголовком в списке заданий.</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-5)' }}>
        <div style={{ flex: 2 }}>
          <Field
            label="Сдать до"
            type="datetime-local"
            numeric
            hint="Пусто — до следующего урока"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <label className="btn-outline btn-md btn-row" style={{ cursor: 'pointer', marginBottom: 22 }}>
          <Icon name="clip" size={16} />
          {file ? file.name.slice(0, 18) : 'Файл'}
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="dialog__actions">
        <button type="button" className="btn-ghost btn-md" onClick={onCancel}>Отмена</button>
        <button type="submit" className="btn-primary btn-md" disabled={saving || (!text.trim() && !file)}>
          {saving ? 'Сохранение...' : 'Задать'}
        </button>
      </div>
    </form>
  )
}
