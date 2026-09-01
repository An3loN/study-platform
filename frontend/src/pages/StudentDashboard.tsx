import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { lessonsApi, homeworkApi } from '@/services/api'
import type { Homework, Lesson } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDuration, lessonTitle } from '@/utils/format'

export function StudentDashboard() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([lessonsApi.list({ upcoming: true }), homeworkApi.my()])
      .then(([lessonsRes, homeworkRes]) => {
        setLessons(lessonsRes.data.results)
        setHomework(homeworkRes.data.results)
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleDone = async (item: Homework) => {
    const { data } = await homeworkApi.setDone(item.id, !item.isDone)
    setHomework((prev) => prev.map((h) => (h.id === data.id ? data : h)))
  }

  return (
    <Layout>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Ближайшие уроки</h2>

          {loading && <p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lessons.map((lesson) => (
              <div key={lesson.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 600 }}>{lessonTitle(lesson)}</h4>
                    <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
                  </p>
                  {lesson.comment && (
                    <p style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{lesson.comment}</p>
                  )}
                </div>
                <Link to={`/lessons/${lesson.id}`}>
                  <button className={lesson.status === 'active' ? 'btn-primary' : 'btn-secondary'}>
                    {lesson.status === 'active' ? 'Войти' : 'Открыть'}
                  </button>
                </Link>
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
                  checked={item.isDone}
                  onChange={() => toggleDone(item)}
                  style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{
                    whiteSpace: 'pre-wrap',
                    textDecoration: item.isDone ? 'line-through' : 'none',
                    color: item.isDone ? 'var(--color-text-secondary)' : 'var(--color-text)',
                  }}>
                    {item.text || 'Без описания'}
                  </p>
                  {item.attachment && (
                    <a href={item.attachment} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      Файл к заданию
                    </a>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                    Задано на уроке {formatDateTime(item.lessonScheduledAt)}
                    {item.dueAt && ` · сдать к ${formatDateTime(item.dueAt)}`}
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
    </Layout>
  )
}
