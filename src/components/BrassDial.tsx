import type { ReactNode } from 'react'
import RadarGrid from './RadarSweep'

// round brass porthole with a degree bezel; children render inside the glass
export default function BrassDial({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="dial" role="group" aria-label={label}>
      <div className="dial-glass">
        {children}
        <RadarGrid className="dial-grid" />
      </div>
      <svg className="dial-svg" viewBox="-100 -100 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="brassG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e2c58f" />
            <stop offset="0.5" stopColor="#b8935a" />
            <stop offset="1" stopColor="#6b5330" />
          </linearGradient>
        </defs>
        <circle r="97" fill="none" stroke="url(#brassG)" strokeWidth="6" />
        <circle r="91.5" fill="none" stroke="var(--rebecca)" strokeWidth="5" />
        <circle r="86" fill="none" stroke="#0b0514" strokeWidth="6" />
        {Array.from({ length: 72 }, (_, i) => (
          <line key={i} x1="0" y1="-100" x2="0" y2={i % 6 === 0 ? -95 : -97.5} transform={`rotate(${i * 5})`} stroke="#2a1a3a" strokeWidth={i % 6 === 0 ? 1.4 : 0.7} />
        ))}
        {[0, 90, 180, 270].map((a) => (
          <circle key={a} r="3" cy="-91.5" transform={`rotate(${a})`} fill="url(#brassG)" stroke="#2a1a3a" strokeWidth="0.8" />
        ))}
        <path d="M0,-84 l-4,-7 h8 z" fill="var(--lavender)" />
        <text y="-77" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="7" fill="var(--lavender)">N</text>
      </svg>
    </div>
  )
}