import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthPage } from '@/components/UI/AuthPage'
import { Field } from '@/components/UI/Field'
import { useAuthStore } from '@/store/authStore'
import { isPhoneComplete, maskPhone } from '@/utils/phone'

/** Знаки на клетчатом фоне — по макету, по углам от карточки */
const GLYPHS = [
  { char: 'π', size: 128, top: '12%', left: '11%' },
  { char: '√', size: 88, bottom: '13%', left: '18%' },
  { char: '∑', size: 96, top: '18%', right: '16%' },
  { char: '×', size: 112, bottom: '18%', right: '12%' },
]

export function LoginPage() {
  const [phone, setPhone] = useState(maskPhone(''))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    // В поле всегда стоит хотя бы «+7», поэтому пустоту ловит не required
    if (!isPhoneComplete(phone)) {
      setError('Введите номер телефона целиком.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(phone, password)
      navigate('/')
    } catch {
      setError('Неверный телефон или пароль.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthPage glyphs={GLYPHS}>
      <div className="auth-card">
        <div className="auth-head">
          <span className="auth-brand">Мати</span>
          <h1 className="auth-title">Вход</h1>
          <p className="auth-lead">По номеру телефона и паролю.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="auth-fields">
            <Field
              label="Телефон"
              icon="smartphone"
              numeric
              inputMode="tel"
              autoComplete="username"
              value={phone}
              onChange={(event) => setPhone(maskPhone(event.target.value))}
              autoFocus
            />
            <Field
              label="Пароль"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <div className="auth-actions">
            {error && <p className="field__error" style={{ textAlign: 'center' }}>{error}</p>}
            <button type="submit" className="btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
            <p className="auth-caption">Забыл пароль — попроси преподавателя сбросить его.</p>
          </div>
        </form>

        <p className="auth-note">Ученики заходят по ссылке от преподавателя.</p>
      </div>
    </AuthPage>
  )
}
