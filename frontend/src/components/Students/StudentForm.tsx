import { useState, FormEvent } from 'react'
import { Field } from '@/components/UI/Field'
import { Icon } from '@/components/UI/icons'
import { isPhoneComplete, maskPhone } from '@/utils/phone'
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
  const [phone, setPhone] = useState(maskPhone(initial?.phone ?? ''))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        firstName,
        lastName,
        alias,
        // Поле рисует код страны само, поэтому пустым оно не бывает —
        // отправляем номер, только когда он действительно набран
        phone: isPhoneComplete(phone) ? phone : '',
        ...(password ? { password } : {}),
      })
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } }).response?.data
      const first = detail && Object.values(detail)[0]
      setError(Array.isArray(first) ? first[0] : first || 'Не удалось сохранить.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Field label="Имя" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Лиза" autoFocus />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Фамилия" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ким" />
        </div>
      </div>

      <Field
        label="Псевдоним"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Как показывать в списке"
      />

      <Field
        label="Телефон"
        icon="smartphone"
        numeric
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(maskPhone(e.target.value))}
        placeholder="+7 999 000-00-00"
      />

      <Field
        label="Пароль"
        type="password"
        icon="lock"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={initial ? 'Не менять' : 'Ученик задаст сам по ссылке'}
      />

      {!initial && (
        <div style={{
          display: 'flex',
          gap: 'var(--space-5)',
          padding: 'var(--space-5) var(--space-6)',
          background: 'var(--surface-brand-soft)',
          border: 'var(--border-width) solid var(--sky-100)',
          borderRadius: 'var(--radius-control)',
          color: 'var(--sky-700)',
        }}>
          <Icon name="info" size={18} />
          <span style={{ flex: 1, font: 'var(--type-caption)', textWrap: 'pretty' }}>
            После создания покажем ссылку и QR — ученик заполнит данные и задаст пароль сам.
          </span>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="dialog__actions">
        {onCancel && (
          <button type="button" className="btn-ghost btn-md" onClick={onCancel}>Отмена</button>
        )}
        <button type="submit" className="btn-primary btn-md" disabled={saving}>
          {saving ? 'Сохранение...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
