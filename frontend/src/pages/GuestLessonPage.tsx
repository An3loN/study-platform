import { useEffect, useState, FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { WhiteboardRoom } from '@/components/Whiteboard/WhiteboardRoom'
import { Avatars } from '@/components/UI/Avatars'
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
  const [loadError, setLoadError] = useState('')
  const [joining, setJoining] = useState(false)
  // Состав комнаты приходит из доски: он же рисует там курсоры
  const [participants, setParticipants] = useState<string[]>([])

  useEffect(() => {
    if (!shareToken) return
    lessonsApi.shareInfo(shareToken)
      .then(({ data }) => setLesson(data))
      .catch((err) => {
        // Истёкшая ссылка отвечает 410 с пояснением — показываем именно его,
        // иначе человек решит, что ошибся адресом
        setLoadError((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '')
        setLesson(null)
      })
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
        <p style={{ marginBottom: 12 }}>{loadError || 'Ссылка недействительна или урок удалён.'}</p>
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
        <header className="lesson-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {/* Раньше сменить имя можно было перезагрузкой страницы — теперь она
                сессию сохраняет, поэтому нужен явный выход */}
            <button className="icon-button" title="Выйти с урока" onClick={handleLeave}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="lesson-header__divider" />
            <h1 className="lesson-header__title">{lessonTitle(lesson)}</h1>
            <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
            <span className="lesson-header__meta">
              {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
            </span>
            <span className="lesson-header__teacher">{lesson.teacherName}</span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
            <Avatars names={participants} self={session.name} teacher={lesson.teacherName} />
            {conferenceUrl && (
              <a href={conferenceUrl} target="_blank" rel="noreferrer" className="header-button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                  <rect x="2" y="6" width="14" height="12" rx="2" />
                </svg>
                Конференция
              </a>
            )}
          </div>
        </header>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <WhiteboardRoom
            roomId={session.roomId}
            accessToken={session.access}
            username={session.name}
            onParticipantsChange={setParticipants}
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
          {/* Метку связываем с полем явно: гостевая страница — единственное
              место, куда попадают люди со стороны, и поле без подписи там
              экранный диктор не объявит */}
          <label htmlFor="guest-name">Как вас зовут?</label>
          <input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
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
