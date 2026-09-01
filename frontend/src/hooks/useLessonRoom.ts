import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WsMessage } from '@/types'

export interface ChatMessage {
  userId: string
  username: string
  message: string
}

export interface Participant {
  /** Одно подключение, а не один человек: у него может быть открыто две вкладки */
  connectionId: string
  userId: string
  username: string
}

export interface LessonRoom {
  messages: ChatMessage[]
  participants: Participant[]
  /** Участники, схлопнутые по людям */
  people: Participant[]
  connected: boolean
  sendMessage: (text: string) => void
}

/**
 * Соединение с комнатой урока живёт на уровне страницы, а не внутри чата.
 * Иначе переключение боковой вкладки размонтирует чат, сокет закрывается —
 * человек пропадает из списка участников у всех, а история сообщений теряется.
 */
export function useLessonRoom(roomId?: string, accessToken?: string): LessonRoom {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!roomId || !accessToken) return

    // Абсолютный адрес: WebSocket-конструктор не должен зависеть от базового URL страницы
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/lesson/${roomId}/?token=${encodeURIComponent(accessToken)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as WsMessage

      if (msg.type === 'chat.message') {
        setMessages((prev) => [...prev, { userId: msg.userId, username: msg.username, message: msg.message }])
      } else if (msg.type === 'presence.join') {
        setParticipants((prev) => (
          prev.some((p) => p.connectionId === msg.connectionId)
            ? prev
            : [...prev, { connectionId: msg.connectionId, userId: msg.userId, username: msg.username }]
        ))
      } else if (msg.type === 'presence.leave') {
        setParticipants((prev) => prev.filter((p) => p.connectionId !== msg.connectionId))
      }
    }

    return () => {
      wsRef.current = null
      setParticipants([])
      ws.close()
    }
  }, [roomId, accessToken])

  const sendMessage = useCallback((text: string) => {
    const message = text.trim()
    const ws = wsRef.current
    if (!message || !ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'chat.message', message }))
  }, [])

  // Несколько подключений одного человека показываем одной строкой
  const people = useMemo(
    () => participants.filter(
      (p, index) => participants.findIndex((other) => other.userId === p.userId) === index,
    ),
    [participants],
  )

  return { messages, participants, people, connected, sendMessage }
}
