import { useEffect, useRef, useState, type FormEvent } from 'react'
import { HomeworkModal } from './HomeworkModal'
import { StatusPill, aggregate, doneCount, dueState } from './homeworkParts'
import { Icon } from '@/components/UI/icons'
import { homeworkApi } from '@/services/api'
import type { Homework, LessonDetail } from '@/types'
import { fromLocalInput } from '@/utils/format'

interface Props {
  lesson: LessonDetail
  isTeacher: boolean
  /** Кто смотрит — чтобы подсветить свои сообщения в обсуждении */
  selfId?: string
  onChanged: () => void
}

/**
 * Домашка крепится к уроку, на котором задана. Срок по умолчанию — следующий
 * урок, его считает бэкенд; преподаватель может задать свой.
 *
 * В панели каждое задание — короткая карточка: о чём, как идёт, до когда.
 * Всё остальное — работы, оценки, переписка — открывается окном поверх:
 * в 360 px оно не помещается, а урезать его до панели значит потерять смысл.
 */
export function HomeworkPanel({ lesson, isTeacher, selfId, onChanged }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dueAt, setDueAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<Homework[]>(lesson.homework)
  const [openId, setOpenId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  /**
   * Панель живёт во вкладке, а вкладка при скрытии размонтируется — вместе с
   * локальным состоянием. Поэтому список синхронизируется с уроком, а не
   * копируется один раз при монтировании: иначе после «скрыл и открыл» на
   * экране оказывались данные на момент открытия страницы.
   */
  useEffect(() => { setItems(lesson.homework) }, [lesson.homework])

  const reload = async () => {
    const { data } = await homeworkApi.forLesson(lesson.id)
    setItems(data.results)
    onChanged()
  }

  const replace = (updated: Homework) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    // Урок в родителе тоже должен узнать: панель переживает размонтирование
    // вкладки только через него
    onChanged()
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
      if (fileRef.current) fileRef.current.value = ''
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    await homeworkApi.remove(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
    setOpenId(null)
    onChanged()
  }

  const open = items.find((item) => item.id === openId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {items.length === 0 && (
          <p className="hw-note" style={{ fontSize: 13 }}>
            {isTeacher ? 'Задание к этому уроку ещё не задано.' : 'Домашнего задания нет.'}
          </p>
        )}

        {items.map((item) => {
          const head = aggregate(item, isTeacher)
          const due = dueState(item.effectiveDueAt, !isTeacher)
          const { done, total } = doneCount(item)

          return (
            <div
              key={item.id}
              className="hw-card"
              role="button"
              tabIndex={0}
              title="Открыть подробности и обсуждение"
              onClick={() => setOpenId(item.id)}
              onKeyDown={(event) => { if (event.key === 'Enter') setOpenId(item.id) }}
            >
              <p className="hw-card__text">{item.text || 'Без описания'}</p>

              <div className="hw-card__row">
                <StatusPill kind={head.kind} label={head.label} />
                {isTeacher && total > 0 && (
                  <span className="hw-meta">Сдали {done} из {total}</span>
                )}
                {item.messagesCount > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--sky-600)',
                    font: '600 12px/1.35 var(--font-ui)',
                  }}>
                    <Icon name="message" size={14} />
                    {item.messagesCount}
                  </span>
                )}
              </div>

              <div className="hw-card__due">
                <span style={{ color: due.late ? 'var(--coral-500)' : 'var(--ink-400)' }}>
                  <Icon name="calendar" size={14} />
                </span>
                <span className={`hw-meta${due.late ? ' hw-meta--late' : ''}`}>{due.text}</span>
                {due.note && <span className="hw-note">{due.note}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {isTeacher && (
        <form
          onSubmit={handleAdd}
          style={{
            flex: 'none',
            borderTop: '1px solid var(--ink-100)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            placeholder="Что сделать к следующему уроку"
            style={{ resize: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              className={`date-pill${dueAt ? ' date-pill--set' : ''}`}
              title="Пусто — до следующего урока"
            >
              <Icon name="calendar" size={15} />
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="hw-composer__icon"
              title={file ? file.name : 'Прикрепить файл'}
              onClick={() => fileRef.current?.click()}
              style={{ width: 36, height: 36, ...(file ? { color: 'var(--sky-600)' } : {}) }}
            >
              <Icon name="clip" size={16} />
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ marginLeft: 'auto', height: 36 }}
              disabled={saving || (!text.trim() && !file)}
            >
              {saving ? 'Сохранение...' : 'Задать'}
            </button>
          </div>
        </form>
      )}

      {open && (
        <HomeworkModal
          homework={open}
          isTeacher={isTeacher}
          selfId={selfId}
          teacherId={lesson.teacher.id}
          teacherName={lesson.teacher.displayName}
          onClose={() => setOpenId(null)}
          onChanged={replace}
          onDelete={() => handleRemove(open.id)}
        />
      )}
    </div>
  )
}
