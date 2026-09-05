import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { Modal } from '@/components/UI/Modal'
import { Field } from '@/components/UI/Field'
import { Icon, initials } from '@/components/UI/icons'
import { LessonForm } from '@/components/Lesson/LessonForm'
import { HomeworkForm } from '@/components/Lesson/HomeworkForm'
import { HomeworkModal } from '@/components/Lesson/HomeworkModal'
import { StudentForm } from '@/components/Students/StudentForm'
import { studentsApi, lessonsApi, homeworkApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { Homework, Lesson, LessonDetail, Student } from '@/types'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  lessonTitle,
  plural,
} from '@/utils/format'

const DURATION_PRESETS = [45, 60, 90]

/** Оценки ученика: среднее, распределение и разбивка по месяцам. */
function gradeStats(homework: Homework[], studentId: string) {
  const mine = homework
    .flatMap((item) => item.submissions.filter((s) => s.student.id === studentId).map((s) => ({ item, s })))
  const graded = mine.filter(({ s }) => s.grade !== null)
  const grades = graded.map(({ s }) => s.grade as number)

  const average = grades.length
    ? grades.reduce((sum, g) => sum + g, 0) / grades.length
    : null

  // Распределение оценок: сколько каких, от пятёрки к двойке
  const distribution = [5, 4, 3, 2]
    .map((value) => ({ value, count: grades.filter((g) => g === value).length }))
    .filter(({ count }) => count > 0)

  // «В срок» считаем по отметке ученика: принято ли — решает уже преподаватель
  const withDue = mine.filter(({ item }) => item.effectiveDueAt)
  const onTime = withDue.filter(({ item, s }) => (
    s.doneAt && new Date(s.doneAt) <= new Date(item.effectiveDueAt as string)
  ))
  const late = withDue.filter(({ item, s }) => (
    s.doneAt && new Date(s.doneAt) > new Date(item.effectiveDueAt as string)
  ))
  const missed = withDue.filter(({ s }) => !s.doneAt)

  const byMonth = new Map<string, number[]>()
  graded.forEach(({ item, s }) => {
    const when = new Date(item.createdAt)
    const key = when.toLocaleDateString('ru-RU', { month: 'long' })
    byMonth.set(key, [...(byMonth.get(key) ?? []), s.grade as number])
  })
  const months = Array.from(byMonth.entries())
    .slice(-3)
    .map(([name, values]) => {
      const avg = values.reduce((sum, g) => sum + g, 0) / values.length
      return { name, avg, percent: Math.round((avg / 5) * 100) }
    })

  return {
    average,
    distribution,
    months,
    total: grades.length,
    onTime: onTime.length,
    late: late.length,
    missed: missed.length,
    dueTotal: withDue.length,
  }
}

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [student, setStudent] = useState<Student | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  // Заметки лежат в детальном ответе урока, поэтому подгружаем их отдельно
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [duration, setDuration] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState('')

  const [lessonModal, setLessonModal] = useState(false)
  const [homeworkModal, setHomeworkModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [openHomework, setOpenHomework] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!studentId) return
    const [studentRes, lessonsRes, homeworkRes] = await Promise.all([
      studentsApi.get(studentId),
      lessonsApi.list({ student: studentId }),
      homeworkApi.my({ student: studentId }),
    ])
    setStudent(studentRes.data)
    setLessons(lessonsRes.data.results)
    setHomework(homeworkRes.data.results)
    setDuration(studentRes.data.defaultLessonDuration ? String(studentRes.data.defaultLessonDuration) : '')
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

  const stats = useMemo(
    () => (studentId ? gradeStats(homework, studentId) : null),
    [homework, studentId],
  )

  const handleSaveSettings = async () => {
    if (!studentId) return
    setSaving(true)
    setSavedNote('')
    try {
      await studentsApi.update(studentId, {
        defaultLessonDuration: duration ? Number(duration) : null,
        ...(password ? { password } : {}),
      })
      setPassword('')
      setSavedNote(password ? 'Сохранено, пароль обновлён' : 'Сохранено')
      await load()
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } }).response?.data
      const first = detail && Object.values(detail)[0]
      setSavedNote(Array.isArray(first) ? first[0] : String(first ?? 'Не удалось сохранить'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Layout><div className="page"><p className="page-head__sub">Загрузка...</p></div></Layout>
  }
  if (!student) {
    return <Layout><div className="page"><p>Ученик не найден. <Link to="/">На главную</Link></p></div></Layout>
  }

  const registered = student.isRegistered
  const opened = homework.find((item) => item.id === openHomework)
  const durationHint = student.defaultLessonDuration ?? null

  return (
    <Layout>
      <div className="page">
        <div className="crumbs">
          <button className="btn-ghost btn-sm btn-row" onClick={() => navigate('/')}>
            <Icon name="chevron" size={16} className="icon-flip" />
            Ученики
          </button>
          <span>/</span>
          <span>{student.displayName}</span>
        </div>

        {/* ── Карточка ученика ─────────────────────────────────────────── */}
        <div className="student-hero">
          <span className={`avatar avatar--lg${registered ? '' : ' avatar--muted'}`}>
            {initials(student.displayName)}
          </span>

          <div className="student-hero__main">
            <div className="student-hero__name-row">
              <h1 className="student-hero__name">{student.displayName}</h1>
              {registered ? (
                <span className="badge badge-success badge-row">
                  <Icon name="check" size={12} />
                  Зарегистрирован
                </span>
              ) : (
                <span className="badge badge-warning badge-row">
                  <Icon name="clock" size={12} />
                  Ждёт регистрации
                </span>
              )}
            </div>

            <div className="student-hero__meta">
              <span style={{ font: 'var(--type-body-sm)', color: 'var(--text-body)' }}>
                {student.lessonsCount} {plural(student.lessonsCount, 'занятие', 'занятия', 'занятий')}
                {' · с '}
                {formatDate(student.dateJoined)}
              </span>
              <span className="student-hero__fact">
                <Icon name="smartphone" size={15} />
                {student.phone || 'телефон не указан'}
              </span>
              <span className="student-hero__fact">
                <Icon name="clock" size={15} />
                урок по умолчанию {durationHint ? `${durationHint} мин` : '60 мин'}
              </span>
            </div>
          </div>

          <div className="student-hero__actions">
            <button className="btn-primary btn-md btn-row" onClick={() => setLessonModal(true)}>
              <Icon name="plus" size={16} />
              Добавить урок
            </button>
            <button
              className="btn-outline btn-md btn-row"
              onClick={() => setHomeworkModal(true)}
              disabled={!registered}
              title={registered ? undefined : 'Задание некому отправить: ученик ещё не зарегистрировался'}
            >
              <Icon name="homework" size={16} />
              Создать дз
            </button>
            <button className="btn-ghost btn-md btn-row" onClick={() => setSettingsOpen((v) => !v)}>
              <Icon name="settings" size={16} />
              Настройки
            </button>
          </div>
        </div>

        {/* ── Настройки ученика ────────────────────────────────────────── */}
        {settingsOpen && (
          <div className="settings-card">
            <div className="settings-card__head">
              <span className="section__title">Настройки ученика</span>
              <span className="section__count">Действуют только для {student.displayName}</span>
            </div>

            <div className="settings-grid">
              <div className="settings-box">
                <span className="settings-box__label">Длительность урока по умолчанию</span>
                <div className="settings-box__row">
                  <div style={{ flex: 1 }}>
                    <Field
                      label=""
                      type="number"
                      min={15}
                      step={5}
                      numeric
                      placeholder="60"
                      hint="Подставится в форму нового урока"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </div>
                  <div className="chips" style={{ paddingBottom: 22 }}>
                    {DURATION_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`chip${Number(duration) === preset ? ' chip--on' : ''}`}
                        onClick={() => setDuration(String(preset))}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-box">
                <span className="settings-box__label">Новый пароль</span>
                <div className="settings-box__row">
                  <div style={{ flex: 1 }}>
                    <Field
                      label=""
                      type="password"
                      icon="lock"
                      placeholder="Минимум 8 символов"
                      hint="Ученик войдёт с новым паролем"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="dialog__actions">
              {savedNote && <span className="section__count" style={{ marginRight: 'auto' }}>{savedNote}</span>}
              <button className="btn-ghost btn-md" onClick={() => setEditModal(true)}>Данные ученика</button>
              <button className="btn-ghost btn-md" onClick={() => setSettingsOpen(false)}>Свернуть</button>
              <button className="btn-primary btn-md" onClick={handleSaveSettings} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}

        {/* ── Приглашение ──────────────────────────────────────────────── */}
        {!registered && student.inviteUrl && student.inviteToken && (
          <div className="invite-card">
            <span className="invite-card__qr">
              <img
                src={studentsApi.qrUrl(student.inviteToken)}
                alt="QR-код на регистрацию"
                width={132}
                height={132}
              />
            </span>
            <div className="invite-card__main">
              {/* Имя тут не склоняется, поэтому в заголовке его нет:
                  «Пригласите Анна в Мати» читалось бы как ошибка */}
              <span className="invite-card__title">Пригласите ученика в Мати</span>
              <p className="invite-card__text">
                Ученик сканирует QR или открывает ссылку, заполняет имя и задаёт пароль сам.
                До этого домашние задания и статистика недоступны — уроки назначать уже можно.
              </p>
              <div className="invite-card__row">
                <span className="invite-card__link">{student.inviteUrl}</span>
                <button
                  className="btn-secondary btn-md btn-row"
                  onClick={() => navigator.clipboard?.writeText(student.inviteUrl ?? '')}
                >
                  <Icon name="copy" size={16} />
                  Копировать
                </button>
              </div>
              {student.inviteExpiresAt && (
                <span className="invite-card__note">
                  Ссылка действует до {formatDate(student.inviteExpiresAt)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Оценки ───────────────────────────────────────────────────── */}
        <section className="section">
          <div className="section__head">
            <h3 className="section__title">Оценки и дз</h3>
            <span className="section__count">
              {stats && stats.total > 0
                ? `${stats.total} ${plural(stats.total, 'оценка', 'оценки', 'оценок')} за дз`
                : 'оценок пока нет'}
            </span>
          </div>

          <div className="stats-grid">
            <div className={`stat-card${stats?.average ? ' stat-card--brand' : ' stat-card--empty'}`}>
              <span className="stat-card__label">Средняя оценка</span>
              <div className="stat-card__value-row">
                <span className="stat-card__value">
                  {stats?.average ? stats.average.toFixed(1).replace('.', ',') : '—'}
                </span>
                {stats?.average && <span className="stat-card__unit">из 5</span>}
              </div>
              {stats && stats.distribution.length > 0 ? (
                <div className="grade-chips">
                  {stats.distribution.map(({ value, count }) => (
                    <span key={value} className="grade-chip">{value} — {count}</span>
                  ))}
                </div>
              ) : (
                <span className="stat-card__hint">Оценок пока нет</span>
              )}
            </div>

            <div className={`stat-card${stats && stats.dueTotal > 0 ? '' : ' stat-card--empty'}`}>
              <span className="stat-card__label">Дз сделано в срок</span>
              <div className="stat-card__value-row">
                <span className="stat-card__value">
                  {stats && stats.dueTotal > 0
                    ? `${Math.round((stats.onTime / stats.dueTotal) * 100)}%`
                    : '—'}
                </span>
                {stats && stats.dueTotal > 0 && (
                  <span className="stat-card__unit">{stats.onTime} из {stats.dueTotal}</span>
                )}
              </div>
              {stats && stats.dueTotal > 0 ? (
                <>
                  <div className="progress">
                    <div
                      className="progress__fill"
                      style={{ width: `${Math.round((stats.onTime / stats.dueTotal) * 100)}%` }}
                    />
                  </div>
                  <span className="stat-card__hint">
                    {stats.late} с опозданием, {stats.missed} не сдано
                  </span>
                </>
              ) : (
                <span className="stat-card__hint">Заданий ещё не было</span>
              )}
            </div>

            <div className={`stat-card${stats && stats.months.length > 0 ? '' : ' stat-card--empty'}`}>
              <span className="stat-card__label">По месяцам</span>
              {stats && stats.months.length > 0 ? (
                stats.months.map((month) => (
                  <div key={month.name} className="month-row">
                    <span className="month-row__name">{month.name}</span>
                    <span className="month-row__avg">{month.avg.toFixed(1).replace('.', ',')}</span>
                    <span className="month-row__bar">
                      <span className="progress progress--sm" style={{ display: 'block' }}>
                        <span
                          className="progress__fill progress__fill--brand"
                          style={{ display: 'block', width: `${month.percent}%` }}
                        />
                      </span>
                    </span>
                    <span className="month-row__pct">{month.percent}%</span>
                  </div>
                ))
              ) : (
                <span className="stat-card__hint">
                  Статистика появится после первых проверенных заданий.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Уроки ────────────────────────────────────────────────────── */}
        <section className="section">
          <div className="section__head">
            <div className="section__title-row">
              <h3 className="section__title">Уроки</h3>
              <span className="section__count">{lessons.length}</span>
            </div>
            <button className="btn-primary btn-sm btn-row" onClick={() => setLessonModal(true)}>
              <Icon name="plus" size={16} />
              Добавить урок
            </button>
          </div>

          {lessons.length === 0 ? (
            <div className="empty-dashed">
              Уроков ещё не было — назначьте первый, он появится здесь.
            </div>
          ) : (
            <div className="panel__scroll" style={{ maxHeight: 620, padding: 2, margin: -2 }}>
              <div className="lesson-grid">
                {lessons.map((lesson) => {
                  const when = lesson.scheduledAt ? new Date(lesson.scheduledAt) : null
                  const note = notes[lesson.id]
                  return (
                    <button
                      key={lesson.id}
                      className={`lesson-tile${lesson.status === 'cancelled' ? ' lesson-tile--cancelled' : ''}`}
                      onClick={() => navigate(`/lessons/${lesson.id}`)}
                    >
                      <span className="lesson-tile__top">
                        <span className={`lesson-tile__day${lesson.status === 'active' ? ' lesson-tile__day--soon' : ''}`}>
                          {when ? (
                            <>
                              <span className="lesson-tile__wd">
                                {when.toLocaleDateString('ru-RU', { weekday: 'short' })}
                              </span>
                              <span className="lesson-tile__num">{when.getDate()}</span>
                              <span className="lesson-tile__mon">
                                {when.toLocaleDateString('ru-RU', { month: 'short' })}
                              </span>
                            </>
                          ) : (
                            <span className="lesson-tile__wd">без даты</span>
                          )}
                        </span>

                        <span className="lesson-tile__body">
                          <span className="lesson-tile__time">
                            {formatTime(lesson.scheduledAt)}
                            <span className="lesson-card__dur">{formatDuration(lesson.duration)}</span>
                          </span>
                          <span className="lesson-tile__title">{lessonTitle(lesson)}</span>
                          <span className="badge-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                            <span className={`badge badge-${lesson.status}`}>
                              {lesson.status === 'active' ? 'Идёт' : lesson.status === 'finished' ? 'Завершён'
                                : lesson.status === 'cancelled' ? 'Отменён' : 'Запланирован'}
                            </span>
                            {!lesson.hasWhiteboard && <span className="badge badge-neutral">Очный</span>}
                            {lesson.homeworkCount > 0 && (
                              <span className="badge badge-neutral">ДЗ: {lesson.homeworkCount}</span>
                            )}
                          </span>
                        </span>
                      </span>

                      {note && (
                        <span className="lesson-tile__note">
                          <span className="lesson-tile__note-label">Заметка</span>
                          <span className="lesson-tile__note-text">{note}</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── Домашние задания ─────────────────────────────────────────── */}
        <section className="section">
          <div className="section__head">
            <div className="section__title-row">
              <h3 className="section__title">Домашние задания</h3>
              <span className="section__count">{registered ? homework.length : 'недоступны до регистрации'}</span>
            </div>
            {registered && (
              <button className="btn-outline btn-sm btn-row" onClick={() => setHomeworkModal(true)}>
                <Icon name="plus" size={16} />
                Создать дз
              </button>
            )}
          </div>

          {!registered ? (
            <div className="empty-dashed" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <Icon name="homework" size={22} />
              <span style={{ flex: 1 }}>
                Задание некому отправить: ученик получит доступ, когда пройдёт по ссылке.
                Первое дз можно задать сразу после регистрации.
              </span>
            </div>
          ) : homework.length === 0 ? (
            <div className="empty-dashed">Заданий пока не было.</div>
          ) : (
            <div className="panel">
              <div className="hw-rows">
                {homework.map((item) => {
                  const submission = item.submissions.find((s) => s.student.id === student.id)
                  const grade = submission?.grade ?? null
                  const status = submission?.status ?? 'pending'
                  const tone = status === 'accepted' ? 'success'
                    : status === 'submitted' ? 'brand'
                      : status === 'revision' ? 'danger' : 'neutral'
                  const label = status === 'accepted' ? 'Принято'
                    : status === 'submitted' ? 'На проверке'
                      : status === 'revision' ? 'Нужны поправки' : 'Ждём сдачи'
                  return (
                    <button key={item.id} className="hw-row" onClick={() => setOpenHomework(item.id)}>
                      <span className={`hw-row__mark${grade ? ' hw-row__mark--graded' : ''}`}>
                        {grade ?? '—'}
                      </span>
                      <span className="hw-row__main">
                        <span className="hw-row__row">
                          <span className={`badge badge-${tone}`}>{label}</span>
                          <span className="hw-row__meta">
                            {item.effectiveDueAt ? `срок ${formatDateTime(item.effectiveDueAt)}` : 'до следующего урока'}
                            {item.lessonTitle ? ` · ${item.lessonTitle}` : ''}
                          </span>
                        </span>
                        <span className="hw-row__text">{item.text || 'Без описания'}</span>
                      </span>
                      <Icon name="chevron" size={20} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {lessonModal && (
        <Modal
          title="Новый урок"
          description={`Урок для ${student.displayName}. Время можно не заполнять.`}
          onClose={() => setLessonModal(false)}
          width={520}
        >
          <LessonForm
            students={[student]}
            presetStudentId={student.id}
            defaultDuration={student.defaultLessonDuration}
            onSubmit={async (data) => { await lessonsApi.create(data); setLessonModal(false); await load() }}
            onCancel={() => setLessonModal(false)}
          />
        </Modal>
      )}

      {homeworkModal && (
        <Modal
          title="Новое задание"
          description={`Задание для ${student.displayName} — без привязки к уроку.`}
          onClose={() => setHomeworkModal(false)}
          width={520}
        >
          <HomeworkForm
            students={[student]}
            presetStudentId={student.id}
            onCancel={() => setHomeworkModal(false)}
            onDone={async () => { setHomeworkModal(false); await load() }}
          />
        </Modal>
      )}

      {editModal && (
        <Modal
          title="Данные ученика"
          description="Имя, псевдоним и телефон — то, что видно в списке и по чему ученик входит."
          onClose={() => setEditModal(false)}
        >
          <StudentForm
            initial={student}
            submitLabel="Сохранить"
            onSubmit={async (data) => {
              if (!studentId) return
              await studentsApi.update(studentId, data)
              setEditModal(false)
              await load()
            }}
            onCancel={() => setEditModal(false)}
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
          onChanged={(updated) => setHomework((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))}
        />
      )}
    </Layout>
  )
}
