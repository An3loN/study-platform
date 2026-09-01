import { useState, FormEvent } from 'react'
import { homeworkApi } from '@/services/api'
import type { Homework, LessonDetail } from '@/types'
import { formatDateTime } from '@/utils/format'

interface Props {
  lesson: LessonDetail
  isTeacher: boolean
  onChanged: () => void
}

/**
 * Домашка крепится к уроку, на котором задана; срок — следующий урок ученика,
 * бэкенд считает его сам.
 */
export function HomeworkPanel({ lesson, isTeacher, onChanged }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<Homework[]>(lesson.homework)

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() && !file) return
    setSaving(true)
    try {
      await homeworkApi.create(lesson.id, { text: text.trim(), attachment: file })
      setText('')
      setFile(null)
      const { data } = await homeworkApi.forLesson(lesson.id)
      setItems(data.results)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    await homeworkApi.remove(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
    onChanged()
  }

  const toggleDone = async (item: Homework) => {
    const { data } = await homeworkApi.setDone(item.id, !item.isDone)
    setItems((prev) => prev.map((h) => (h.id === data.id ? data : h)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {isTeacher ? 'Задание к этому уроку ещё не задано.' : 'Домашнего задания нет.'}
          </p>
        )}

        {items.map((item) => (
          <div key={item.id} style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: 10,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}>
            {!isTeacher && (
              <input
                type="checkbox"
                checked={item.isDone}
                onChange={() => toggleDone(item)}
                style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.text || 'Без описания'}</p>
              {item.attachment && (
                <a href={item.attachment} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  Файл
                </a>
              )}
              <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                {item.dueAt ? `Сдать к ${formatDateTime(item.dueAt)}` : 'Срок — следующий урок'}
                {isTeacher && item.doneBy.length > 0 && (
                  ` · сделали: ${item.doneBy.map((u) => u.displayName).join(', ')}`
                )}
              </p>
            </div>
            {isTeacher && (
              <button
                onClick={() => handleRemove(item.id)}
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: 12, border: 'none', color: 'var(--color-danger)' }}
              >
                Удалить
              </button>
            )}
          </div>
        ))}
      </div>

      {isTeacher && (
        <form
          onSubmit={handleAdd}
          style={{ borderTop: '1px solid var(--color-border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Что сделать к следующему уроку"
            style={{ resize: 'none' }}
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12, padding: 4, border: 'none' }}
          />
          <button type="submit" className="btn-primary" disabled={saving || (!text.trim() && !file)}>
            {saving ? 'Сохранение...' : 'Задать'}
          </button>
        </form>
      )}
    </div>
  )
}
