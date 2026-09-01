import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { Modal } from '@/components/UI/Modal'
import { ShareBlock } from '@/components/UI/ShareBlock'
import { StudentForm } from '@/components/Students/StudentForm'
import { LessonForm } from '@/components/Lesson/LessonForm'
import { studentsApi, lessonsApi } from '@/services/api'
import type { Lesson, LessonDetail, Student } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDuration, lessonTitle } from '@/utils/format'

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const [student, setStudent] = useState<Student | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  // Заметки лежат в детальном ответе урока, поэтому подгружаем их отдельно
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [lessonModal, setLessonModal] = useState(false)
  const [editModal, setEditModal] = useState(false)

  const load = useCallback(async () => {
    if (!studentId) return
    const [studentRes, lessonsRes] = await Promise.all([
      studentsApi.get(studentId),
      lessonsApi.list({ student: studentId }),
    ])
    setStudent(studentRes.data)
    setLessons(lessonsRes.data.results)
    setLoading(false)

    const details = await Promise.all(
      lessonsRes.data.results.map((lesson) => lessonsApi.get(lesson.id)),
    )
    setNotes(Object.fromEntries(
      details
        .map(({ data }: { data: LessonDetail }) => [data.id, data.notes ?? ''])
        .filter(([, value]) => value),
    ))
  }, [studentId])

  useEffect(() => { load() }, [load])

  const handleCreateLesson = async (data: Parameters<typeof lessonsApi.create>[0]) => {
    await lessonsApi.create(data)
    setLessonModal(false)
    await load()
  }

  const handleUpdateStudent = async (data: Parameters<typeof studentsApi.create>[0]) => {
    if (!studentId) return
    await studentsApi.update(studentId, data)
    setEditModal(false)
    await load()
  }

  if (loading) return <Layout><p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p></Layout>
  if (!student) return <Layout><p>Ученик не найден. <Link to="/">На главную</Link></p></Layout>

  const upcoming = lessons.filter((l) => l.status !== 'finished')
  const history = lessons.filter((l) => l.status === 'finished')

  return (
    <Layout>
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Link to="/" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>← Все ученики</Link>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{student.displayName}</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                {[student.firstName, student.lastName].filter(Boolean).join(' ') || 'Имя не указано'}
                {' · '}
                {student.phone || 'телефон не указан'}
                {' · '}
                занятий: {student.lessonsCount}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn-secondary" onClick={() => setEditModal(true)}>Изменить</button>
              <button className="btn-primary" onClick={() => setLessonModal(true)}>+ Урок</button>
            </div>
          </div>

          {!student.isRegistered && student.inviteUrl && student.inviteToken && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--color-border)' }}>
              <ShareBlock
                url={student.inviteUrl}
                qrUrl={studentsApi.qrUrl(student.inviteToken)}
                hint="Ученик ещё не зарегистрировался. Ссылка или QR — на выбор."
              />
            </div>
          )}
        </div>

        {upcoming.length > 0 && (
          <section>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Предстоящие</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map((lesson) => (
                <LessonRow key={lesson.id} lesson={lesson} note={notes[lesson.id]} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>История занятий</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} note={notes[lesson.id]} />
            ))}
            {history.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 28 }}>
                Проведённых занятий пока нет.
              </div>
            )}
          </div>
        </section>
      </div>

      {lessonModal && (
        <Modal title={`Урок для ${student.displayName}`} onClose={() => setLessonModal(false)} width={480}>
          <LessonForm
            students={[student]}
            presetStudentId={student.id}
            onSubmit={handleCreateLesson}
            onCancel={() => setLessonModal(false)}
          />
        </Modal>
      )}

      {editModal && (
        <Modal title="Данные ученика" onClose={() => setEditModal(false)}>
          <StudentForm
            initial={student}
            submitLabel="Сохранить"
            onSubmit={handleUpdateStudent}
            onCancel={() => setEditModal(false)}
          />
        </Modal>
      )}
    </Layout>
  )
}

function LessonRow({ lesson, note }: { lesson: Lesson; note?: string }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h4 style={{ fontSize: 15, fontWeight: 600 }}>{lessonTitle(lesson)}</h4>
          <span className={`badge badge-${lesson.status}`}>{STATUS_LABEL[lesson.status]}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {formatDateTime(lesson.scheduledAt)} · {formatDuration(lesson.duration)}
          {lesson.homeworkCount > 0 && ` · ДЗ: ${lesson.homeworkCount}`}
        </p>
        {note && (
          <p style={{
            fontSize: 13,
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--color-bg)',
            borderRadius: 'var(--radius)',
            whiteSpace: 'pre-wrap',
          }}>
            {note}
          </p>
        )}
      </div>
      <Link to={`/lessons/${lesson.id}`}>
        <button className="btn-secondary">Открыть</button>
      </Link>
    </div>
  )
}
