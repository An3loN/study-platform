import axios from 'axios'
import type {
  User, Student, StudentInput, Lesson, LessonDetail, LessonInput, LessonShare,
  GuestSession, Homework, InviteInfo, Paginated,
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

// Авто-рефреш при 401
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }
      try {
        const { data } = await axios.post('/api/auth/refresh/', { refresh })
        localStorage.setItem('access_token', data.access)
        if (data.refresh) localStorage.setItem('refresh_token', data.refresh)

        // Держим store в актуальном состоянии: доска и чат берут токен именно оттуда,
        // иначе после рефреша они переподключатся с протухшим токеном.
        // Динамический импорт — чтобы не было циклической зависимости store ↔ api.
        const { useAuthStore } = await import('@/store/authStore')
        useAuthStore.setState({
          accessToken: data.access,
          ...(data.refresh ? { refreshToken: data.refresh } : {}),
        })

        original.headers.Authorization = `Bearer ${data.access}`
        return http(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

// ── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (phone: string, password: string) =>
    http.post<{ access: string; refresh: string }>('/auth/login/', { phone, password }),

  me: () => http.get<User>('/auth/me/'),
}

// ── Ученики ──────────────────────────────────────────────────────────────────

export const studentsApi = {
  list: () => http.get<Paginated<Student>>('/students/'),
  get: (id: string) => http.get<Student>(`/students/${id}/`),
  create: (data: StudentInput) => http.post<Student>('/students/', data),
  update: (id: string, data: StudentInput) => http.patch<Student>(`/students/${id}/`, data),
  remove: (id: string) => http.delete(`/students/${id}/`),
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
  list: (params?: { upcoming?: boolean; past?: boolean; student?: string }) =>
    http.get<Paginated<Lesson>>('/lessons/', {
      params: {
        ...(params?.upcoming ? { upcoming: 1 } : {}),
        ...(params?.past ? { past: 1 } : {}),
        ...(params?.student ? { student: params.student } : {}),
      },
    }),
  get: (id: string) => http.get<LessonDetail>(`/lessons/${id}/`),
  create: (data: LessonInput) => http.post<LessonDetail>('/lessons/', data),
  update: (id: string, data: LessonInput) => http.patch<LessonDetail>(`/lessons/${id}/`, data),
  remove: (id: string) => http.delete(`/lessons/${id}/`),
  shareQrUrl: (shareToken: string) => `/api/lessons/share/${shareToken}/qr.svg`,

  // Вход по ссылке — без аккаунта
  shareInfo: (shareToken: string) =>
    axios.get<LessonShare>(`/api/lessons/share/${shareToken}/`).then(camelize),
  join: (shareToken: string, name: string) =>
    axios.post(`/api/lessons/share/${shareToken}/join/`, { name }).then(camelize<GuestSession>),
}

// ── Домашние задания ─────────────────────────────────────────────────────────

export const homeworkApi = {
  my: () => http.get<Paginated<Homework>>('/homework/'),
  forLesson: (lessonId: string) => http.get<Paginated<Homework>>(`/lessons/${lessonId}/homework/`),
  create: (lessonId: string, data: { text: string; attachment?: File | null }) => {
    const form = new FormData()
    form.append('text', data.text)
    if (data.attachment) form.append('attachment', data.attachment)
    return http.post<Homework>(`/lessons/${lessonId}/homework/`, form)
  },
  update: (id: string, data: { text: string }) => http.patch<Homework>(`/homework/${id}/`, data),
  remove: (id: string) => http.delete(`/homework/${id}/`),
  setDone: (id: string, done: boolean) => http.post<Homework>(`/homework/${id}/done/`, { done }),
}
