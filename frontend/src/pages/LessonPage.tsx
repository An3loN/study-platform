import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { WhiteboardRoom } from '@/components/Whiteboard/WhiteboardRoom'
import { LessonForm } from '@/components/Lesson/LessonForm'
import { LessonNotes } from '@/components/Lesson/LessonNotes'
import { HomeworkPanel } from '@/components/Lesson/HomeworkPanel'
import { LessonSidebar, type SidebarTab } from '@/components/Lesson/LessonSidebar'
import { Modal } from '@/components/UI/Modal'
import { ShareBlock } from '@/components/UI/ShareBlock'
import { Avatars } from '@/components/UI/Avatars'
import { lessonsApi, studentsApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { LessonDetail, Student } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDuration, lessonTitle } from '@/utils/format'

/** Первая ссылка из комментария — её выносим в шапку кнопкой «Конференция». */
function firstUrl(text: string): string | null {
  return text.match(/https?:\/\/\S+/)?.[0] ?? null
}

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [shareModal, setShareModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [commentModal, setCommentModal] = useState(false)
  // Состав комнаты приходит из доски: он же рисует там курсоры
  const [participants, setParticipants] = useState<string[]>([])

  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const isTeacher = user?.role === 'teacher'

  const load = useCallback(async () => {
    if (!lessonId) return
    const { data } = await lessonsApi.get(lessonId)
    setLesson(data)
    setLoading(false)
  }, [lessonId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isTeacher) studentsApi.list().then(({ data }) => setStudents(data.results))
  }, [isTeacher])

  const handleEdit = async (data: Parameters<typeof lessonsApi.create>[0]) => {
    if (!lessonId) return
    await lessonsApi.update(lessonId, data)
    setEditModal(false)
    await load()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p>
      </div>
    )
  }

  if (!lesson || !accessToken) {
    return (
      <div style={{ padding: 24 }}>
        <p>Урок не найден. <Link to="/">На главную</Link></p>
      </div>
    )
  }

  const conferenceUrl = firstUrl(lesson.comment)
  const hasComment = Boolean(lesson.comment.trim())

  const tabs: SidebarTab[] = [
    ...(isTeacher
      ? [{
          key: 'notes',
          label: 'Заметки',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
              <path d="M15 3v6h6" />
            </svg>
          ),
          render: () => <LessonNotes lessonId={lesson.id} value={lesson.notes ?? ''} onSaved={load} />,
        }]
      : []),
    {
      key: 'homework',
      label: 'Домашнее задание',
      badge: lesson.homework.length,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 7v14" />
          <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
        </svg>
      ),
      render: () => <HomeworkPanel lesson={lesson} isTeacher={isTeacher} onChanged={load} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Шапка урока */}
      <header className="lesson-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Link to="/" className="icon-button" title="На главную">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <div className="lesson-header__divider" />
          <h1 className="lesson-header__title">{lessonTitle(lesson)}</h1>
          <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
          <span className="lesson-header__meta">
            {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          {!lesson.hasWhiteboard && (
            <span className="lesson-header__teacher">Очный урок</span>
          )}
          <Avatars names={participants} self={user?.displayName} teacher={lesson.teacher.displayName} />
          {participants.length > 0 && <div className="lesson-header__divider" />}

          {conferenceUrl && (
            <a href={conferenceUrl} target="_blank" rel="noreferrer" className="header-button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
              Конференция
            </a>
          )}
          {hasComment && (
            <button className="header-button" onClick={() => setCommentModal(true)}>Комментарий</button>
          )}
          {isTeacher && (
            <>
              <button className="header-button" onClick={() => setEditModal(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                </svg>
                Изменить урок
              </button>
              {lesson.hasWhiteboard && (
              <button className="header-button header-button--accent" onClick={() => setShareModal(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Гостевая ссылка
              </button>
              )}
            </>
          )}
        </div>
      </header>

      {lesson.hasWhiteboard ? (
        /* Доска на всю площадь, панель — поверх неё */
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <WhiteboardRoom
            roomId={lesson.roomId}
            accessToken={accessToken}
            username={user?.displayName}
            onParticipantsChange={setParticipants}
          />
          <LessonSidebar tabs={tabs} />
        </div>
      ) : (
        /**
         * Очный урок: доски нет, и прятать панели за корешками незачем —
         * кроме них на странице ничего и нет. Показываем их сразу, колонкой.
         */
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-alt)' }}>
          <div style={{
            maxWidth: 960,
            margin: '0 auto',
            padding: 24,
            display: 'grid',
            gridTemplateColumns: tabs.length > 1 ? '1fr 1fr' : '1fr',
            gap: 16,
            alignItems: 'start',
          }}>
            {tabs.map((tab) => (
              <section key={tab.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="side-panel__head" style={{ borderRadius: 0 }}>
                  {tab.icon}
                  <span>{tab.label}</span>
                  {!!tab.badge && <span className="side-panel__count">{tab.badge}</span>}
                </div>
                <div style={{ height: 420 }}>{tab.render()}</div>
              </section>
            ))}
          </div>
        </div>
      )}

      {commentModal && (
        <Modal title="Комментарий к уроку" onClose={() => setCommentModal(false)}>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{lesson.comment}</p>
          {conferenceUrl && (
            <a href={conferenceUrl} target="_blank" rel="noreferrer">
              <button className="btn-primary" style={{ width: '100%', marginTop: 16 }}>
                Открыть конференцию
              </button>
            </a>
          )}
        </Modal>
      )}

      {shareModal && lesson.shareUrl && lesson.shareToken && (
        <Modal title="Вход по ссылке" onClose={() => setShareModal(false)}>
          <ShareBlock
            url={lesson.shareUrl}
            qrUrl={lessonsApi.shareQrUrl(lesson.shareToken)}
            hint="По этой ссылке можно войти на урок без аккаунта — достаточно назвать имя."
          />
        </Modal>
      )}

      {editModal && (
        <Modal title="Изменить урок" onClose={() => setEditModal(false)} width={480}>
          <LessonForm
            students={students}
            initial={lesson}
            submitLabel="Сохранить"
            onSubmit={handleEdit}
            onCancel={() => setEditModal(false)}
          />
        </Modal>
      )}
    </div>
  )
}
