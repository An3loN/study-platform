import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { CancelLessonModal } from '@/components/Lesson/CancelLessonModal'
import { HomeworkModal } from '@/components/Lesson/HomeworkModal'
import { StatusPill, aggregate } from '@/components/Lesson/homeworkParts'
import { Menu } from '@/components/UI/Menu'
import { lessonsApi, homeworkApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { Homework, Lesson } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDay, formatDuration, lessonTitle } from '@/utils/format'

export function StudentDashboard() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  const [loading, setLoading] = useState(true)
  // Урок, для которого открыта отмена
  const [cancelling, setCancelling] = useState<Lesson | null>(null)
  // Задание, открытое окном: работа, файлы и переписка с преподавателем
  const [openHomework, setOpenHomework] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)

  const load = useCallback(async () => {
    const [lessonsRes, homeworkRes] = await Promise.all([
      lessonsApi.list({ upcoming: true }),
      homeworkApi.my(),
    ])
    setLessons(lessonsRes.data.results)
    setHomework(homeworkRes.data.results)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const replace = (updated: Homework) => {
    setHomework((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const toggleDone = async (item: Homework) => {
    const { data } = await homeworkApi.setDone(item.id, !item.mySubmission?.isDone)
    replace(data)
  }

  return (
    <Layout>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Ближайшие уроки</h2>

          {loading && <p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className={`card${lesson.status === 'cancelled' ? ' lesson-row--cancelled' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 16 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 600 }}>{lessonTitle(lesson)}</h4>
                    <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
                    {!lesson.hasWhiteboard && ' · очный'}
                  </p>
                  {lesson.comment && (
                    <p style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{lesson.comment}</p>
                  )}
                  {lesson.cancelReason && (
                    <p className="lesson-row__reason">
                      Отменил {lesson.cancelledByName}: {lesson.cancelReason}
                    </p>
                  )}
                </div>

                <Link to={`/lessons/${lesson.id}`}>
                  <button className={lesson.status === 'active' ? 'btn-primary' : 'btn-secondary'}>
                    {lesson.status === 'active' ? 'Войти' : 'Открыть'}
                  </button>
                </Link>

                {/* Удалять урок ученик не может — только сообщить, что не придёт */}
                {lesson.status !== 'cancelled' && (
                  <Menu
                    items={[{
                      key: 'cancel',
                      label: 'Отменить урок',
                      danger: true,
                      onSelect: () => setCancelling(lesson),
                    }]}
                  />
                )}
              </div>
            ))}
            {!loading && lessons.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 32 }}>
                Уроков пока не назначено.
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Домашние задания</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {homework.map((item) => (
              <div key={item.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={Boolean(item.mySubmission?.isDone)}
                  onChange={() => toggleDone(item)}
                  style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{
                    whiteSpace: 'pre-wrap',
                    textDecoration: item.mySubmission?.status === 'accepted' ? 'line-through' : 'none',
                    color: item.mySubmission?.isDone ? 'var(--color-text-secondary)' : 'var(--color-text)',
                  }}>
                    {item.text || 'Без описания'}
                  </p>
                  {item.attachment && (
                    <a href={item.attachment} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      Файл к заданию
                    </a>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                    {/* Урока у задания может и не быть — тогда отсчёт от выдачи */}
                    {item.lesson
                      ? `Задано на уроке ${formatDateTime(item.lessonScheduledAt)}`
                      : `Задано ${formatDay(item.createdAt)}`}
                    {item.effectiveDueAt && ` · сдать к ${formatDateTime(item.effectiveDueAt)}`}
                  </p>
                  <p style={{ fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusPill {...aggregate(item, false)} />
                    {item.mySubmission?.grade && <span>Оценка {item.mySubmission.grade}</span>}
                    {/* Разбор задания — там же, где и на уроке: файлы и переписка */}
                    <button
                      className="hw-btn-quiet"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setOpenHomework(item.id)}
                    >
                      Открыть{item.messagesCount > 0 && ` · ${item.messagesCount}`}
                    </button>
                  </p>
                </div>
              </div>
            ))}
            {!loading && homework.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 32 }}>
                Домашних заданий нет.
              </div>
            )}
          </div>
        </section>
      </div>

      {cancelling && (
        <CancelLessonModal
          lesson={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={load}
        />
      )}

      {openHomework && (() => {
        const item = homework.find((h) => h.id === openHomework)
        return item ? (
          <HomeworkModal
            homework={item}
            isTeacher={false}
            selfId={user?.id}
            teacherId={item.teacher.id}
            teacherName={item.teacher.displayName}
            onClose={() => setOpenHomework(null)}
            onChanged={replace}
          />
        ) : null
      })()}
    </Layout>
  )
}
