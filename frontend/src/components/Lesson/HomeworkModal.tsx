import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HomeworkThread } from './HomeworkThread'
import { StatusPill, aggregate, doneCount, dueState } from './homeworkParts'
import { Icon, initials } from '@/components/UI/icons'
import { homeworkApi } from '@/services/api'
import { SUBMISSION_LABEL, type Homework, type HomeworkSubmission } from '@/types'
import { formatDateTime, formatDay, toLocalInput, fromLocalInput } from '@/utils/format'

interface Props {
  homework: Homework
  isTeacher: boolean
  /** Кто смотрит: свои сообщения в переписке выравниваются по правому краю */
  selfId?: string
  /** Кто ведёт урок: его реплики выделяются цветом */
  teacherId?: string
  teacherName?: string
  onClose: () => void
  onChanged: (updated: Homework) => void
  /** Удаление живёт в режиме правки: рядом с тем, что правят, и не на виду */
  onDelete?: () => void
}

/**
 * Заголовок окна. Отдельного названия у задания нет, поэтому берём начало
 * текста — до конца первого предложения или первой строки. Дальше обычно идут
 * пояснения («в 216 сначала раскрой скобки»), а они уже есть ниже целиком.
 */
function headline(text: string): string {
  const first = text.trim().split('\n')[0] ?? ''
  const sentence = first.match(/^.*?[.!?…](?=\s|$)/)?.[0] ?? first
  const short = sentence.replace(/[.\s]+$/, '')
  return (short.length > 70 ? `${short.slice(0, 70)}…` : short) || 'Без описания'
}

/**
 * Окно задания: условия, работы учеников и переписка по каждой.
 *
 * В боковую панель это не помещается, а разговор о конкретной работе рядом с
 * самой работой — единственный способ понять, о чём речь. Поэтому карточка в
 * панели короткая, а разбор живёт здесь, поверх доски.
 */
