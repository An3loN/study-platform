import { useEffect, useState, type ReactNode } from 'react'

export interface SidebarTab {
  key: string
  label: string
  /** Число рядом с названием (например, непрочитанные сообщения) */
  badge?: number
  render: () => ReactNode
}

interface Props {
  tabs: SidebarTab[]
  /** Ключ в localStorage, чтобы состояние панели пережило перезагрузку */
  storageKey?: string
  /** Что сейчас видно: ключ вкладки или null, когда панель свёрнута */
  onVisibleTabChange?: (key: string | null) => void
}

const WIDTH_OPEN = 320
const WIDTH_CLOSED = 40

/** Боковая панель урока: сворачивается, чтобы отдать место доске. */
export function LessonSidebar({ tabs, storageKey = 'lesson_sidebar', onVisibleTabChange }: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== 'closed')
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? '')

  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0]

  useEffect(() => {
    localStorage.setItem(storageKey, open ? 'open' : 'closed')
  }, [open, storageKey])

  useEffect(() => {
    onVisibleTabChange?.(open ? active?.key ?? null : null)
  }, [open, active?.key, onVisibleTabChange])

  const show = (key: string) => {
    setActiveKey(key)
    setOpen(true)
  }

  if (!open) {
    return (
      <aside style={{
        width: WIDTH_CLOSED,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 0',
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
      }}>
        <button
          onClick={() => setOpen(true)}
          title="Показать панель"
          className="btn-secondary"
          style={{ padding: '4px 8px', border: 'none', fontSize: 14 }}
        >
          ‹
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => show(tab.key)}
            title={tab.label}
            style={{
              background: 'transparent',
              padding: '10px 2px',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              writingMode: 'vertical-rl',
              position: 'relative',
            }}
          >
            {tab.label}
            {!!tab.badge && (
              <span style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--color-danger)',
              }} />
            )}
          </button>
        ))}
      </aside>
    )
  }

  return (
    <aside style={{
      width: WIDTH_OPEN,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-surface)',
      borderLeft: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveKey(tab.key)}
            style={{
              flex: 1,
              padding: '10px 6px',
              fontSize: 13,
              fontWeight: active?.key === tab.key ? 600 : 400,
              background: 'transparent',
              borderRadius: 0,
              borderBottom: `2px solid ${active?.key === tab.key ? 'var(--color-primary)' : 'transparent'}`,
              color: active?.key === tab.key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {tab.label}
            {!!tab.badge && (
              <span style={{
                marginLeft: 4,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-danger)',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setOpen(false)}
          title="Свернуть панель"
          style={{
            background: 'transparent',
            padding: '10px 10px',
            borderRadius: 0,
            color: 'var(--color-text-secondary)',
            fontSize: 14,
          }}
        >
          ›
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {active?.render()}
      </div>
    </aside>
  )
}
