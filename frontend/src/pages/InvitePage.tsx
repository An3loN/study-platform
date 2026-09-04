import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { AuthPage } from '@/components/UI/AuthPage'
import { Field } from '@/components/UI/Field'
import { initials } from '@/components/UI/icons'
import { invitesApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { InviteInfo } from '@/types'
import { isPhoneComplete, maskPhone } from '@/utils/phone'

const GLYPHS = [
  { char: '÷', size: 104, top: '11%', left: '14%' },
  { char: '∞', size: 120, bottom: '12%', left: '12%' },
  { char: '≠', size: 92, top: '15%', right: '13%' },
]

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
  const [phone, setPhone] = useState(maskPhone(''))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
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
        setPhone(maskPhone(data.phone ?? ''))
      })
      .catch((err) => {
        // Истёкшее приглашение отвечает 410 с пояснением — показываем именно
        // его, иначе человек решит, что ошибся адресом
        setLoadError((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '')
        setInvite(null)
      })
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token) return
    if (!isPhoneComplete(phone)) {
      setError('Введите номер телефона целиком — по нему будешь входить.')
      return
    }
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
    return (
      <AuthPage>
        <div className="auth-card"><p className="auth-lead">Загрузка...</p></div>
      </AuthPage>
    )
  }

  if (!invite) {
    return (
      <AuthPage glyphs={GLYPHS}>
        <div className="auth-card">
          <div className="auth-head">
            <span className="auth-brand">Мати</span>
            <h1 className="auth-title">Ссылка не работает</h1>
          </div>
          <p className="auth-lead">
            {loadError || 'Ссылка недействительна. Попроси преподавателя прислать новую.'}
          </p>
        </div>
      </AuthPage>
    )
  }

  if (invite.isAccepted) {
    return (
      <AuthPage glyphs={GLYPHS}>
        <div className="auth-card">
          <div className="auth-head">
            <span className="auth-brand">Мати</span>
            <h1 className="auth-title">Ссылка уже использована</h1>
            <p className="auth-lead">Она одноразовая — дальше вход по телефону.</p>
          </div>
          <Link to="/login">
            <button type="button" className="btn-primary btn-lg" style={{ width: '100%' }}>
              Войти по телефону
            </button>
          </Link>
        </div>
      </AuthPage>
    )
  }

  return (
    <AuthPage glyphs={GLYPHS}>
      <div className="auth-card auth-card--wide">
        <div className="auth-head">
          <span className="auth-brand">Мати</span>
          <h1 className="auth-title">Регистрация</h1>
          {invite.teacherName ? (
            <div className="auth-teacher">
              <span className="auth-teacher__avatar">{initials(invite.teacherName)}</span>
              <p className="auth-lead" style={{ color: 'var(--ink-700)' }}>
                Приглашение от преподавателя: {invite.teacherName}
              </p>
            </div>
          ) : (
            <p className="auth-lead">Приглашение на занятия.</p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="auth-fields">
            <div className="auth-fields__row">
              <Field
                label="Имя"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoFocus
              />
              <Field
                label="Фамилия"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            <Field
              label="Псевдоним"
              placeholder="Как к тебе обращаться"
              hint="Так тебя будут называть на уроках."
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
            />
            <Field
              label="Телефон"
              icon="smartphone"
              numeric
              inputMode="tel"
              autoComplete="username"
              value={phone}
              onChange={(event) => setPhone(maskPhone(event.target.value))}
            />
            <Field
              label="Пароль"
              type="password"
              placeholder="••••••••"
              hint="Не короче 8 символов."
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <div className="auth-actions">
            {error && <p className="field__error" style={{ textAlign: 'center' }}>{error}</p>}
            <button type="submit" className="btn-primary btn-lg" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Сохранение...' : 'Готово'}
            </button>
            <p className="auth-caption">Ссылка одноразовая: после регистрации входи по телефону.</p>
          </div>
        </form>
      </div>
    </AuthPage>
  )
}
