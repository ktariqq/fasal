const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']

interface RingProps { r: number; w: number; step: number; long: number; speed: number; reverse?: boolean; color: string; numerals?: boolean; studs?: boolean }

function Ring({ r, w, step, long, speed, reverse, color, numerals, studs }: RingProps) {
  const angles = Array.from({ length: 360 / step }, (_, i) => i * step)
  return (
    <g className="spin" style={{ animationDuration: `${speed}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
      <circle r={r} fill="none" stroke={color} strokeWidth={w} />
      <circle r={r - 24} fill="none" stroke={color} strokeWidth="1" opacity="0.7" />
      {angles.map((a) => (
        <line key={a} x1="0" y1={-(r - 24)} x2="0" y2={-(r - 24) - (a % long === 0 ? 22 : 11)} transform={`rotate(${a})`} stroke={color} strokeWidth={a % long === 0 ? 2 : 1} />
      ))}
      {numerals && ROMAN.map((t, i) => (
        <text key={t} transform={`rotate(${i * 30}) translate(0 ${-(r - 52)})`} textAnchor="middle" dominantBaseline="middle" fill={color} fontFamily="Cinzel, serif" fontSize="22">{t}</text>
      ))}
      {studs && Array.from({ length: 8 }, (_, i) => <circle key={i} r="6" cy={-r} transform={`rotate(${i * 45})`} fill="var(--brass)" stroke="var(--ink)" />)}
    </g>
  )
}

const orbit = (rx: number, ry: number) => `M ${rx} 0 A ${rx} ${ry} 0 1 1 ${-rx} 0 A ${rx} ${ry} 0 1 1 ${rx} 0`

function Orbit({ rx, ry, tilt, dur, reduced }: { rx: number; ry: number; tilt: number; dur: number; reduced: boolean }) {
  return (
    <g transform={`rotate(${tilt})`}>
      <ellipse rx={rx} ry={ry} fill="none" stroke="var(--lavender)" strokeWidth="1" opacity="0.35" />
      <circle r="5" cx={reduced ? rx : 0} cy="0" fill="var(--brass)" stroke="var(--ink)">
        {!reduced && <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={orbit(rx, ry)} />}
      </circle>
    </g>
  )
}

export default function ArmillaryRings({ reduced }: { reduced: boolean }) {
  return (
    <svg viewBox="-500 -500 1000 1000" aria-hidden="true">
      <Orbit rx={455} ry={150} tilt={-22} dur={38} reduced={reduced} />
      <Orbit rx={435} ry={115} tilt={38} dur={54} reduced={reduced} />
      <Ring r={470} w={2} step={5} long={30} speed={300} color="var(--brass)" numerals />
      <Ring r={395} w={7} step={10} long={30} speed={200} reverse color="var(--rebecca)" />
      <circle r="395" fill="none" stroke="var(--amethyst)" strokeWidth="1" opacity="0.8" />
      <Ring r={325} w={3} step={15} long={45} speed={140} color="var(--brass-dim)" studs />
      <path d="M0,-492 L10,-474 L-10,-474 Z" fill="var(--brass)" />
    </svg>
  )
}