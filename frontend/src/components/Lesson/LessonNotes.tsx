import { useEffect, useRef, useState } from 'react'
import { lessonsApi } from '@/services/api'
import type { PreviousNote } from '@/types'
import { formatDateTime } from '@/utils/format'

interface Props {
  lessonId: string
  value: string
  /** Заметки с прошлых занятий с теми же учениками — только для чтения */
  previous?: PreviousNote[]
  onSaved: () => void
}

const AUTOSAVE_MS = 800

/** Быстрые заметки преподавателя: что прошли, на что обратить внимание. Ученику не видны. */
export function LessonNotes({ lessonId, value, previous = [], onSaved }: Props) {
  const [text, setText] = useState(value)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timerRef = useRef<number | null>(null)
  const savedRef = useRef(value)

  useEffect(() => {
    setText(value)
    savedRef.current = value
  }, [value, lessonId])

  // Автосохранение: заметки пишут между делом, кнопку жать некогда
  const schedule = (next: string) => {
    setText(next)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(async () => {
      timerRef.current = null
      if (next === savedRef.current) return
      setState('saving')
      await lessonsApi.update(lessonId, { notes: next })
      savedRef.current = next
      setState('saved')
      onSaved()
    }, AUTOSAVE_MS)
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 8, overflowY: 'auto' }}>
      <textarea
        value={text}
        onChange={(e) => schedule(e.target.value)}
        placeholder="Что прошли, что не даётся, к чему вернуться в следующий раз..."
        style={{ flex: 1, minHeight: 140, resize: 'none', lineHeight: 1.5 }}
      />
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', height: 16, flex: 'none' }}>
        {state === 'saving' && 'Сохранение...'}
        {state === 'saved' && 'Сохранено'}
        {state === 'idle' && 'Видно только вам'}
      </div>

      {/* Чем закончили в прошлый раз — чтобы не вспоминать по памяти */}
      {previous.length > 0 && (
        <section style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{
            font: '600 11px/1 var(--font-ui)',
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-400)',
            marginTop: 4,
          }}>
            С прошлых занятий
          </h3>

          {previous.map((item) => (
            <article key={item.id} style={{
              border: '1px solid var(--ink-200)',
              borderRadius: 'var(--radius-control)',
              padding: 10,
              background: 'var(--ink-25)',
            }}>
              <div style={{ font: '500 12px/1 var(--font-mono)', color: 'var(--ink-500)', marginBottom: 6 }}>
                {formatDateTime(item.scheduledAt)}
                {item.title && ` · ${item.title}`}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--ink-700)' }}>
                {item.notes}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
