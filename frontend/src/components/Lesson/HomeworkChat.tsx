import { useEffect, useRef, useState, type FormEvent } from 'react'
import { homeworkApi } from '@/services/api'
import type { HomeworkMessage } from '@/types'
import { formatDateTime } from '@/utils/format'

interface Props {
  homeworkId: string
  /** Своё имя — свои сообщения выделяются */
  selfId?: string
  onSent?: () => void
}

/**
 * Обсуждение задания: вопросы, готовые работы файлами, замечания.
 * Своя ветка у каждого задания — разговор о конкретной работе не должен
 * теряться среди остальных.
 */
export function HomeworkChat({ homeworkId, selfId, onSent }: Props) {
  const [messages, setMessages] = useState<HomeworkMessage[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    homeworkApi.messages(homeworkId)
      .then(({ data }) => { if (!cancelled) setMessages(data) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [homeworkId])

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() && !file) return
    setSending(true)
    try {
      const { data } = await homeworkApi.sendMessage(homeworkId, { text: text.trim(), attachment: file })
      setMessages((prev) => [...prev, data])
      setText('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onSent?.()
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {loading && <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>Загрузка обсуждения...</p>}

      {!loading && messages.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>
          Здесь можно задать вопрос по заданию или прислать готовую работу файлом.
        </p>
      )}

      {messages.map((message) => {
        const mine = message.author.id === selfId
        return (
          <div key={message.id} style={{
            alignSelf: mine ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            padding: '8px 10px',
            borderRadius: 'var(--radius-control)',
            background: mine ? 'var(--sky-50)' : 'var(--ink-50)',
            border: `1px solid ${mine ? 'var(--sky-100)' : 'var(--ink-200)'}`,
          }}>
            <div style={{ font: '600 11px/1 var(--font-ui)', color: 'var(--ink-500)', marginBottom: 4 }}>
              {message.author.displayName} · {formatDateTime(message.createdAt)}
            </div>
            {message.text && (
              <p style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{message.text}</p>
            )}
            {message.attachment && (
              <a href={message.attachment} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                Прикреплённый файл
              </a>
            )}
          </div>
        )
      })}

      <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder="Вопрос или комментарий"
          style={{ resize: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            style={{ fontSize: 12, padding: 0, border: 'none', flex: 1, background: 'transparent' }}
          />
          <button type="submit" className="btn-primary" disabled={sending || (!text.trim() && !file)}>
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </form>
    </div>
  )
}
