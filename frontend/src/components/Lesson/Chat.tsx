import { useEffect, useRef, useState } from 'react'
import type { LessonRoom } from '@/hooks/useLessonRoom'

interface Props {
  room: LessonRoom
}

/**
 * Только отображение: соединение с комнатой держит страница урока
 * (см. useLessonRoom), поэтому переключение вкладок не рвёт связь.
 */
export function Chat({ room }: Props) {
  const { messages, people, connected, sendMessage } = room
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  // Автоскролл к последнему сообщению
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-surface)' }}>
      {/* Участники */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          В комнате ({people.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {people.map((p) => (
            <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-success)',
                display: 'inline-block',
              }} />
              {p.username}
            </div>
          ))}
        </div>
      </div>

      {/* Сообщения */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{msg.username}: </span>
            <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{msg.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Ввод */}
      <div style={{ padding: 10, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? 'Написать...' : 'Нет соединения'}
          disabled={!connected}
          style={{ flex: 1 }}
        />
        <button
          onClick={handleSend}
          disabled={!connected || !input.trim()}
          className="btn-primary"
          style={{ padding: '8px 14px' }}
        >
          →
        </button>
      </div>
    </div>
  )
}
