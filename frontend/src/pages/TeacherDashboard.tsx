import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { Modal } from '@/components/UI/Modal'
import { ShareBlock } from '@/components/UI/ShareBlock'
import { Icon, initials } from '@/components/UI/icons'
import { Menu, type MenuItem } from '@/components/UI/Menu'
import { StudentForm } from '@/components/Students/StudentForm'
import { LessonForm } from '@/components/Lesson/LessonForm'
import { HomeworkForm } from '@/components/Lesson/HomeworkForm'
import { HomeworkModal } from '@/components/Lesson/HomeworkModal'
import { CancelLessonModal } from '@/components/Lesson/CancelLessonModal'
import { WeekCalendar } from '@/components/Lesson/WeekCalendar'
import { LessonCard } from '@/components/Lesson/LessonCard'
import { studentsApi, lessonsApi, homeworkApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { attentionOf, type Attention } from './attention'
import type { Homework, Lesson, Student } from '@/types'
import {
  addDays,
  formatDateTime,
  formatDayLong,
  formatTime,
  lessonTitle,
  plural,
  startOfDay,
} from '@/utils/format'

export function TeacherDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [students, setStudents] = useState<Student[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  const [todayLessons, setTodayLessons] = useState<Lesson[]>([])
  const [query, setQuery] = useState('')
  // Календарь грузит уроки сам — счётчик двигаем, когда состав уроков поменялся
  const [reloadKey, setReloadKey] = useState(0)

  const [studentModal, setStudentModal] = useState(false)
  const [lessonModal, setLessonModal] = useState(false)
  const [homeworkModal, setHomeworkModal] = useState(false)
  // Разбор задания открывается окном прямо с главной: за ним идут сюда, а не
  // на урок — тем более что задание может быть и не привязано к уроку
  const [openHomework, setOpenHomework] = useState<string | null>(null)
  // Свежесозданный ученик — показываем ссылку и QR сразу после создания
  const [invited, setInvited] = useState<Student | null>(null)
  const [cancelling, setCancelling] = useState<Lesson | null>(null)
  const [deleting, setDeleting] = useState<Lesson | null>(null)

  const today = useMemo(() => startOfDay(new Date()), [])

  const load = useCallback(async () => {
    const [studentsRes, homeworkRes, todayRes] = await Promise.all([
      studentsApi.list(),
      homeworkApi.my(),
      lessonsApi.list({ from: today.toISOString(), to: addDays(today, 1).toISOString() }),
    ])
    setStudents(studentsRes.data.results)
    setHomework(homeworkRes.data.results)
    setTodayLessons(todayRes.data.results)
  }, [today])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setReloadKey((key) => key + 1)
    await load()
  }

  const now = new Date()
  const attention = homework
    .map((item) => attentionOf(item, now))
    .filter((item): item is Attention => item !== null)
    .sort((a, b) => a.order - b.order)

  const activeToday = todayLessons.filter((lesson) => lesson.status !== 'cancelled')
  const nextLesson = activeToday.find((lesson) => lesson.scheduledAt && new Date(lesson.scheduledAt) >= now)
  const toReview = attention.filter((item) => item.order === 0).length
  const expiring = attention.filter((item) => item.expiring).length

  const opened = homework.find((item) => item.id === openHomework)

  const replaceHomework = (updated: Homework) => {
    setHomework((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const found = students.filter((student) => (
    student.displayName.toLowerCase().includes(query.trim().toLowerCase())
  ))

  const lessonMenu = (lesson: Lesson): MenuItem[] => [
    ...(lesson.status === 'cancelled' ? [] : [{
      key: 'cancel',
      label: 'Отменить урок',
      danger: true,
      onSelect: () => setCancelling(lesson),
    }]),
    { key: 'delete', label: 'Удалить урок', danger: true, onSelect: () => setDeleting(lesson) },
  ]

  const handleDelete = async () => {
    if (!deleting) return
    await lessonsApi.remove(deleting.id)
    setDeleting(null)
    await refresh()
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
    await refresh()
  }

  return (
    <Layout>
      <div className="page">
        <div className="page-head">
          <h1 className="page-head__title">{formatDayLong(today)}</h1>
          <p className="page-head__sub">
            {activeToday.length > 0
              ? `Сегодня ${activeToday.length} ${plural(activeToday.length, 'урок', 'урока', 'уроков')}`
                + (nextLesson ? `, ближайший в ${formatTime(nextLesson.scheduledAt)}.` : ', все уже прошли.')
              : 'Сегодня уроков нет.'}
          </p>
        </div>

        <div className="stat-grid">
          <StatTile icon="calendar" value={activeToday.length} label="Уроков сегодня" brand />
          <StatTile icon="homework" value={toReview} label="Дз на проверку" />
          <StatTile icon="clock" value={expiring} label="Срок истекает" />
          <StatTile icon="users" value={students.length} label="Учеников" />
        </div>

        <WeekCalendar
          reloadKey={reloadKey}
          tools={(
            <button className="btn-primary btn-sm btn-row" onClick={() => setLessonModal(true)}>
              <Icon name="plus" size={16} />
              Добавить урок
            </button>
          )}
          emptyAction={(
            <button className="btn-outline btn-sm btn-row" onClick={() => setLessonModal(true)}>
              <Icon name="plus" size={16} />
              Добавить урок
            </button>
          )}
          renderLesson={(lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onOpen={() => navigate(`/lessons/${lesson.id}`)}
              menu={<Menu items={lessonMenu(lesson)} />}
            />
          )}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-9)', alignItems: 'start' }}>

          {/* ── Домашние задания ────────────────────────────────────────── */}
          <section className="section">
            <div className="section__head">
              <h3 className="section__title">Домашние задания</h3>
              <button className="btn-primary btn-sm btn-row" onClick={() => setHomeworkModal(true)}>
                <Icon name="plus" size={16} />
                Создать дз
              </button>
            </div>

            <div className="panel">
              <div className="panel__head">
                <span>Требуют внимания</span>
                <span>{attention.length}</span>
              </div>
              <div className="panel__body panel__scroll" style={{ maxHeight: 604 }}>
                {attention.map(({ homework: item, tone, status, meta, urgent }) => (
                  <button
                    key={item.id}
                    className={`attention${urgent ? ' attention--urgent' : ''}`}
                    onClick={() => setOpenHomework(item.id)}
                  >
                    <span className="attention__main">
                      <span className="attention__row">
                        <span className="attention__title">
                          {item.lessonTitle || 'Задание без урока'}
                        </span>
                        <span className={`badge badge-${tone}`}>{status}</span>
                      </span>
                      <span className="attention__text">{item.text || 'Без описания'}</span>
                      <span className={`attention__meta${urgent ? ' attention__meta--late' : ''}`}>{meta}</span>
                    </span>
                    <Icon name="chevron" size={20} />
                  </button>
                ))}

                {attention.length === 0 && (
                  <div className="empty-block">Ничего не ждёт проверки.</div>
                )}
              </div>
            </div>
          </section>

          {/* ── Ученики ─────────────────────────────────────────────────── */}
          <section className="section">
            <div className="section__head">
              <h3 className="section__title">Ученики</h3>
              <button className="btn-primary btn-sm btn-row" onClick={() => setStudentModal(true)}>
                <Icon name="plus" size={16} />
                Добавить ученика
              </button>
            </div>

            <div className="panel">
              <label className="student-search">
                <Icon name="search" size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по имени"
                />
                <span className="section__count">{found.length}</span>
              </label>

              <div className="panel__scroll" style={{ maxHeight: 528 }}>
                {found.map((student) => (
                  <button
                    key={student.id}
                    className="student-row"
                    onClick={() => navigate(`/students/${student.id}`)}
                  >
                    <span className={`avatar${student.isRegistered ? '' : ' avatar--muted'}`}>
                      {initials(student.displayName)}
                    </span>
                    <span className="student-row__text">
                      <span className="student-row__name">{student.displayName}</span>
                      <span className="student-row__meta">
                        {student.isRegistered
                          ? `${student.phone} · занятий: ${student.lessonsCount}`
                          : 'Ждёт регистрации'}
                      </span>
                    </span>
                    <Icon name="chevron" size={18} />
                  </button>
                ))}

                {found.length === 0 && (
                  <div className="empty-block">
                    {students.length === 0
                      ? 'Пока никого. Добавьте первого ученика — ссылку на регистрацию можно отправить сразу.'
                      : 'Никого не нашлось.'}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {studentModal && (
        <Modal
          title="Новый ученик"
          description="Поля можно оставить пустыми — ученик заполнит их сам по ссылке."
          onClose={() => setStudentModal(false)}
        >
          <StudentForm onSubmit={handleCreateStudent} onCancel={() => setStudentModal(false)} />
        </Modal>
      )}

      {invited && (
        <Modal
          title="Ссылка для ученика"
          description={`Отправьте ссылку или покажите QR — ${invited.displayName} заполнит данные и задаст пароль.`}
          onClose={() => setInvited(null)}
        >
          {invited.inviteUrl && invited.inviteToken ? (
            <ShareBlock url={invited.inviteUrl} qrUrl={studentsApi.qrUrl(invited.inviteToken)} />
          ) : (
            <p className="field__hint">Ученик уже может входить: телефон и пароль заданы.</p>
          )}
        </Modal>
      )}

      {lessonModal && (
        <Modal
          title="Новый урок"
          description="Время и учеников можно не заполнять — урок создастся и так."
          onClose={() => setLessonModal(false)}
          width={520}
        >
          <LessonForm
            students={students}
            onSubmit={handleCreateLesson}
            onCancel={() => setLessonModal(false)}
          />
        </Modal>
      )}

      {homeworkModal && (
        <Modal
          title="Новое задание"
          description="Отметьте учеников — задание получат только они."
          onClose={() => setHomeworkModal(false)}
          width={520}
        >
          <HomeworkForm
            students={students}
            onCancel={() => setHomeworkModal(false)}
            onDone={async () => { setHomeworkModal(false); await load() }}
          />
        </Modal>
      )}

      {opened && (
        <HomeworkModal
          homework={opened}
          isTeacher
          selfId={user?.id}
          teacherId={opened.teacher.id}
          teacherName={opened.teacher.displayName}
          onClose={() => setOpenHomework(null)}
          onChanged={replaceHomework}
        />
      )}

      {cancelling && (
        <CancelLessonModal
          lesson={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={refresh}
        />
      )}

      {deleting && (
        <Modal
          title="Удалить урок"
          description="Урок исчезнет вместе с доской, заметками и домашними заданиями. Если нужно просто сообщить об отмене — отмените урок с причиной, он останется в списке."
          onClose={() => setDeleting(null)}
        >
          <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
            {lessonTitle(deleting)} · {formatDateTime(deleting.scheduledAt)}
          </p>
          <div className="dialog__actions">
            <button className="btn-ghost btn-md" onClick={() => setDeleting(null)}>Не удалять</button>
            <button className="btn-danger btn-md" onClick={handleDelete}>Удалить насовсем</button>
          </div>
        </Modal>
      )}
    </Layout>
  )
}

function StatTile({ icon, value, label, brand }: {
  icon: 'calendar' | 'homework' | 'clock' | 'users'
  value: number
  label: string
  brand?: boolean
}) {
  return (
    <div className={`stat-tile${brand ? ' stat-tile--brand' : ''}`}>
      <span className="stat-tile__icon"><Icon name={icon} size={20} /></span>
      <span className="stat-tile__text">
        <span className="stat-tile__value">{value}</span>
        <span className="stat-tile__label">{label}</span>
      </span>
    </div>
  )
}
