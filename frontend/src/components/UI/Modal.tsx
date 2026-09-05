import { useEffect, type ReactNode } from 'react'
import { Icon } from './icons'

interface Props {
  title: string
  /** Строка под заголовком: чем это окно поможет и что необязательно заполнять */
  description?: string
  onClose: () => void
  children: ReactNode
  width?: number
}

/** Окно из макета: заголовок с пояснением, крестик в углу и прокрутка тела. */
export function Modal({ title, description, onClose, children, width = 460 }: Props) {
  // Escape закрывает окно: тянуться мышью к крестику ради отмены не нужно
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog" onClick={onClose}>
      <div
        className="dialog__window"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__head">
          <h3 className="dialog__title">{title}</h3>
          {description && <p className="dialog__desc">{description}</p>}
          <button className="icon-button dialog__close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  )
}
