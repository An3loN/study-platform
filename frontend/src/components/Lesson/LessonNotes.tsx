import { useEffect, useRef, useState } from 'react'
import { lessonsApi } from '@/services/api'

interface Props {
  lessonId: string
  value: string
  onSaved: () => void
}

const AUTOSAVE_MS = 800

/** Быстрые заметки преподавателя: что прошли, на что обратить внимание. Ученику не видны. */
export function LessonNotes({ lessonId, value, onSaved }: Props) {
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, gap: 8 }}>
      <textarea
        value={text}
        onChange={(e) => schedule(e.target.value)}
        placeholder="Что прошли, что не даётся, к чему вернуться в следующий раз..."
        style={{ flex: 1, resize: 'none', lineHeight: 1.5 }}
      />
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', height: 16 }}>
        {state === 'saving' && 'Сохранение...'}
        {state === 'saved' && 'Сохранено'}
        {state === 'idle' && 'Видно только вам'}
      </div>
    </div>
  )
}
