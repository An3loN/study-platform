import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/UI/Layout'
import { Icon } from '@/components/UI/icons'
import { HomeworkModal } from '@/components/Lesson/HomeworkModal'
import { WeekCalendar } from '@/components/Lesson/WeekCalendar'
import { LessonCard } from '@/components/Lesson/LessonCard'
import { lessonsApi, homeworkApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { Homework, Lesson } from '@/types'
import {
  addDays,
  formatDateTime,
  formatDayLong,
  formatDuration,
  formatTime,
  isSameDay,
  lessonTitle,
  plural,
  startOfDay,
} from '@/utils/format'

/** Как выглядит задание в карточке ученика: цвет, подпись и срочность. */
function stateOf(homework: Homework, now: Date) {
  const status = homework.mySubmission?.status ?? 'pending'
  const due = homework.effectiveDueAt ? new Date(homework.effectiveDueAt) : null

  if (status === 'revision') {
    return { tone: 'danger', label: 'Нужны поправки', icon: 'revision' as const, modifier: ' hw-tile--revision' }
  }
  if (status === 'submitted') {
    return { tone: 'brand', label: 'На проверке', icon: null, modifier: '' }
  }
  if (status === 'accepted') {
    return { tone: 'success', label: 'Принято', icon: 'check' as const, modifier: '' }
  }
  if (due && due < now) {
    return { tone: 'danger', label: 'Просрочено', icon: 'clock' as const, modifier: ' hw-tile--due' }
  }
  if (due && isSameDay(due, now)) {
    return { tone: 'warning', label: 'Сдать сегодня', icon: 'clock' as const, modifier: ' hw-tile--due' }
  }
  return { tone: 'neutral', label: 'К сдаче', icon: null, modifier: '' }
}

export function StudentDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [homework, setHomework] = useState<Homework[]>([])
  const [todayLessons, setTodayLessons] = useState<Lesson[]>([])
  const [openHomework, setOpenHomework] = useState<string | null>(null)

  const today = useMemo(() => startOfDay(new Date()), [])

  const load = useCallback(async () => {
    const [homeworkRes, todayRes] = await Promise.all([
      homeworkApi.my(),
      lessonsApi.list({ from: today.toISOString(), to: addDays(today, 1).toISOString() }),
    ])
    setHomework(homeworkRes.data.results)
    setTodayLessons(todayRes.data.results)
  }, [today])

  useEffect(() => { load() }, [load])

  const replace = (updated: Homework) => {
    setHomework((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }

  const toggleDone = async (item: Homework) => {
    const { data } = await homeworkApi.setDone(item.id, !item.mySubmission?.isDone)
    replace(data)
  }

  const now = new Date()
  const active = todayLessons.find((lesson) => lesson.status === 'active')
  const upcomingToday = todayLessons.filter(
    (lesson) => lesson.status === 'scheduled' && lesson.scheduledAt && new Date(lesson.scheduledAt) >= now,
  )
  // Принятое задание с глаз убираем: сделанное больше ничего не требует
  const pending = homework.filter((item) => item.mySubmission?.status !== 'accepted')
  const opened = homework.find((item) => item.id === openHomework)

  const greeting = user?.firstName || user?.displayName || 'Привет'

  return (
    <Layout>
      <div className="page">
        <div className="page-head">
          <h1 className="page-head__title">Привет, {greeting}</h1>
          <p className="page-head__sub">
            {formatDayLong(today)}.{' '}
            {todayLessons.length > 0
              ? `${todayLessons.length} ${plural(todayLessons.length, 'урок', 'урока', 'уроков')} сегодня`
              : 'Уроков сегодня нет'}
            {pending.length > 0
              ? ` и ${pending.length} ${plural(pending.length, 'задание', 'задания', 'заданий')} к сдаче.`
              : ', задания сданы.'}
          </p>
        </div>

        {/* Идущий урок — единственное, что нужно прямо сейчас */}
        {active && (
          <div className="hero-lesson">
            <span className="hero-lesson__glyph hero-lesson__glyph--root">√</span>
            <span className="hero-lesson__glyph hero-lesson__glyph--pi">π</span>
            <div className="hero-lesson__main">
              <span className="hero-lesson__status">
                <span className="hero-lesson__dot" />
                Урок идёт · начался в {formatTime(active.scheduledAt)}
              </span>
              <h2 className="hero-lesson__title">{lessonTitle(active, user?.id)}</h2>
              {/* Преподаватель ушёл в заголовок — здесь он был бы вторым разом */}
              <span className="hero-lesson__meta">
                {formatDuration(active.duration)} · {active.hasWhiteboard ? 'онлайн' : 'очно'}
              </span>
            </div>
            <div className="hero-lesson__action">
              <button
                className="btn-secondary btn-xl btn-row"
                onClick={() => navigate(`/lessons/${active.id}`)}
              >
                <Icon name="play" size={18} />
                {active.hasWhiteboard ? 'Войти на доску' : 'Открыть урок'}
              </button>
            </div>
          </div>
        )}

        {!active && upcomingToday.length > 0 && (
          <div className="empty-dashed" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
            <Icon name="clock" size={20} />
            <span>
              Ближайший урок сегодня в {formatTime(upcomingToday[0].scheduledAt)} — {lessonTitle(upcomingToday[0], user?.id)}.
            </span>
          </div>
        )}

        <WeekCalendar
          renderLesson={(lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              selfId={user?.id}
              onOpen={() => navigate(`/lessons/${lesson.id}`)}
            />
          )}
        />

        <section className="section">
          <div className="section__head">
            <h3 className="section__title">Домашние задания</h3>
            <span className="section__count">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <div className="empty-dashed">Домашних заданий нет — всё сдано.</div>
          ) : (
            <div className="hw-grid">
              {pending.map((item) => {
                const state = stateOf(item, now)
                const done = item.mySubmission?.isDone ?? false
                return (
                  <div key={item.id} className={`hw-tile${state.modifier}`}>
                    <div className="hw-tile__head">
                      <span className={`badge badge-${state.tone} badge-row`}>
                        {state.icon && <Icon name={state.icon} size={12} />}
                        {state.label}
                      </span>
                      <span className="hw-tile__when">
                        {item.effectiveDueAt ? `до ${formatDateTime(item.effectiveDueAt)}` : 'до следующего урока'}
                      </span>
                    </div>

                    <p className="hw-tile__text">{item.text || 'Без описания'}</p>
                    <span className="hw-tile__meta">
                      {item.lessonTitle ? `Задано на уроке · ${item.lessonTitle}` : 'Задано между занятиями'}
                      {' · '}
                      {item.teacher.displayName}
                    </span>

                    <span className="hw-tile__line" />

                    <div className="hw-tile__foot">
                      {item.mySubmission?.status === 'submitted' ? (
                        <span className="hw-tile__meta">Ждём ответ преподавателя</span>
                      ) : (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="checkbox" checked={done} onChange={() => toggleDone(item)} />
                          <span className="hw-tile__meta">Сделано</span>
                        </label>
                      )}
                      <button
                        className="btn-secondary btn-sm btn-row"
                        onClick={() => setOpenHomework(item.id)}
                      >
                        Открыть
                        <Icon name="chevron" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {opened && (
        <HomeworkModal
          homework={opened}
          isTeacher={false}
          selfId={user?.id}
          teacherId={opened.teacher.id}
          teacherName={opened.teacher.displayName}
          onClose={() => setOpenHomework(null)}
          onChanged={replace}
        />
      )}
    </Layout>
  )
}
