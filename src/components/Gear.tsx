const gearPath = (teeth: number, ro: number, ri: number) => {
  const st = (Math.PI * 2) / teeth
  const pt = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
  let d = ''
  for (let i = 0; i < teeth; i++) {
    const a = i * st
    d += `${i ? 'L' : 'M'}${pt(a - st * 0.3, ri)} L${pt(a - st * 0.16, ro)} L${pt(a + st * 0.16, ro)} L${pt(a + st * 0.3, ri)} `
  }
  return `${d}Z`
}

interface GearProps { cx: number; cy: number; r: number; teeth: number; speed: number; reverse?: boolean }

// one gear as an SVG group; place inside an <svg>
export default function Gear({ cx, cy, r, teeth, speed, reverse = false }: GearProps) {
  const ri = r - 9
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className="spin" style={{ animationDuration: `${speed}s`, animationDirection: reverse ? 'reverse' : 'normal' }}>
        <path d={gearPath(teeth, r, ri)} fill="rgba(184,147,90,0.10)" stroke="var(--brass)" strokeWidth="1.5" />
        <circle r={ri * 0.78} fill="none" stroke="var(--brass-dim)" strokeWidth="1.5" />
        {[0, 72, 144, 216, 288].map((a) => (
          <line key={a} x1="0" y1={-ri * 0.2} x2="0" y2={-ri * 0.78} transform={`rotate(${a})`} stroke="var(--brass)" strokeWidth="3" />
        ))}
        <circle r={ri * 0.16} fill="var(--brass)" />
        <circle r={ri * 0.06} fill="var(--void)" />
      </g>
    </g>
  )
}

// three meshing gears for the corner of the opening
export function GearTrain({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 360 340" aria-hidden="true">
      <Gear cx={150} cy={150} r={100} teeth={20} speed={40} />
      <Gear cx={282} cy={74} r={60} teeth={12} speed={24} reverse />
      <Gear cx={219} cy={269} r={45} teeth={9} speed={18} reverse />
    </svg>
  )
}