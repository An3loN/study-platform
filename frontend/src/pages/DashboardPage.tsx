import { useAuthStore } from '@/store/authStore'
import { TeacherDashboard } from './TeacherDashboard'
import { StudentDashboard } from './StudentDashboard'

/** Главная разная у преподавателя и ученика. */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  if (!user) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-secondary)' }}>Загрузка...</div>
    )
  }

  return user.role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />
}
