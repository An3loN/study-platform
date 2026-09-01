import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface Props {
  children: React.ReactNode
}

export function Layout({ children }: Props) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow)',
      }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-primary)', textDecoration: 'none' }}>
          Study Platform
        </Link>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              {user.displayName}
              <span style={{
                marginLeft: 6,
                background: 'var(--color-bg)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-primary)',
              }}>
                {user.role === 'teacher' ? 'Преподаватель' : 'Студент'}
              </span>
            </span>
            <button onClick={handleLogout} className="btn-secondary" style={{ padding: '4px 12px' }}>
              Выйти
            </button>
          </div>
        )}
      </header>
      <main style={{ flex: 1, padding: 24 }}>
        {children}
      </main>
    </div>
  )
}
