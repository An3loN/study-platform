import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/UI/Modal'
import { lessonsApi } from '@/services/api'
import type { Lesson } from '@/types'
import { formatDateTime, lessonTitle } from '@/utils/format'

interface Props {
  lesson: Lesson
  onClose: () => void
  onCancelled: () => void
}

/**
 * Отмена урока. Причина обязательна: её увидит вторая сторона, и «урок отменён»
 * без объяснения — худшее, что можно прислать человеку, который освободил время.
 */
export function CancelLessonModal({ lesson, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) return
    setError('')
    setSaving(true)
    try {
      await lessonsApi.cancel(lesson.id, reason.trim())
      onCancelled()
      onClose()
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail || 'Не удалось отменить урок.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Отменить урок" onClose={onClose}>
      <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--ink-600)' }}>
        {lessonTitle(lesson)} · {formatDateTime(lesson.scheduledAt)}
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Причина отмены</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Её увидит вторая сторона"
            autoFocus
            required
          />
        </div>

        {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="header-button" onClick={onClose}>Не отменять</button>
          <button type="submit" className="btn-danger" disabled={saving || !reason.trim()}>
            {saving ? 'Отмена...' : 'Отменить урок'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
