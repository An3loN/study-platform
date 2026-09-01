import { useState, FormEvent } from 'react'
import type { Student, StudentInput } from '@/types'

interface Props {
  initial?: Student
  submitLabel?: string
  onSubmit: (data: StudentInput) => Promise<void>
  onCancel?: () => void
}

/**
 * Все поля необязательные: преподаватель может завести пустую карточку
 * и отдать ссылку, а может заполнить всё сам.
 */
export function StudentForm({ initial, submitLabel = 'Создать', onSubmit, onCancel }: Props) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [lastName, setLastName] = useState(initial?.lastName ?? '')
  const [alias, setAlias] = useState(initial?.alias ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({ firstName, lastName, alias, phone, ...(password ? { password } : {}) })
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } }).response?.data
      const first = detail && Object.values(detail)[0]
      setError(Array.isArray(first) ? first[0] : first || 'Не удалось сохранить.')
    } finally {
      setSaving(false)
    }
  }

  return (
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
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Как показывать в списке" />
      </div>

      <div className="form-group">
        <label>Телефон</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 000-00-00" />
      </div>

      <div className="form-group">
        <label>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={initial ? 'Не менять' : 'Ученик задаст сам по ссылке'}
        />
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Сохранение...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>Отмена</button>
        )}
      </div>
    </form>
  )
}
