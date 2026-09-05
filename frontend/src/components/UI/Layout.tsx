import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Icon, initials } from './icons'

interface Props {
  children: React.ReactNode
}

/**
 * Оболочка страниц под макет: стеклянная шапка с логотипом и карточкой
 * пользователя. Навигации в ней нет — разделы «Уроки», «Задания» и «Ученики»
 * живут блоками на самой главной, отдельных страниц для них пока не заведено.
 */
export function Layout({ children }: Props) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="app-header">
        <Link to="/" className="app-header__brand">Мати</Link>

        {user && (
          <div className="app-header__side">
            <div className="app-user">
              <span className="avatar">{initials(user.displayName)}</span>
              <span className="app-user__text">
                <span className="app-user__name">{user.displayName}</span>
                <span className="app-user__role">
                  {user.role === 'teacher' ? 'Преподаватель' : 'Ученик'}
                </span>
              </span>
            </div>
            <span className="app-header__divider" />
            <button className="btn-ghost btn-sm btn-row" onClick={handleLogout}>
              <Icon name="logout" size={16} />
              Выйти
            </button>
          </div>
        )}
      </header>

      <main style={{ flex: 1 }}>{children}</main>
    </div>
  )
}