export function HomeworkModal({
  homework, isTeacher, selfId, teacherId, teacherName, onClose, onChanged, onDelete,
}: Props) {
  const [item, setItem] = useState(homework)
  // Раскрытая работа: сразу открываем первую, которая ждёт проверки
  const [openStudent, setOpenStudent] = useState<string | null>(null)
  const [grades, setGrades] = useState<Record<string, number | null>>({})
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(item.text)
  const [draftDue, setDraftDue] = useState(toLocalInput(item.dueAt))
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setItem(homework) }, [homework])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = (updated: Homework) => {
    setItem(updated)
    onChanged(updated)
  }

  const due = dueState(item.effectiveDueAt, !isTeacher)
  const head = aggregate(item, isTeacher)
  const { done, total } = doneCount(item)

  // Сначала те, что ждут действия преподавателя, — разобранные уходят вниз
  const ORDER = { submitted: 0, revision: 1, pending: 2, accepted: 3 }
  const works = [...item.submissions].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.student.displayName.localeCompare(b.student.displayName),
  )
  const expanded = openStudent ?? works.find((work) => work.status === 'submitted')?.student.id ?? null

  const saveTask = async () => {
    setBusy(true)
    try {
      const { data } = await homeworkApi.update(item.id, {
        text: draftText.trim(),
        dueAt: fromLocalInput(draftDue),
      })
      apply(data)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Оценка, которую видно на кнопках: выбранная сейчас, а пока не трогали —
   * уже стоящая. Проверять именно на наличие ключа, а не на `??`: снятая
   * оценка это осмысленный null, и он не должен подменяться прежней.
   */
  const gradeOf = (work: HomeworkSubmission) =>
    (work.student.id in grades ? grades[work.student.id] : work.grade) ?? null

  const review = async (work: HomeworkSubmission, accepted: boolean) => {
    const studentId = work.student.id
    setBusy(true)
    try {
      const { data } = await homeworkApi.review(item.id, {
        student: studentId,
        accepted,
        grade: accepted ? gradeOf(work) : null,
      })
      apply(data)
    } finally {
      setBusy(false)
    }
  }

  const setDone = async (done: boolean) => {
    setBusy(true)
    try {
      const { data } = await homeworkApi.setDone(item.id, done)
      apply(data)
    } finally {
      setBusy(false)
    }
  }

  /** Ученик прикладывает работу — это обычное сообщение с файлом */
  const attachWork = async (file: File) => {
    setBusy(true)
    try {
      await homeworkApi.sendMessage(item.id, { text: '', attachment: file })
      const { data } = await homeworkApi.get(item.id)
      apply(data)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const reloadItem = async () => {
    const { data } = await homeworkApi.get(item.id)
    apply(data)
  }

  const brief = (
    <div className="hw-brief">
      {editing ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={draftText}
            rows={3}
            onChange={(event) => setDraftText(event.target.value)}
            style={{ resize: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label className="hw-note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Сдать до
              <input
                type="datetime-local"
                value={draftDue}
                onChange={(event) => setDraftDue(event.target.value)}
                style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
              />
            </label>
            <span className="hw-note">пусто — до следующего урока</span>
            {onDelete && (
              <button
                className="hw-btn-quiet"
                style={{ marginLeft: 'auto', height: 36, color: 'var(--coral-600)' }}
                onClick={onDelete}
              >
                Удалить задание
              </button>
            )}
            <button
              className="btn-primary"
              style={onDelete ? undefined : { marginLeft: 'auto' }}
              disabled={busy}
              onClick={saveTask}
            >
              Сохранить
            </button>
            <button className="hw-btn-quiet" style={{ height: 36 }} onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="hw-brief__text">{item.text || 'Без описания'}</p>
          <div className="hw-brief__side">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: due.late ? 'var(--coral-500)' : 'var(--ink-400)' }}>
                <Icon name="calendar" size={14} />
              </span>
              <span className={`hw-meta${due.late ? ' hw-meta--late' : ''}`}>
                {due.text}
                {isTeacher && ` · задано ${formatDay(item.createdAt)}`}
              </span>
            </div>
            {item.attachment && (
              <a className="hw-file" href={item.attachment} target="_blank" rel="noreferrer">
                <Icon name="clip" size={14} />
                Файл к заданию
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )

  const fileChips = (files: HomeworkSubmission['files']) => files.map((file) => (
    <a key={file.id} className="hw-file" href={file.url} target="_blank" rel="noreferrer">
      <Icon name="image" size={14} />
      {file.name}
    </a>
  ))

  /** Работа одного ученика — глазами преподавателя */
  const renderWork = (work: HomeworkSubmission) => {
    const studentId = work.student.id
    const open = expanded === studentId
    const grade = gradeOf(work)

    const when = work.status === 'accepted' && work.acceptedAt
      ? `сдано ${work.doneAt ? formatDateTime(work.doneAt) : '—'} · проверено ${formatDay(work.acceptedAt)}`
      : work.doneAt
        ? `сдано ${formatDateTime(work.doneAt)}`
        : work.status === 'revision'
          ? `отправлено на правки ${formatDay(work.revisionRequestedAt)}`
          : 'ничего не прислал'

    return (
      <div key={studentId} className={`hw-work${open ? ' hw-work--open' : ''}`}>
        <button
          className="hw-work__head"
          onClick={() => setOpenStudent(open ? '' : studentId)}
        >
          <div className="hw-avatar" style={{ width: 30, height: 30 }}>{initials(work.student.displayName)}</div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="hw-work__name">{work.student.displayName}</span>
            <span className="hw-meta">{when}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {work.grade && <span className="hw-work__grade">{work.grade}</span>}
            <StatusPill kind={work.status} label={SUBMISSION_LABEL[work.status]} />
            <span style={{ color: 'var(--ink-400)', transform: open ? 'rotate(90deg)' : undefined }}>
              <Icon name="chevron" size={16} />
            </span>
          </div>
        </button>

        {open && (
          <>
            {work.files.length > 0 && <div className="hw-work__files">{fileChips(work.files)}</div>}

            <div className="hw-work__thread">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ color: 'var(--ink-400)' }}><Icon name="lock" size={14} /></span>
                <span className="hw-section__caption">
                  Личный чат · {work.student.displayName}
                </span>
              </div>
              <HomeworkThread
                homeworkId={item.id}
                student={studentId}
                selfId={selfId}
                teacherId={teacherId}
                placeholder="Написать ученику"
                onSent={reloadItem}
              />
            </div>

            <div className="hw-work__review">
              <span className="hw-section__caption">Оценка</span>
              <div className="hw-grade">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    className={`hw-grade__btn${grade === value ? ' hw-grade__btn--on' : ''}`}
                    title={grade === value ? 'Снять оценку' : `Поставить ${value}`}
                    onClick={() => setGrades((prev) => ({
                      ...prev, [studentId]: grade === value ? null : value,
                    }))}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span className="hw-note">необязательно</span>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="hw-btn-revision" disabled={busy} onClick={() => review(work, false)}>
                  <Icon name="revision" size={15} />
                  На правки
                </button>
                <button className="hw-btn-accept" disabled={busy} onClick={() => review(work, true)}>
                  <Icon name="check" size={15} width={2.4} />
                  Принять
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  const mine = item.mySubmission

  const body = isTeacher ? (
    <>
      {brief}
      <div className="hw-section">
        <span>Работы</span>
        <span className="hw-meta">{done} из {total} сдали</span>
        <span className="hw-note" style={{ marginLeft: 'auto' }}>сначала те, что ждут проверки</span>
      </div>
      <div className="hw-list">
        {works.length === 0 && <p className="hw-note">На уроке нет учеников — сдавать задание некому.</p>}
        {works.map(renderWork)}
      </div>
    </>
  ) : (
    <>
      {brief}
      <div className="hw-section">
        <span>Моя работа</span>
        <span className="hw-meta">
          {mine?.doneAt ? `сдано ${formatDateTime(mine.doneAt)}` : 'ещё не сдана'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) attachWork(file)
            }}
          />
          <button className="hw-btn-quiet" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="clip" size={14} />
            Добавить файл
          </button>
          {mine?.isDone ? (
            <button className="hw-btn-quiet" disabled={busy} onClick={() => setDone(false)}>
              Снять отметку
            </button>
          ) : (
            <button className="btn-primary" style={{ height: 30, padding: '0 12px', fontSize: 13 }}
              disabled={busy} onClick={() => setDone(true)}>
              Сдать работу
            </button>
          )}
        </div>
      </div>

      {mine && mine.files.length > 0 && (
        <div style={{ flex: 'none', padding: '0 22px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {fileChips(mine.files)}
        </div>
      )}

      <div style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '14px 22px 8px',
        borderTop: '1px solid var(--ink-100)',
      }}>
        <span style={{ color: 'var(--ink-400)' }}><Icon name="lock" size={14} /></span>
        <span className="hw-section__caption">
          Личный чат · {teacherName ?? 'преподаватель'} · только вы двое
        </span>
      </div>

      <HomeworkThread
        homeworkId={item.id}
        selfId={selfId}
        teacherId={teacherId}
        placeholder="Написать преподавателю"
        variant="full"
        onSent={reloadItem}
      />
    </>
  )

  return createPortal(
    <div className="hw-modal" onClick={onClose}>
      <div
        className={`hw-modal__window${isTeacher ? '' : ' hw-modal__window--narrow'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hw-modal__head">
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="hw-modal__label">Домашнее задание</span>
              <StatusPill kind={head.kind} label={head.label} />
            </div>
            <h2 className="hw-modal__title">{headline(item.text)}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
            {isTeacher && !editing && (
              <button className="hw-modal__icon" title="Изменить задание" onClick={() => {
                setDraftText(item.text)
                setDraftDue(toLocalInput(item.dueAt))
                setEditing(true)
              }}>
                <Icon name="pencil" size={18} />
              </button>
            )}
            <button className="hw-modal__icon" title="Закрыть" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {body}
        </div>
      </div>
    </div>,
    document.body,
  )
}
