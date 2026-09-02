import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { WhiteboardRoom } from '@/components/Whiteboard/WhiteboardRoom'
import { Chat } from '@/components/Lesson/Chat'
import { LessonForm } from '@/components/Lesson/LessonForm'
import { LessonNotes } from '@/components/Lesson/LessonNotes'
import { HomeworkPanel } from '@/components/Lesson/HomeworkPanel'
import { LessonSidebar, type SidebarTab } from '@/components/Lesson/LessonSidebar'
import { Modal } from '@/components/UI/Modal'
import { ShareBlock } from '@/components/UI/ShareBlock'
import { useLessonRoom } from '@/hooks/useLessonRoom'
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

  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const isTeacher = user?.role === 'teacher'

  // Соединение с комнатой держит страница: свернули панель или ушли на другую
  // вкладку — человек остаётся в комнате, а история сообщений никуда не девается
  const room = useLessonRoom(lesson?.roomId, accessToken ?? undefined)

  // Непрочитанные считаем, пока чат не на виду
  const [seenCount, setSeenCount] = useState(0)
  const [visibleTab, setVisibleTab] = useState<string | null>(null)
  useEffect(() => {
    if (visibleTab === 'chat') setSeenCount(room.messages.length)
  }, [visibleTab, room.messages.length])
  const unread = Math.max(0, room.messages.length - seenCount)

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

  const setStatus = async (action: 'start' | 'finish') => {
    if (!lessonId) return
    await lessonsApi[action](lessonId)
    await load()
  }

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
    { key: 'chat', label: 'Чат', badge: unread, render: () => <Chat room={room} /> },
    ...(isTeacher
      ? [{
          key: 'notes',
          label: 'Заметки',
          render: () => <LessonNotes lessonId={lesson.id} value={lesson.notes ?? ''} onSaved={load} />,
        }]
      : []),
    {
      key: 'homework',
      label: `ДЗ${lesson.homework.length ? ` · ${lesson.homework.length}` : ''}`,
      render: () => <HomeworkPanel lesson={lesson} isTeacher={isTeacher} onChanged={load} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Шапка урока */}
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
          <Link to="/" style={{ color: 'var(--color-text-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
            ← Назад
          </Link>
          <h2 style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lessonTitle(lesson)}
          </h2>
          <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
            {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {conferenceUrl && (
            <a href={conferenceUrl} target="_blank" rel="noreferrer">
              <button className="btn-secondary">Конференция</button>
            </a>
          )}
          {hasComment && (
            <button className="btn-secondary" onClick={() => setCommentModal(true)}>Комментарий</button>
          )}
          {isTeacher && (
            <>
              <button className="btn-secondary" onClick={() => setShareModal(true)}>Ссылка на вход</button>
              <button className="btn-secondary" onClick={() => setEditModal(true)}>Изменить</button>
              {lesson.status === 'scheduled' && (
                <button className="btn-primary" onClick={() => setStatus('start')}>▶ Начать</button>
              )}
              {lesson.status === 'active' && (
                <button className="btn-danger" onClick={() => setStatus('finish')}>■ Завершить</button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Доска + боковая панель */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <WhiteboardRoom
            roomId={lesson.roomId}
            accessToken={accessToken}
            username={user?.displayName}
            readonly={lesson.status === 'finished'}
          />
        </div>

        <LessonSidebar tabs={tabs} onVisibleTabChange={setVisibleTab} />
      </div>

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
