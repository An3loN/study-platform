interface Props {
  /** Имена тех, кто сейчас в комнате */
  names: string[]
  /** Своё имя — его кружок обводится отдельно */
  self?: string
  /** Имя преподавателя — его кружок в цветах «Неба» */
  teacher?: string
  /** Сколько кружков показать до счётчика «+N» */
  max?: number
}

/** «Кирилл Мохов» → «КМ», «Аня» → «А» */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/** Стопка аватарок участников урока — тот же состав, что рисует курсоры на доске. */
export function Avatars({ names, self, teacher, max = 3 }: Props) {
  if (names.length === 0) return null

  const shown = names.slice(0, max)
  const hidden = names.length - shown.length

  return (
    <div className="avatars">
      {shown.map((name) => {
        const isTeacher = teacher && name === teacher
        return (
          <div
            key={name}
            className={`avatars__item${self && name === self ? ' avatars__item--self' : ''}`}
            title={isTeacher ? `${name} — преподаватель` : name}
            style={isTeacher ? { background: 'var(--sky-100)', color: 'var(--sky-700)' } : undefined}
          >
            {initials(name)}
          </div>
        )
      })}
      {hidden > 0 && (
        <div className="avatars__item avatars__item--more" title={names.slice(max).join(', ')}>
          +{hidden}
        </div>
      )}
    </div>
  )
}
