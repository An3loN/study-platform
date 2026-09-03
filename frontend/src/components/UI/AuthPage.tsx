import type { ReactNode } from 'react'

interface Glyph {
  char: string
  size: number
  top?: string
  bottom?: string
  left?: string
  right?: string
}

/**
 * Экран входа: клетчатый лист с карточкой посередине.
 *
 * Математические знаки по углам — единственное украшение; они очень светлые
 * и на узком экране убираются совсем, чтобы не толкаться с карточкой.
 */
export function AuthPage({ glyphs = [], children }: { glyphs?: Glyph[]; children: ReactNode }) {
  return (
    <div className="auth-page">
      {glyphs.map((glyph) => (
        <span
          key={glyph.char}
          className="auth-glyph"
          aria-hidden="true"
          style={{
            fontSize: glyph.size,
            top: glyph.top,
            bottom: glyph.bottom,
            left: glyph.left,
            right: glyph.right,
          }}
        >
          {glyph.char}
        </span>
      ))}
      {children}
    </div>
  )
}
