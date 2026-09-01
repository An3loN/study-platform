export interface AuthUser {
  id: string
  username: string
  role: 'student' | 'teacher'
}

export interface ValidateAccessResponse {
  user: AuthUser
}

export interface YjsStateResponse {
  state: string | null
}

// Данные, прикреплённые к соединению после аутентификации
export interface ConnectionContext {
  user: AuthUser
}
