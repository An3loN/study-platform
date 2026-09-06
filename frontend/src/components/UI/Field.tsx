import { useId, type InputHTMLAttributes } from 'react'
import { Icon, type IconName } from './icons'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Пустая подпись — когда поле стоит под общим заголовком блока */
  label: string
  /** Подсказка под полем. Ошибка её перебивает: одновременно они только шумят */
  hint?: string
  error?: string
  icon?: IconName
  /** Номера и коды набираются моноширинным — цифры так не пляшут */
  numeric?: boolean
}

/**
 * Поле формы из макета: подпись, рамка с иконкой и подсказка под ней.
 *
 * Рамку и отступы держит обёртка, а не сам `input`, — иначе иконку внутрь не
 * поставить. Фокус подсвечивает всю обёртку через `:focus-within`.
 */
export function Field({ label, hint, error, icon, numeric, className, ...rest }: Props) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className={`field__box${error ? ' field__box--error' : ''}${numeric ? ' field__box--numeric' : ''}`}>
        {icon && <span className="field__icon"><Icon name={icon} size={18} /></span>}
        <input id={id} className={className} {...rest} />
      </div>
      {error
        ? <span className="field__error">{error}</span>
        : hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}
