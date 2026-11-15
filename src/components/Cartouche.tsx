import type { CSSProperties, ReactNode } from 'react'

const Corner = ({ cls }: { cls: string }) => (
  <svg className={`corner ${cls}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 22 V8 Q2 2 8 2 H22 M7 17 V9 Q7 7 9 7 H17" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="3.5" cy="3.5" r="1.8" fill="currentColor" />
  </svg>
)

interface Props { title: string; titleUr?: string; lines?: string[]; style?: CSSProperties; className?: string; children?: ReactNode }

export default function Cartouche({ title, titleUr, lines = [], style, className = '', children }: Props) {
  return (
    <div className={`cartouche ${className}`} style={style} role="group" aria-label={title}>
      <Corner cls="c-tl" />
      <Corner cls="c-tr" />
      <Corner cls="c-br" />
      <Corner cls="c-bl" />
      <h3>{title}</h3>
      {titleUr && <div className="ur" lang="ur" dir="rtl">{titleUr}</div>}
      {lines.map((l) => <p key={l}>{l}</p>)}
      {children}
    </div>
  )
}