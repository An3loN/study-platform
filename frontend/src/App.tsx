import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PrivateRoute } from '@/components/UI/PrivateRoute'
import { LoginPage } from '@/pages/LoginPage'
import { InvitePage } from '@/pages/InvitePage'
import { GuestLessonPage } from '@/pages/GuestLessonPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { StudentDetailPage } from '@/pages/StudentDetailPage'
import { LessonPage } from '@/pages/LessonPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Регистрация ученика по ссылке от преподавателя */}
        <Route path="/invite/:token" element={<InvitePage />} />
        {/* Вход на урок по ссылке — без аккаунта */}
        <Route path="/j/:shareToken" element={<GuestLessonPage />} />

        <Route path="/" element={
          <PrivateRoute><DashboardPage /></PrivateRoute>
        } />
        <Route path="/students/:studentId" element={
          <PrivateRoute><StudentDetailPage /></PrivateRoute>
        } />
        <Route path="/lessons/:lessonId" element={
          <PrivateRoute><LessonPage /></PrivateRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
