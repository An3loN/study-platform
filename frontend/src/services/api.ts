import axios from 'axios'
import type {
  User, Student, StudentInput, StudentStats, Lesson, LessonDetail, LessonInput, LessonShare,
  GuestSession, Homework, HomeworkMessage, InviteInfo, Paginated,
} from '@/types'

// ── snake_case ↔ camelCase ───────────────────────────────────────────────────
// Django/DRF отдаёт и принимает snake_case, фронт работает с camelCase.
// Конвертируем на уровне транспорта, чтобы компоненты не знали про snake_case.

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function convertKeys(value: unknown, convert: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, convert))
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date || value instanceof Blob || value instanceof FormData) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [convert(k), convertKeys(v, convert)]),
  )
}

export const http = axios.create({ baseURL: '/api' })

// Тело запроса: camelCase → snake_case (ключи, уже записанные в snake_case, не меняются)
http.interceptors.request.use((config) => {
  if (config.data && !(config.data instanceof FormData)) {
    config.data = convertKeys(config.data, toSnake)
  }
  return config
})

// Ответ: snake_case → camelCase
http.interceptors.response.use((res) => {
  res.data = convertKeys(res.data, toCamel)
  return res
})

// Добавляем JWT к каждому запросу
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * Обновление токена — одно на всех.
 *
 * Когда access протухает, страница обычно шлёт несколько запросов сразу, и
 * 401 получают все. Раньше каждый шёл обновлять токен сам, с одним и тем же
 * refresh. Сервер ротирует его и вносит старый в блэклист, поэтому первый
 * рефреш удавался, а второй получал 401 — и выкидывал пользователя на вход
 * посреди работы. Теперь пока рефреш идёт, остальные ждут его результата.
 */
let refreshing: Promise<string> | null = null

function refreshAccess(refresh: string): Promise<string> {
  refreshing ??= axios
    .post('/api/auth/refresh/', { refresh })
    .then(async ({ data }) => {
      localStorage.setItem('access_token', data.access)
      if (data.refresh) localStorage.setItem('refresh_token', data.refresh)

      // Держим store в актуальном состоянии: доска берёт токен именно оттуда,
      // иначе после рефреша она переподключится с протухшим токеном.
      // Динамический импорт — чтобы не было циклической зависимости store ↔ api.
      const { useAuthStore } = await import('@/store/authStore')
      useAuthStore.setState({
        accessToken: data.access,
        ...(data.refresh ? { refreshToken: data.refresh } : {}),
      })
      return data.access as string
    })
    .finally(() => { refreshing = null })
  return refreshing
}

