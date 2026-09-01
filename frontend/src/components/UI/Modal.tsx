import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

export function Modal({ title, onClose, children, width = 420 }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '2px 10px', border: 'none', fontSize: 18, lineHeight: 1.2 }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
