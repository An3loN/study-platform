import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon, initials } from '@/components/UI/icons'
import { homeworkApi } from '@/services/api'
import type { HomeworkMessage } from '@/types'
import { formatDateTime } from '@/utils/format'

interface Props {
  homeworkId: string
  /**
   * Чья это ветка. Преподаватель указывает ученика явно — он говорит с каждым
   * отдельно; ученику указывать нечего, сервер и так знает, что ветка его.
   */
  student?: string
  /** Кто смотрит: свои сообщения выравниваются по правому краю */
  selfId?: string
  /** Кто ведёт урок: его реплики выделены цветом — в них замечания */
  teacherId?: string
  placeholder: string
  /**
   * compact — переписка внутри карточки работы, лента растёт вместе с карточкой.
   * full — отдельная область окна со своей прокруткой.
   */
  variant?: 'compact' | 'full'
  onSent?: () => void
}

/**
 * Переписка по одному заданию с одним учеником: вопросы, присланная работа,
 * замечания. Файл, отправленный учеником, здесь же считается его работой —
 * отдельного места для сдачи нет и не нужно.
 */
export function HomeworkThread({
  homeworkId, student, selfId, teacherId, placeholder, variant = 'compact', onSent,
}: Props) {
  const [messages, setMessages] = useState<HomeworkMessage[]>([])
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    homeworkApi.messages(homeworkId, student)
      .then(({ data }) => { if (!cancelled) setMessages(data) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [homeworkId, student])

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() && !file) return
    setSending(true)
    try {
      const { data } = await homeworkApi.sendMessage(homeworkId, {
        text: text.trim(), attachment: file, student,
      })
      setMessages((prev) => [...prev, data])
      setText('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onSent?.()
    } finally {
      setSending(false)
    }
  }

  const list = (
    <div className="hw-thread">
      {loading && <p className="hw-note">Загрузка переписки...</p>}

      {!loading && messages.length === 0 && (
        <p className="hw-note">Пока пусто. Здесь спрашивают по заданию и присылают готовую работу файлом.</p>
      )}

      {messages.map((message) => {
        const mine = message.author.id === selfId
        const fromTeacher = message.author.id === teacherId
        return (
          <div key={message.id} className={`hw-msg${mine ? ' hw-msg--mine' : ''}${fromTeacher ? ' hw-msg--teacher' : ''}`}>
            <div
              className={`hw-avatar${fromTeacher ? ' hw-avatar--teacher' : ''}`}
              style={{ width: 26, height: 26, fontSize: 11 }}
            >
              {initials(message.author.displayName)}
            </div>
            <div className="hw-msg__body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                {!mine && <span className="hw-msg__author">{message.author.displayName}</span>}
                <span className="hw-msg__meta">{formatDateTime(message.createdAt)}</span>
                {mine && <span className="hw-msg__author">Вы</span>}
              </div>
              {message.text && <div className="hw-msg__text">{message.text}</div>}
              {message.attachment && (
                <a className="hw-file" href={message.attachment} target="_blank" rel="noreferrer">
                  <Icon name="clip" size={13} />
                  {message.attachmentName ?? 'Файл'}
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  const composer = (
    <form onSubmit={handleSend} className="hw-composer">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
      />
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
        style={file ? { color: 'var(--sky-600)' } : undefined}
      >
        <Icon name="clip" size={variant === 'full' ? 16 : 15} />
      </button>
      {variant === 'full' ? (
        <button type="submit" className="btn-primary" disabled={sending || (!text.trim() && !file)}>
          {sending ? 'Отправка...' : 'Отправить'}
        </button>
      ) : (
        <button
          type="submit"
          className="hw-composer__send"
          title="Отправить"
          disabled={sending || (!text.trim() && !file)}
        >
          <Icon name="send" size={16} />
        </button>
      )}
    </form>
  )

  if (variant === 'full') {
    return (
      <>
        <div className="hw-list" style={{ paddingTop: 6 }}>{list}</div>
        <div style={{
          flex: 'none',
          borderTop: '1px solid var(--ink-100)',
          padding: '12px 22px 16px',
        }}>
          {composer}
        </div>
      </>
    )
  }

  return (
    <>
      {list}
      {composer}
    </>
  )
}