// Авто-рефреш при 401
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    // На самом логине 401 — это неверный пароль, а не протухшая сессия: его
    // показывает форма. Рефрешить нечего (сессии ещё нет), а переход на
    // /login перезагрузил бы страницу и стёр сообщение об ошибке вместе с ней.
    const isLogin = typeof original?.url === 'string' && original.url.includes('/auth/login/')
    if (error.response?.status === 401 && !original._retry && !isLogin) {
      original._retry = true

      // Запрос ушёл со старым токеном, а его уже обновили, пока ждали ответа:
      // рефреш не нужен, достаточно повторить со свежим
      const current = localStorage.getItem('access_token')
      if (current && original.headers?.Authorization !== `Bearer ${current}`) {
        original.headers.Authorization = `Bearer ${current}`
        return http(original)
      }

      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }
      try {
        const access = await refreshAccess(refresh)
        original.headers.Authorization = `Bearer ${access}`
        return http(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

/**
 * Все страницы списка разом.
 *
 * Выдача DRF пагинирована по 20, и там, где нужен весь набор, первая
 * страница молча его обрезала: календарь недели терял уроки сверх двадцати,
 * а список учеников — учеников. Страницы берём по 100 (больше сервер не
 * отдаёт) и идём, пока есть следующая.
 */
async function fetchAll<T>(url: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page += 1) {
    const { data } = await http.get<Paginated<T>>(url, {
      params: { ...params, page, page_size: 100 },
    })
    items.push(...data.results)
    if (!data.next) return items
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (phone: string, password: string) =>
    http.post<{ access: string; refresh: string }>('/auth/login/', { phone, password }),

  me: () => http.get<User>('/auth/me/'),
}

// ── Ученики ──────────────────────────────────────────────────────────────────

export const studentsApi = {
  /** Все ученики, а не первая страница: список нужен целиком */
  all: () => fetchAll<Student>('/students/'),
  get: (id: string) => http.get<Student>(`/students/${id}/`),
  create: (data: StudentInput) => http.post<Student>('/students/', data),
  update: (id: string, data: StudentInput) => http.patch<Student>(`/students/${id}/`, data),
  remove: (id: string) => http.delete(`/students/${id}/`),
  /** Успеваемость по всей истории: на фронте её пришлось бы считать по одной странице */
  stats: (id: string) => http.get<StudentStats>(`/students/${id}/stats/`),
  /** QR со ссылкой-приглашением: секрет — сам токен, поэтому можно прямо в <img src> */
  qrUrl: (inviteToken: string) => `/api/invites/${inviteToken}/qr.svg`,
}

// ── Приглашения (публично) ───────────────────────────────────────────────────

export const invitesApi = {
  info: (token: string) => axios.get<InviteInfo>(`/api/invites/${token}/`).then(camelize),
  accept: (token: string, data: {
    firstName?: string
    lastName?: string
    alias?: string
    phone: string
    password: string
  }) =>
    axios.post<{ access: string; refresh: string }>(`/api/invites/${token}/accept/`, {
      first_name: data.firstName ?? '',
      last_name: data.lastName ?? '',
      alias: data.alias ?? '',
      phone: data.phone,
      password: data.password,
    }),
}

// Публичные вызовы идут мимо http-инстанса (без токена), поэтому конвертируем вручную
function camelize<T>(response: { data: T }): { data: T } {
  return { data: convertKeys(response.data, toCamel) as T }
}

// ── Уроки ────────────────────────────────────────────────────────────────────

export const lessonsApi = {
  /**
   * Все уроки промежутка — для календаря и «сегодня». Промежуток ограничен,
   * а обрезать его первой страницей нельзя: пропавший урок никто не заметит.
   */
  between: (from: string, to: string) => fetchAll<Lesson>('/lessons/', { from, to }),
  /** Все уроки одного ученика — лента на его странице вместе с числом */
  allOf: (student: string) => fetchAll<Lesson>('/lessons/', { student }),
  get: (id: string) => http.get<LessonDetail>(`/lessons/${id}/`),
  create: (data: LessonInput) => http.post<LessonDetail>('/lessons/', data),
  update: (id: string, data: LessonInput) => http.patch<LessonDetail>(`/lessons/${id}/`, data),
  remove: (id: string) => http.delete(`/lessons/${id}/`),
  cancel: (id: string, reason: string) =>
    http.post<LessonDetail>(`/lessons/${id}/cancel/`, { reason }),
  shareQrUrl: (shareToken: string) => `/api/lessons/share/${shareToken}/qr.svg`,

  // Вход по ссылке — без аккаунта
  shareInfo: (shareToken: string) =>
    axios.get<LessonShare>(`/api/lessons/share/${shareToken}/`).then(camelize),
  join: (shareToken: string, name: string) =>
    axios.post(`/api/lessons/share/${shareToken}/join/`, { name }).then(camelize<GuestSession>),
}

// ── Домашние задания ─────────────────────────────────────────────────────────

export const homeworkApi = {
  /**
   * Все незакрытые задания: у преподавателя — где хоть кому-то работу ещё не
   * приняли, у ученика — где не приняли его. Для лент «требуют внимания» и
   * «к сдаче»: первая страница выдачи молча теряла старое непроверенное.
   */
  open: () => fetchAll<Homework>('/homework/', { open: 1 }),

  /** Все задания одного ученика — для его страницы, где они видны списком */
  allOf: (student: string) => fetchAll<Homework>('/homework/', { student }),

  /**
   * Задание без урока: адресатов перечисляем сами. У задания с уроком они
   * берутся из самого урока, поэтому там свой маршрут.
   */
  createForStudents: (data: {
    students: string[]
    text: string
    attachment?: File | null
    dueAt?: string | null
  }) => {
    const form = new FormData()
    data.students.forEach((id) => form.append('students', id))
    form.append('text', data.text)
    if (data.dueAt) form.append('due_at', data.dueAt)
    if (data.attachment) form.append('attachment', data.attachment)
    return http.post<Homework>('/homework/', form)
  },
  forLesson: (lessonId: string) => http.get<Paginated<Homework>>(`/lessons/${lessonId}/homework/`),
  create: (lessonId: string, data: { text: string; attachment?: File | null; dueAt?: string | null }) => {
    const form = new FormData()
    form.append('text', data.text)
    if (data.attachment) form.append('attachment', data.attachment)
    if (data.dueAt) form.append('due_at', data.dueAt)
    return http.post<Homework>(`/lessons/${lessonId}/homework/`, form)
  },
  get: (id: string) => http.get<Homework>(`/homework/${id}/`),
  update: (id: string, data: { text?: string; dueAt?: string | null }) =>
    http.patch<Homework>(`/homework/${id}/`, data),
  remove: (id: string) => http.delete(`/homework/${id}/`),

  /** Отметка ученика: «я сделал». Приёмка — отдельное действие преподавателя */
  setDone: (id: string, done: boolean) => http.post<Homework>(`/homework/${id}/done/`, { done }),

  /** Преподаватель принимает работу (можно с оценкой) или просит поправки */
  review: (id: string, data: { student: string; accepted: boolean; grade?: number | null }) =>
    http.post<Homework>(`/homework/${id}/review/`, data),

  /**
   * Ветка обсуждения по паре «задание + ученик». Ученик всегда попадает
   * в свою — параметр нужен только преподавателю, чтобы выбрать, с кем говорит.
   */
  messages: (id: string, student?: string) =>
    http.get<HomeworkMessage[]>(`/homework/${id}/messages/`, {
      params: student ? { student } : undefined,
    }),
  sendMessage: (id: string, data: { text: string; attachment?: File | null; student?: string }) => {
    const form = new FormData()
    form.append('text', data.text)
    if (data.attachment) form.append('attachment', data.attachment)
    if (data.student) form.append('student', data.student)
    return http.post<HomeworkMessage>(`/homework/${id}/messages/`, form)
  },
}
