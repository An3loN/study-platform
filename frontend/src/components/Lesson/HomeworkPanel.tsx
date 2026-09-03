import { useState, type FormEvent } from 'react'
import { HomeworkChat } from './HomeworkChat'
import { homeworkApi } from '@/services/api'
import { SUBMISSION_LABEL, type Homework, type HomeworkSubmission, type LessonDetail } from '@/types'
import { formatDateTime, toLocalInput, fromLocalInput } from '@/utils/format'

interface Props {
  lesson: LessonDetail
  isTeacher: boolean
  /** Кто смотрит — чтобы подсветить свои сообщения в обсуждении */
  selfId?: string
  onChanged: () => void
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  pending: { background: 'var(--ink-100)', color: 'var(--ink-600)' },
  submitted: { background: 'var(--sun-50)', color: 'var(--sun-600)' },
  revision: { background: 'var(--coral-50)', color: 'var(--coral-600)' },
  accepted: { background: 'var(--aqua-50)', color: 'var(--aqua-600)' },
}

function StatusBadge({ status }: { status: HomeworkSubmission['status'] }) {
  return (
    <span className="badge" style={STATUS_STYLE[status]}>
      {SUBMISSION_LABEL[status]}
    </span>
  )
}

/**
 * Домашка крепится к уроку, на котором задана. Срок по умолчанию — следующий
 * урок, его считает бэкенд; преподаватель может задать свой.
 */
export function HomeworkPanel({ lesson, isTeacher, selfId, onChanged }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<Homework[]>(lesson.homework)
  const [openChat, setOpenChat] = useState<string | null>(null)
  const [grades, setGrades] = useState<Record<string, string>>({})

  const reload = async () => {
    const { data } = await homeworkApi.forLesson(lesson.id)
    setItems(data.results)
    onChanged()
  }

  const replace = (updated: Homework) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() && !file) return
    setSaving(true)
    try {
      await homeworkApi.create(lesson.id, {
        text: text.trim(),
        attachment: file,
        dueAt: fromLocalInput(dueAt),
      })
      setText('')
      setFile(null)
      setDueAt('')
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    await homeworkApi.remove(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
    onChanged()
  }

  const handleDue = async (item: Homework, value: string) => {
    const { data } = await homeworkApi.update(item.id, { dueAt: fromLocalInput(value) })
    replace(data)
    onChanged()
  }

  const toggleDone = async (item: Homework) => {
    const { data } = await homeworkApi.setDone(item.id, !item.mySubmission?.isDone)
    replace(data)
  }

  const review = async (item: Homework, studentId: string, accepted: boolean) => {
    const raw = grades[`${item.id}:${studentId}`]
    const { data } = await homeworkApi.review(item.id, {
      student: studentId,
      accepted,
      grade: accepted && raw ? Number(raw) : null,
    })
    replace(data)
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
          <article key={item.id} style={{
            border: '1px solid var(--ink-200)',
            borderRadius: 'var(--radius-card)',
            padding: 12,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {!isTeacher && (
                <input
                  type="checkbox"
                  checked={Boolean(item.mySubmission?.isDone)}
                  onChange={() => toggleDone(item)}
                  title="Отметить выполненным"
                  style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.text || 'Без описания'}</p>
                {item.attachment && (
                  <a href={item.attachment} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Файл к заданию
                  </a>
                )}
              </div>
              {isTeacher && (
                <button
                  onClick={() => handleRemove(item.id)}
                  className="header-button"
                  style={{ height: 28, padding: '0 8px', fontSize: 12, color: 'var(--coral-600)' }}
                >
                  Удалить
                </button>
              )}
            </div>

            {/* Срок: преподаватель правит, ученик видит */}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {isTeacher ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-500)' }}>
                  Сдать до
                  <input
                    type="datetime-local"
                    value={toLocalInput(item.dueAt)}
                    onChange={(event) => handleDue(item, event.target.value)}
                    style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                  />
                </label>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
                  {item.effectiveDueAt ? `Сдать до ${formatDateTime(item.effectiveDueAt)}` : 'Срок не назначен'}
                </span>
              )}
              {isTeacher && !item.dueAt && (
                <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                  по умолчанию — до следующего урока
                  {item.effectiveDueAt && ` (${formatDateTime(item.effectiveDueAt)})`}
                </span>
              )}
              {!isTeacher && item.mySubmission && <StatusBadge status={item.mySubmission.status} />}
              {!isTeacher && item.mySubmission?.grade && (
                <span className="badge" style={STATUS_STYLE.accepted}>Оценка {item.mySubmission.grade}</span>
              )}
            </div>

            {/* Преподавателю — состояние по каждому ученику и приёмка */}
            {isTeacher && lesson.students.map((student) => {
              const submission = item.submissions.find((s) => s.student.id === student.id)
              const status = submission?.status ?? 'pending'
              const key = `${item.id}:${student.id}`
              return (
                <div key={student.id} style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--ink-100)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{student.displayName}</span>
                  <StatusBadge status={status} />
                  {submission?.grade && (
                    <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>оценка {submission.grade}</span>
                  )}

                  <select
                    value={grades[key] ?? String(submission?.grade ?? '')}
                    onChange={(event) => setGrades((prev) => ({ ...prev, [key]: event.target.value }))}
                    title="Оценка необязательна"
                    style={{ width: 'auto', marginLeft: 'auto', padding: '4px 8px', fontSize: 12 }}
                  >
                    <option value="">без оценки</option>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                  <button
                    className="btn-primary"
                    style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                    onClick={() => review(item, student.id, true)}
                  >
                    Принять
                  </button>
                  <button
                    className="header-button"
                    style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--coral-600)' }}
                    onClick={() => review(item, student.id, false)}
                  >
                    На поправки
                  </button>
                </div>
              )
            })}

            <button
              className="header-button"
              style={{ height: 30, padding: '0 8px', fontSize: 12, marginTop: 8 }}
              onClick={() => setOpenChat((prev) => (prev === item.id ? null : item.id))}
            >
              Обсуждение{item.messagesCount > 0 && ` · ${item.messagesCount}`}
            </button>

            {openChat === item.id && (
              <HomeworkChat homeworkId={item.id} selfId={selfId} onSent={reload} />
            )}
          </article>
        ))}
      </div>

      {isTeacher && (
        <form
          onSubmit={handleAdd}
          style={{ borderTop: '1px solid var(--ink-100)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            placeholder="Что сделать к следующему уроку"
            style={{ resize: 'none' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-500)' }}>
            Сдать до
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            />
            <span style={{ color: 'var(--ink-400)' }}>пусто — до следующего урока</span>
          </label>
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
