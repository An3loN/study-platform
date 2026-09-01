import { useState } from 'react'

interface Props {
  /** Готовая ссылка, которую копируют и кодируют в QR */
  url: string
  /** Адрес QR-картинки на бэкенде */
  qrUrl: string
  hint?: string
}

/** Ссылка + QR с ней же: приглашение ученика и вход на урок устроены одинаково. */
export function ShareBlock({ url, qrUrl, hint }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API недоступен (http на телефоне) — пользователь скопирует руками
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <img
        src={qrUrl}
        alt="QR-код со ссылкой"
        width={132}
        height={132}
        style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: '#fff' }}
      />
      <div style={{ flex: 1, minWidth: 220 }}>
        {hint && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{hint}</p>
        )}
        <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ marginBottom: 8 }} />
        <button className="btn-secondary" onClick={copy} style={{ width: '100%' }}>
          {copied ? 'Скопировано' : 'Скопировать ссылку'}
        </button>
      </div>
    </div>
  )
}
