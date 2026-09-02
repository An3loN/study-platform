import { useEffect, useState, type ReactNode } from 'react'

export interface SidebarTab {
  key: string
  label: string
  /** Иконка в корешке и в заголовке панели */
  icon?: ReactNode
  /** Число рядом с названием — например, количество заданий */
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

/**
 * Панель урока лежит НАД доской, а не отбирает у неё ширину: доска — главное,
 * а заметки и ДЗ открывают на минуту. Свёрнутая панель остаётся узкими
 * корешками у правого края, открытая — стеклянной карточкой поверх холста.
 */
export function LessonSidebar({ tabs, storageKey = 'lesson_sidebar', onVisibleTabChange }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const saved = localStorage.getItem(storageKey)
    return saved && tabs.some((tab) => tab.key === saved) ? saved : null
  })

  const active = tabs.find((tab) => tab.key === openKey) ?? null

  useEffect(() => {
    localStorage.setItem(storageKey, active?.key ?? '')
  }, [active?.key, storageKey])

  useEffect(() => {
    onVisibleTabChange?.(active?.key ?? null)
  }, [active?.key, onVisibleTabChange])

  // Корешки закрытых вкладок стоят у края, а при открытой панели — слева от неё
  const railTabs = tabs.filter((tab) => tab.key !== active?.key)

  return (
    <>
      {railTabs.length > 0 && (
        <div className="side-rail" style={active ? { right: 392 } : undefined}>
          {railTabs.map((tab) => (
            <button
              key={tab.key}
              className="side-rail__tab"
              title={tab.label}
              onClick={() => setOpenKey(tab.key)}
            >
              {tab.icon}
              <span className="side-rail__label">{tab.label}</span>
              {!!tab.badge && <span className="side-rail__dot" />}
            </button>
          ))}
        </div>
      )}

      {active && (
        <aside className="side-panel">
          <div className="side-panel__head">
            {active.icon}
            <span>{active.label}</span>
            {!!active.badge && <span className="side-panel__count">{active.badge}</span>}
            <button className="side-panel__close" title="Закрыть" onClick={() => setOpenKey(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div className="side-panel__body">{active.render()}</div>
        </aside>
      )}
    </>
  )
}
