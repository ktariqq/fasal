// canvas helper: a PPI-style sweep with a fading purple trail, clipped to the globe disc
export function drawSweep(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, a: number, trail = 1.5) {
  g.save()
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.clip()
  const n = 32
  const st = trail / n
  for (let i = 0; i < n; i++) {
    g.beginPath()
    g.moveTo(cx, cy)
    g.arc(cx, cy, R, a - (i + 1) * st, a - i * st)
    g.closePath()
    g.fillStyle = `rgba(139,95,191,${0.5 * (1 - i / n) ** 2})`
    g.fill()
  }
  g.strokeStyle = 'rgba(233,222,250,.9)'
  g.lineWidth = 1.5
  g.shadowColor = 'rgba(139,95,191,.9)'
  g.shadowBlur = 14
  g.beginPath()
  g.moveTo(cx, cy)
  g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
  g.stroke()
  g.restore()
}

// SVG range rings and crosshair; reused around the radar frame in the site view
export default function RadarGrid({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="-100 -100 200 200" aria-hidden="true">
      {[33, 66, 99].map((r) => <circle key={r} r={r} fill="none" stroke="var(--lavender)" strokeWidth="0.4" strokeDasharray="2 3" opacity="0.5" />)}
      <line x1="-100" y1="0" x2="100" y2="0" stroke="var(--lavender)" strokeWidth="0.4" opacity="0.5" />
      <line x1="0" y1="-100" x2="0" y2="100" stroke="var(--lavender)" strokeWidth="0.4" opacity="0.5" />
      {Array.from({ length: 36 }, (_, i) => <line key={i} x1="0" y1="-99" x2="0" y2={i % 3 === 0 ? -94 : -96.5} transform={`rotate(${i * 10})`} stroke="var(--brass)" strokeWidth="0.5" />)}
    </svg>
  )
}