import { useRef, type KeyboardEvent } from 'react'
import type { SiteEvent } from '../types/data'
import { clamp } from '../lib/format'

const STAR = '5,0.4 6.5,3.7 10,4 7.3,6.4 8.1,9.8 5,8 1.9,9.8 2.7,6.4 0,4 3.5,3.7'
const GEAR =
  Array.from({ length: 8 }, (_, i) => {
    const st = (Math.PI * 2) / 8
    const a = i * st
    const p = (x: number, r: number) => `${(5 + Math.cos(x) * r).toFixed(2)},${(5 + Math.sin(x) * r).toFixed(2)}`
    return `${i ? 'L' : 'M'}${p(a - st * 0.3, 3.7)} L${p(a - st * 0.16, 5)} L${p(a + st * 0.16, 5)} L${p(a + st * 0.3, 3.7)}`
  }).join(' ') + ' Z'
const DAY = 86400000

interface Props {
  dates: string[]
  idx: number
  events: SiteEvent[]
  valueText: string
  onChange: (i: number) => void
  onMarker: (e: SiteEvent) => void
}

// brass slider: ticks are acquisitions, stars are cultural dates, gears are detected signals (hypotheses)
export default function TimeScrubber({ dates, idx, events, valueText, onChange, onMarker }: Props) {
  const rail = useRef<HTMLDivElement>(null)
  const n = dates.length
  const t = dates.map((d) => Date.parse(d))
  const t0 = t[0]
  const t1 = t[n - 1]
  const span = Math.max(1, t1 - t0)
  const pct = (ms: number) => `${clamp(((ms - t0) / span) * 100, 0, 100).toFixed(3)}%`

  const months: { ms: number; label: string }[] = []
  const d0 = new Date(t0)
  let y = d0.getUTCFullYear()
  let m = d0.getUTCMonth() + 1
  for (let guard = 0; guard < 600; guard++) {
    const ms = Date.UTC(y, m, 1)
    if (ms > t1) break
    const d = new Date(ms)
    const mo = d.getUTCMonth()
    if (mo % 3 === 0 || span < 120 * DAY) {
      months.push({ ms, label: d.toLocaleDateString('en-GB', { month: 'short', year: mo === 0 ? '2-digit' : undefined, timeZone: 'UTC' }) })
    }
    m++
  }

  const setFrom = (x: number) => {
    const r = rail.current!.getBoundingClientRect()
    const target = t0 + clamp((x - r.left) / r.width, 0, 1) * span
    let best = 0
    let bd = Infinity
    t.forEach((v, k) => {
      const dd = Math.abs(v - target)
      if (dd < bd) { bd = dd; best = k }
    })
    onChange(best)
  }

  const key = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: idx + 1, ArrowUp: idx + 1, ArrowLeft: idx - 1, ArrowDown: idx - 1, PageUp: idx + 5, PageDown: idx - 5, Home: 0, End: n - 1 }
    if (!(e.key in map)) return
    e.preventDefault()
    onChange(clamp(map[e.key], 0, n - 1))
  }

  return (
    <div
      className="scrub"
      role="slider"
      tabIndex={0}
      aria-label="Acquisition date. Arrow keys step, Page Up and Page Down jump five."
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={idx}
      aria-valuetext={valueText}
      onKeyDown={key}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFrom(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons) setFrom(e.clientX) }}
    >
      <div className="rail" ref={rail}>
        {t.map((v, k) => <i key={k} className="tick" style={{ left: pct(v) }} />)}
        {months.map((mm) => (
          <span key={mm.ms}>
            <i className="tick month" style={{ left: pct(mm.ms) }} />
            <span className="month-label" style={{ left: pct(mm.ms) }}>{mm.label}</span>
          </span>
        ))}
        {events.map((e) => (
          <span
            key={e.id}
            className="mark"
            aria-hidden="true"
            title={`${e.label} (${e.type === 'cultural' ? 'cultural date' : 'detected signal, hypothesis'})`}
            style={{ left: pct(Date.parse(e.date)), top: e.type === 'cultural' ? -18 : 20 }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => onMarker(e)}
          >
            <svg viewBox="0 0 10 10" width="14" height="14">
              {e.type === 'cultural'
                ? <polygon points={STAR} fill="var(--amethyst)" stroke="var(--lavender)" strokeWidth="0.6" />
                : <path d={GEAR} fill="var(--brass)" stroke="#2a1a3a" strokeWidth="0.5" />}
            </svg>
          </span>
        ))}
        <span className="thumb" style={{ left: pct(t[idx]) }} />
      </div>
    </div>
  )
}