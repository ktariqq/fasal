import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Series, SiteEvent } from '../types/data'

interface Props {
  series: Series
  pol: string
  events: SiteEvent[]
  idx?: number
  onPick?: (i: number) => void
  height?: number
  theme?: 'dark' | 'ink'
  showAll?: boolean
}

const tick = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })

// backscatter median (solid) and interquartile band for one polarization; other polarizations are dashed
export default function RhythmChart({ series, pol, events, idx, onPick, height = 260, theme = 'dark', showAll = true }: Props) {
  const dark = theme === 'dark'
  const text = dark ? '#c8b2e8' : '#2a1a3a'
  const grid = dark ? 'rgba(200,178,232,0.18)' : 'rgba(42,26,58,0.2)'
  const main = dark ? '#8b5fbf' : '#663399'
  const s = series.series[pol] ?? series.series[series.polarizations[0]]
  const pols = Object.keys(series.series)
  const rows = series.dates.map((d, k) => {
    const r: Record<string, number | number[]> = { t: Date.parse(d), band: [s.q25[k], s.q75[k]] }
    for (const p of pols) r[`${p}_m`] = series.series[p].median[k]
    return r
  })
  const lo = Math.floor(Math.min(...s.q25) - 1)
  const hi = Math.ceil(Math.max(...s.q75) + 1)
  const pick = (st: any) => {
    if (!onPick || st?.activeLabel == null) return
    const t = Number(st.activeLabel)
    let best = 0
    let bd = Infinity
    series.dates.forEach((d, k) => {
      const v = Math.abs(Date.parse(d) - t)
      if (v < bd) { bd = v; best = k }
    })
    onPick(best)
  }
  const label = `Backscatter ${pol} median ranges from ${Math.min(...s.median).toFixed(1)} to ${Math.max(...s.median).toFixed(1)} dB across ${series.dates.length} acquisitions. Sensor: ${series.sensor}.`

  return (
    <div role="img" aria-label={label} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} onClick={pick}>
          <CartesianGrid stroke={grid} strokeDasharray="3 5" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke={text} tick={{ fill: text, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} minTickGap={28} />
          <YAxis domain={[lo, hi]} width={40} stroke={text} tick={{ fill: text, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} />
          <Tooltip content={() => null} cursor={{ stroke: text, strokeDasharray: '3 3' }} />
          {events.filter((e) => e.type === 'cultural').map((e) => (
            <ReferenceLine key={e.id} x={Date.parse(e.date)} stroke="#b8935a" strokeDasharray="2 4" strokeWidth={1.5} ifOverflow="hidden" />
          ))}
          <Area type="monotone" dataKey="band" stroke="none" fill="#663399" fillOpacity={dark ? 0.38 : 0.22} isAnimationActive={false} />
          {showAll && pols.filter((p) => p !== pol).map((p) => (
            <Line key={p} type="monotone" dataKey={`${p}_m`} stroke={text} strokeDasharray="5 4" strokeWidth={1.4} strokeOpacity={0.75} dot={false} isAnimationActive={false} />
          ))}
          {dark && <Line type="monotone" dataKey={`${pol}_m`} stroke="#663399" strokeWidth={9} strokeOpacity={0.55} dot={false} isAnimationActive={false} legendType="none" />}
          <Line type="monotone" dataKey={`${pol}_m`} stroke={main} strokeWidth={2.6} dot={false} isAnimationActive={false} />
          {idx !== undefined && <ReferenceLine x={Date.parse(series.dates[idx])} stroke={dark ? '#e9defa' : '#2a1a3a'} strokeWidth={2} />}
          {idx !== undefined && <ReferenceDot x={Date.parse(series.dates[idx])} y={s.median[idx]} r={6} fill="#e9defa" stroke="#663399" strokeWidth={3} isFront />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}