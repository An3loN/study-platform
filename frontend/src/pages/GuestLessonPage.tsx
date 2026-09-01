import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { WhiteboardRoom } from '@/components/Whiteboard/WhiteboardRoom'
import { Chat } from '@/components/Lesson/Chat'
import { LessonSidebar } from '@/components/Lesson/LessonSidebar'
import { useLessonRoom } from '@/hooks/useLessonRoom'
import { lessonsApi } from '@/services/api'
import type { GuestSession, LessonShare } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDuration, lessonTitle } from '@/utils/format'

/**
 * Вход на урок по ссылке без аккаунта: гость называет имя и получает
 * временный токен на комнату — доска и чат, ничего больше.
 */
export function GuestLessonPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const [lesson, setLesson] = useState<LessonShare | null>(null)
  const [session, setSession] = useState<GuestSession | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  // Соединение живёт на уровне страницы: сворачивание панели не должно
  // выкидывать гостя из списка участников
  const room = useLessonRoom(session?.roomId, session?.access)

  useEffect(() => {
    if (!shareToken) return
    lessonsApi.shareInfo(shareToken)
      .then(({ data }) => setLesson(data))
      .catch(() => setLesson(null))
      .finally(() => setLoading(false))
  }, [shareToken])

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault()
    if (!shareToken) return
    setError('')
    setJoining(true)
    try {
      const { data } = await lessonsApi.join(shareToken, name.trim())
      setSession(data)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail || 'Не удалось войти на урок.')
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return <Centered><p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p></Centered>
  }

  if (!lesson) {
    return (
      <Centered>
        <p style={{ marginBottom: 12 }}>Ссылка недействительна или урок удалён.</p>
        <Link to="/login">Войти в аккаунт</Link>
      </Centered>
    )
  }

  // Гость представился — показываем доску и чат
  if (session) {
    const conferenceUrl = session.lesson.comment.match(/https?:\/\/\S+/)?.[0] ?? null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 16px',
          height: 48,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>{lessonTitle(session.lesson)}</h2>
            <span className={`badge badge-${session.lesson.status}`}>{STATUS_LABEL[session.lesson.status]}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {session.lesson.teacherName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {conferenceUrl && (
              <a href={conferenceUrl} target="_blank" rel="noreferrer">
                <button className="btn-secondary">Конференция</button>
              </a>
            )}
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Вы вошли как {session.name}</span>
          </div>
        </header>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WhiteboardRoom
              roomId={session.roomId}
              accessToken={session.access}
              readonly={session.lesson.status === 'finished'}
            />
          </div>
          <LessonSidebar
            storageKey="guest_lesson_sidebar"
            tabs={[{ key: 'chat', label: 'Чат', render: () => <Chat room={room} /> }]}
          />
        </div>
      </div>
    )
  }

  return (
    <Centered>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{lessonTitle(lesson)}</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {lesson.teacherName} · {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
      </p>

      <form onSubmit={handleJoin}>
        <div className="form-group">
          <label>Как вас зовут?</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={joining || !name.trim()}>
          {joining ? 'Подключение...' : 'Войти на урок'}
        </button>
      </form>

      <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Есть аккаунт? <Link to="/login">Войти по телефону</Link>
      </p>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: 16,
    }}>
      <div className="card" style={{ width: 400, maxWidth: '100%' }}>{children}</div>
    </div>
  )
}
