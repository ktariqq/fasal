export default function CompassRose({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="-110 -110 220 220" aria-hidden="true">
      <circle r="76" fill="none" stroke="var(--brass)" strokeWidth="1.5" />
      <circle r="68" fill="none" stroke="var(--brass-dim)" strokeWidth="1" />
      {[45, 135, 225, 315].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0,0 L-6,-6 L0,-58 Z" fill="var(--brass-dim)" />
          <path d="M0,0 L6,-6 L0,-58 Z" fill="var(--brass)" opacity="0.7" />
        </g>
      ))}
      {[0, 90, 180, 270].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0,0 L-9,-9 L0,-96 Z" fill="var(--brass-dim)" />
          <path d="M0,0 L9,-9 L0,-96 Z" fill="var(--brass)" />
        </g>
      ))}
      <circle r="5" fill="var(--rebecca)" stroke="var(--brass)" />
      {[['N', 0, -100], ['E', 100, 0], ['S', 0, 100], ['W', -100, 0]].map(([t, x, y]) => (
        <text key={t as string} x={x as number} y={y as number} textAnchor="middle" dominantBaseline="middle" fill="var(--lavender)" fontFamily="Cinzel, serif" fontSize="14">{t}</text>
      ))}
    </svg>
  )
}