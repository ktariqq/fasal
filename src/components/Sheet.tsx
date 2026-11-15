import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props { open: boolean; title: string; onClose: () => void; children: ReactNode }

// non-modal side drawer: Esc closes it, focus moves in on open and returns to the opener on close
export default function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null)
  const cb = useRef(onClose)
  cb.current = onClose
  const id = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cb.current() }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); prev?.focus?.() }
  }, [open])
  if (!open) return null
  return (
    <aside ref={ref} className="sheet" role="dialog" aria-modal="false" aria-labelledby={id}>
      <header className="sheet-head">
        <h2 id={id}>{title}</h2>
        <button className="btn" onClick={onClose} aria-label={`Close ${title}`}>Close</button>
      </header>
      <div className="sheet-body">{children}</div>
    </aside>
  )
}