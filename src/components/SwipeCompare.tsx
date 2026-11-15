import { useRef, useState, type KeyboardEvent } from 'react'
import { clamp } from '../lib/format'

interface Props { leftSrc: string; rightSrc: string; leftLabel: string; rightLabel: string }

// left = historical map (clipped), right = radar frame; both must cover the same extent
export default function SwipeCompare({ leftSrc, rightSrc, leftLabel, rightLabel }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(50)
  const setFrom = (x: number) => {
    const r = box.current!.getBoundingClientRect()
    setPos(clamp(((x - r.left) / r.width) * 100, 0, 100))
  }
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2
    const map: Record<string, number> = { ArrowLeft: pos - step, ArrowDown: pos - step, ArrowRight: pos + step, ArrowUp: pos + step, Home: 0, End: 100 }
    if (!(e.key in map)) return
    e.preventDefault()
    setPos(clamp(map[e.key], 0, 100))
  }
  const p = Math.round(pos)
  return (
    <div
      className="swipe"
      ref={box}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setFrom(e.clientX) }}
      onPointerMove={(e) => { if (e.buttons) setFrom(e.clientX) }}
    >
      <img className="sw-img" src={rightSrc} alt={rightLabel} draggable={false} />
      <img className="sw-img" src={leftSrc} alt={leftLabel} draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <span className="sw-tag sw-l">{leftLabel}</span>
      <span className="sw-tag sw-r">{rightLabel}</span>
      <div
        className="sw-handle"
        role="slider"
        tabIndex={0}
        aria-label="Swipe between the historical map and the radar frame. Left and right arrow keys move it; hold Shift for larger steps."
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
        aria-valuetext={`${p} percent historical map, ${100 - p} percent radar`}
        style={{ left: `${pos}%` }}
        onKeyDown={key}
      >
        <span className="sw-grip" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 6 L2 12 L8 18 M16 6 L22 12 L16 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
    </div>
  )
}