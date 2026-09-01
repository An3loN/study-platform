import { useEffect, useState, FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { invitesApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { InviteInfo } from '@/types'

/** Регистрация ученика по ссылке (или QR) от преподавателя. */
export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [alias, setAlias] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    invitesApi.info(token)
      .then(({ data }) => {
        setInvite(data)
        // Преподаватель мог заполнить часть полей заранее
        setFirstName(data.firstName)
        setLastName(data.lastName)
        setAlias(data.alias)
        setPhone(data.phone ?? '')
      })
      .catch(() => setInvite(null))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return
    setError('')
    setSaving(true)
    try {
      const { data } = await invitesApi.accept(token, { firstName, lastName, alias, phone, password })
      await setTokens(data.access, data.refresh)
      navigate('/')
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } }).response?.data
      const first = detail && Object.values(detail)[0]
      setError(Array.isArray(first) ? first[0] : first || 'Не удалось завершить регистрацию.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <CenteredCard><p style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</p></CenteredCard>
  }

  if (!invite) {
    return (
      <CenteredCard>
        <p>Ссылка недействительна. Попросите преподавателя прислать новую.</p>
      </CenteredCard>
    )
  }

  if (invite.isAccepted) {
    return (
      <CenteredCard>
        <p style={{ marginBottom: 12 }}>Эта ссылка уже использована.</p>
        <Link to="/login">Войти по телефону</Link>
      </CenteredCard>
    )
  }

  return (
    <CenteredCard>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--color-primary)' }}>
        Регистрация
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {invite.teacherName ? `Приглашение от преподавателя: ${invite.teacherName}` : 'Приглашение на занятия'}
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Имя</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Фамилия</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Псевдоним</label>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Как к вам обращаться" />
        </div>

        <div className="form-group">
          <label>Телефон</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 999 000-00-00"
            autoComplete="username"
            required
          />
        </div>

        <div className="form-group">
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={saving}>
          {saving ? 'Сохранение...' : 'Готово'}
        </button>
      </form>
    </CenteredCard>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: 16,
    }}>
      <div className="card" style={{ width: 400, maxWidth: '100%' }}>{children}</div>
    </div>
  )
}
