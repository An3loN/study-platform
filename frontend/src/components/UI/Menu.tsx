import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  key: string
  label: string
  /** Опасное действие — отмена, удаление */
  danger?: boolean
  onSelect: () => void
}

interface Props {
  items: MenuItem[]
  /** Подпись кнопки для скринридеров */
  title?: string
}

/** Выпадающее меню действий: кнопка с многоточием и список под ней. */
export function Menu({ items, title = 'Действия' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Закрываем кликом мимо и по Escape — как любое меню
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div className="menu" ref={rootRef}>
      <button
        className="icon-button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {open && (
        <div className="menu__list" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Обёртка для строки списка: меню появляется у правого края. */
export function MenuRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
}
