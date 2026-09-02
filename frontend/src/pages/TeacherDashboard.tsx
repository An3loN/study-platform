import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { Modal } from '@/components/UI/Modal'
import { ShareBlock } from '@/components/UI/ShareBlock'
import { StudentForm } from '@/components/Students/StudentForm'
import { LessonForm } from '@/components/Lesson/LessonForm'
import { CancelLessonModal } from '@/components/Lesson/CancelLessonModal'
import { Menu, type MenuItem } from '@/components/UI/Menu'
import { studentsApi, lessonsApi } from '@/services/api'
import type { Lesson, Student } from '@/types'
import { STATUS_LABEL, formatDateTime, formatDuration, lessonTitle } from '@/utils/format'

export function TeacherDashboard() {
  const [students, setStudents] = useState<Student[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)

  const [studentModal, setStudentModal] = useState(false)
  const [lessonModal, setLessonModal] = useState(false)
  // Свежесозданный ученик — показываем ссылку и QR сразу после создания
  const [invited, setInvited] = useState<Student | null>(null)
  // Урок, для которого открыта отмена или подтверждение удаления
  const [cancelling, setCancelling] = useState<Lesson | null>(null)
  const [deleting, setDeleting] = useState<Lesson | null>(null)

  const load = useCallback(async () => {
    const [studentsRes, lessonsRes] = await Promise.all([
      studentsApi.list(),
      lessonsApi.list({ upcoming: true }),
    ])
    setStudents(studentsRes.data.results)
    setLessons(lessonsRes.data.results)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /**
   * Действия над уроком: отмена — с причиной, удаление — насовсем.
   * Удалять может только преподаватель, поэтому пункт есть лишь здесь.
   */
  const lessonMenu = (lesson: Lesson): MenuItem[] => [
    ...(lesson.status === 'cancelled' ? [] : [{
      key: 'cancel',
      label: 'Отменить урок',
      danger: true,
      onSelect: () => setCancelling(lesson),
    }]),
    {
      key: 'delete',
      label: 'Удалить урок',
      danger: true,
      onSelect: () => setDeleting(lesson),
    },
  ]

  const handleDelete = async () => {
    if (!deleting) return
    await lessonsApi.remove(deleting.id)
    setDeleting(null)
    await load()
  }

  const handleCreateStudent = async (data: Parameters<typeof studentsApi.create>[0]) => {
    const { data: student } = await studentsApi.create(data)
    setStudentModal(false)
    setInvited(student)
    await load()
  }

  const handleCreateLesson = async (data: Parameters<typeof lessonsApi.create>[0]) => {
    await lessonsApi.create(data)
    setLessonModal(false)
    await load()
  }

  return (
    <Layout>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* ── Ученики ──────────────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Ученики</h2>
            <button className="btn-primary" onClick={() => setStudentModal(true)}>+ Добавить ученика</button>
          </div>

          {loading && <p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {students.map((student) => (
              <Link key={student.id} to={`/students/${student.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{student.displayName}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {student.phone || 'телефон не указан'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Занятий: {student.lessonsCount}
                  </span>
                  {!student.isRegistered && (
                    <span className="badge badge-scheduled" style={{ alignSelf: 'flex-start' }}>
                      Ждёт регистрации
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {!loading && students.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 32 }}>
              Пока никого. Добавьте первого ученика — ссылку на регистрацию можно отправить сразу.
            </div>
          )}
        </section>

        {/* ── Ближайшие уроки ──────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Ближайшие уроки</h2>
            <button className="btn-primary" onClick={() => setLessonModal(true)}>+ Создать урок</button>
          </div>

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
                    {lesson.students.length > 0 && ' · '}
                    {lesson.students.map((s) => s.displayName).join(', ')}
                  </p>
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

                <Menu items={lessonMenu(lesson)} />
              </div>
            ))}
            {!loading && lessons.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 32 }}>
                Ближайших уроков нет.
              </div>
            )}
          </div>
        </section>
      </div>

      {studentModal && (
        <Modal title="Новый ученик" onClose={() => setStudentModal(false)}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            Поля можно оставить пустыми — ученик заполнит их сам по ссылке.
          </p>
          <StudentForm onSubmit={handleCreateStudent} onCancel={() => setStudentModal(false)} />
        </Modal>
      )}

      {invited && (
        <Modal title="Ссылка для ученика" onClose={() => setInvited(null)}>
          {invited.inviteUrl && invited.inviteToken ? (
            <ShareBlock
              url={invited.inviteUrl}
              qrUrl={studentsApi.qrUrl(invited.inviteToken)}
              hint={`Отправьте ссылку или покажите QR — ${invited.displayName} заполнит свои данные и задаст пароль.`}
            />
          ) : (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Ученик уже может входить: телефон и пароль заданы.
            </p>
          )}
        </Modal>
      )}

      {lessonModal && (
        <Modal title="Новый урок" onClose={() => setLessonModal(false)} width={480}>
          <LessonForm
            students={students}
            onSubmit={handleCreateLesson}
            onCancel={() => setLessonModal(false)}
          />
        </Modal>
      )}

      {cancelling && (
        <CancelLessonModal
          lesson={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={load}
        />
      )}

      {deleting && (
        <Modal title="Удалить урок" onClose={() => setDeleting(null)}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            {lessonTitle(deleting)} · {formatDateTime(deleting.scheduledAt)}
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
            Урок исчезнет вместе с доской, заметками и домашними заданиями. Если нужно просто
            сообщить об отмене — отмените урок с причиной, он останется в списке.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="header-button" onClick={() => setDeleting(null)}>Не удалять</button>
            <button className="btn-danger" onClick={handleDelete}>Удалить насовсем</button>
          </div>
        </Modal>
      )}
    </Layout>
  )
}
