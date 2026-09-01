import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      padding: 16,
    }}>
      <div className="card" style={{ width: 360, maxWidth: '100%' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: 'var(--color-primary)' }}>
          Study Platform
        </h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Телефон</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 999 000-00-00"
              autoComplete="username"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
          Ученики заходят по ссылке от преподавателя.
        </p>
      </div>
    </div>
  )
}
