import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { WhiteboardRoom } from '@/components/Whiteboard/WhiteboardRoom'
import { lessonsApi } from '@/services/api'
import { loadGuestSession, saveGuestSession, clearGuestSession } from '@/utils/guestSession'
import type { GuestSession, LessonShare } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDuration, lessonTitle } from '@/utils/format'

/**
 * Вход на урок по ссылке без аккаунта: гость называет имя и получает
 * временный токен на комнату — только доска, ничего больше.
 */
export function GuestLessonPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const [lesson, setLesson] = useState<LessonShare | null>(null)
  // Сессия восстанавливается из sessionStorage: перезагрузка страницы не должна
  // выкидывать гостя обратно на форму с именем
  const [session, setSession] = useState<GuestSession | null>(
    () => (shareToken ? loadGuestSession(shareToken) : null),
  )
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

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
      saveGuestSession(shareToken, data)
      setSession(data)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail || 'Не удалось войти на урок.')
    } finally {
      setJoining(false)
    }
  }

  const handleLeave = () => {
    if (shareToken) clearGuestSession(shareToken)
    setSession(null)
    setName('')
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

  // Гость представился — показываем доску.
  // Данные урока берём из свежего lesson, а не из session: сессия могла быть
  // сохранена час назад, за это время урок мог и завершиться.
  if (session) {
    const conferenceUrl = lesson.comment.match(/https?:\/\/\S+/)?.[0] ?? null

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
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>{lessonTitle(lesson)}</h2>
            <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {lesson.teacherName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {conferenceUrl && (
              <a href={conferenceUrl} target="_blank" rel="noreferrer">
                <button className="btn-secondary">Конференция</button>
              </a>
            )}
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Вы вошли как {session.name}</span>
            {/* Раньше сменить имя можно было перезагрузкой страницы — теперь она
                сессию сохраняет, поэтому нужен явный выход */}
            <button className="btn-secondary" onClick={handleLeave}>Выйти</button>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <WhiteboardRoom
            roomId={session.roomId}
            accessToken={session.access}
            username={session.name}
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
