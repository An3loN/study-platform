export type Role = 'student' | 'teacher'
export type LessonStatus = 'scheduled' | 'active' | 'finished' | 'cancelled'

export interface UserPublic {
  id: string
  firstName: string
  lastName: string
  alias: string
  displayName: string
  avatar: string | null
  role: Role
}

export interface User extends UserPublic {
  phone: string | null
  bio: string
}

/** Ученик в списке у преподавателя */
export interface Student {
  id: string
  firstName: string
  lastName: string
  alias: string
  displayName: string
  phone: string | null
  lessonsCount: number
  /** Ученик завершил регистрацию по ссылке (или преподаватель сам задал телефон и пароль) */
  isRegistered: boolean
  inviteToken: string | null
  inviteUrl: string | null
}

export interface StudentInput {
  firstName?: string
  lastName?: string
  alias?: string
  phone?: string
  password?: string
}

/** pending — не сдано, submitted — ученик отметил, revision — нужны поправки */
export type SubmissionStatus = 'pending' | 'submitted' | 'revision' | 'accepted'

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  pending: 'Не сдано',
  submitted: 'На проверке',
  revision: 'Нужны поправки',
  accepted: 'Принято',
}

/** Файл, присланный учеником в ветке задания — это и есть его работа */
export interface HomeworkFile {
  id: string
  url: string
  name: string
  createdAt: string
}

export interface HomeworkSubmission {
  id: string | null
  student: UserPublic
  status: SubmissionStatus
  isDone: boolean
  doneAt: string | null
  grade: number | null
  acceptedAt: string | null
  revisionRequestedAt: string | null
  /** Что ученик прислал: файлы из его ветки обсуждения */
  files: HomeworkFile[]
  /** Сообщений в его ветке */
  messagesCount: number
}

export interface HomeworkMessage {
  id: string
  author: UserPublic
  text: string
  attachment: string | null
  attachmentName: string | null
  createdAt: string
}

export interface Homework {
  id: string
  /** Задание не обязано быть привязано к уроку: null — задано между занятиями */
  lesson: string | null
  lessonTitle: string | null
  lessonScheduledAt: string | null
  /** Преподаватель урока — собеседник ученика в обсуждении задания */
  teacher: UserPublic
  text: string
  attachment: string | null
  /** Заданный вручную срок. null — до следующего урока */
  dueAt: string | null
  /** Срок, который показываем: заданный вручную или следующий урок */
  effectiveDueAt: string | null
  /** Преподавателю — строка на каждого ученика урока, ученику — только своя */
  submissions: HomeworkSubmission[]
  /** Своя сдача — у преподавателя всегда null */
  mySubmission: HomeworkSubmission | null
  /** Ученику — сообщения только его ветки */
  messagesCount: number
  createdAt: string
}

export interface Lesson {
  id: string
  title: string
  scheduledAt: string | null
  duration: number | null
  status: LessonStatus
  comment: string
  students: UserPublic[]
  homeworkCount: number
  createdAt: string
  /** Отмена: время, причина и кто отменил. null — урок не отменяли */
  cancelledAt: string | null
  cancelReason: string
  cancelledByName: string
  /** Очный урок — без доски и без ссылки для входа */
  hasWhiteboard: boolean
}

/** Заметка с прошлого занятия — только для преподавателя */
export interface PreviousNote {
  id: string
  title: string
  scheduledAt: string | null
  notes: string
}

export interface LessonDetail extends Lesson {
  teacher: UserPublic
  roomId: string
  /** Только преподавателю */
  notes: string | null
  shareUrl: string | null
  shareToken: string | null
  homework: Homework[]
  /** Заметки с трёх последних занятий с теми же учениками */
  previousNotes: PreviousNote[]
}

export interface LessonInput {
  title?: string
  scheduledAt?: string | null
  duration?: number | null
  comment?: string
  notes?: string
  students?: string[]
  hasWhiteboard?: boolean
}

/** Публичная карточка урока для входящего по ссылке */
export interface LessonShare {
  id: string
  title: string
  scheduledAt: string | null
  duration: number | null
  status: LessonStatus
  comment: string
  teacherName: string
  cancelledAt: string | null
  cancelReason: string
}

export interface GuestSession {
  access: string
  name: string
  roomId: string
  lesson: LessonShare
}

export interface InviteInfo {
  token: string
  teacherName: string
  firstName: string
  lastName: string
  alias: string
  phone: string | null
  isAccepted: boolean
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
