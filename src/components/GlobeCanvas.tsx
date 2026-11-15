import { useEffect, useRef } from 'react'
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import landTopo from 'world-atlas/land-110m.json'
import countryTopo from 'world-atlas/countries-110m.json'
import { drawSweep } from './RadarSweep'

export interface Marker { id: string; lon: number; lat: number; label: string }
export interface Focus { lon: number; lat: number; scale: number }
export const PAKISTAN: Focus = { lon: 69.3, lat: 29.5, scale: 6 }

interface Props {
  reduced: boolean
  focus?: Focus | null
  start?: Focus
  spin?: boolean
  sweep?: boolean
  markers?: Marker[]
  markerMode?: 'always' | 'sweep'
  markerSize?: number
  labels?: boolean
  highlight?: string
  cyFrac?: number
  label?: string
  onHover?: (id: string | null, x: number, y: number) => void
  onPick?: (id: string) => void
  onSettled?: () => void
}

const land = feature(landTopo as any, (landTopo as any).objects.land) as unknown as Feature<Geometry>
const countries = feature(countryTopo as any, (countryTopo as any).objects.countries) as unknown as FeatureCollection
const grat = geoGraticule10()
const SPHERE = { type: 'Sphere' } as const
const SPIN_DPS = 14
const PERIOD = 4.8

export default function GlobeCanvas(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pr = useRef(p)
  pr.current = p
  const dirty = useRef(true)
  const settled = useRef(false)
  const fk = p.focus ? `${p.focus.lon}|${p.focus.lat}|${p.focus.scale}` : 'none'
  useEffect(() => { settled.current = false; dirty.current = true }, [fk, p.reduced, p.spin])

  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    const proj = geoOrthographic().clipAngle(90).precision(0.5)
    const path = geoPath(proj, g)
    const s0 = pr.current.start ?? pr.current.focus ?? { lon: 20, lat: 20, scale: 1 }
    const st = { lon: s0.lon, lat: s0.lat, k: s0.scale }
    const seen: Record<string, boolean> = {}
    let pins: { id: string; x: number; y: number; vis: boolean }[] = []
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now()
    let hover: string | null = null

    const resize = () => {
      const r = c.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      dirty.current = true
    }

    const draw = (t: number, dt: number) => {
      const P = pr.current
      const tg = P.focus
      if (tg) {
        if (P.reduced) { st.lon = tg.lon; st.lat = tg.lat; st.k = tg.scale }
        else {
          const a = 1 - Math.exp(-dt * 3)
          const dl = ((tg.lon - st.lon + 540) % 360) - 180
          st.lon += dl * a
          st.lat += (tg.lat - st.lat) * a
          st.k *= (tg.scale / st.k) ** a
        }
        const dl2 = ((tg.lon - st.lon + 540) % 360) - 180
        if (!settled.current && Math.abs(dl2) < 0.08 && Math.abs(tg.lat - st.lat) < 0.08 && Math.abs(tg.scale / st.k - 1) < 0.01) {
          settled.current = true
          P.onSettled?.()
        }
      } else if (P.spin && !P.reduced) {
        st.lon += SPIN_DPS * dt
        st.lat += (20 - st.lat) * (1 - Math.exp(-dt * 1.5))
      }
      st.lon = ((st.lon + 540) % 360) - 180
      if (w < 2 || h < 2) return

      const R = Math.min(w, h) * 0.27 * st.k
      const cx = w / 2
      const cy = h * (P.cyFrac ?? 0.5)
      proj.translate([cx, cy]).scale(R).rotate([-st.lon, -st.lat, 0])
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)

      const og = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R)
      og.addColorStop(0, '#2b1458')
      og.addColorStop(0.55, '#1c0d38')
      og.addColorStop(1, '#0e0620')
      g.beginPath(); path(SPHERE); g.fillStyle = og; g.fill()

      g.beginPath(); path(grat); g.strokeStyle = 'rgba(184,147,90,.32)'; g.lineWidth = 0.6; g.stroke()

      g.beginPath(); path(land); g.fillStyle = '#d9c9a5'; g.fill()
      g.save()
      g.beginPath(); path(land); g.clip()
      g.strokeStyle = 'rgba(42,26,58,.13)'; g.lineWidth = 0.7
      g.beginPath()
      for (let x = -h; x < w + h; x += 5) { g.moveTo(x, h); g.lineTo(x + h, 0) }
      g.stroke()
      g.restore()

      g.beginPath()
      for (const f of countries.features) path(f as Feature<Geometry>)
      g.strokeStyle = 'rgba(42,26,58,.55)'; g.lineWidth = 0.6; g.stroke()
      g.beginPath(); path(land); g.strokeStyle = '#2a1a3a'; g.lineWidth = 0.9; g.stroke()

      const hl = P.highlight ? countries.features.find((f) => String(f.id) === P.highlight) : undefined
      if (hl) {
        g.save()
        g.beginPath(); path(hl as Feature<Geometry>)
        g.fillStyle = 'rgba(102,51,153,.38)'; g.fill()
        g.shadowColor = 'rgba(139,95,191,.95)'; g.shadowBlur = 12
        g.strokeStyle = 'rgba(200,178,232,.95)'; g.lineWidth = 1.6; g.stroke()
        g.restore()
      }

      const sg = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R)
      sg.addColorStop(0, 'rgba(11,5,20,0)')
      sg.addColorStop(1, 'rgba(11,5,20,.62)')
      g.beginPath(); path(SPHERE); g.fillStyle = sg; g.fill()

      const sa = P.sweep && !P.reduced ? ((((t / 1000) % PERIOD) / PERIOD) * Math.PI * 2) : -1
      if (sa >= 0) drawSweep(g, cx, cy, R, sa)

      g.beginPath(); path(SPHERE); g.strokeStyle = 'rgba(184,147,90,.9)'; g.lineWidth = 1.8; g.stroke()

      pins = []
      const mode = P.markerMode ?? 'always'
      const size = P.markerSize ?? 5
      ;(P.markers ?? []).forEach((m, i) => {
        const q = proj([m.lon, m.lat])
        if (!q) return
        const vis = geoDistance([m.lon, m.lat], [st.lon, st.lat]) < Math.PI / 2 - 0.02
        pins.push({ id: m.id, x: q[0], y: q[1], vis })
        if (!vis) return
        const pulse = P.reduced ? 0.5 : (t / 1400 + i * 0.3) % 1
        let alpha = 1
        if (mode === 'sweep' && sa >= 0) {
          const bearing = Math.atan2(q[1] - cy, q[0] - cx)
          const behind = (((sa - bearing) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
          const blip = behind < 1.6 ? 1 - behind / 1.6 : 0
          if (blip > 0.85) seen[m.id] = true
          alpha = seen[m.id] ? 0.55 + 0.45 * (1 - pulse) : blip
        }
        if (alpha <= 0.01) return
        g.globalAlpha = alpha
        g.beginPath(); g.arc(q[0], q[1], size + 10 * pulse, 0, 6.283)
        g.strokeStyle = `rgba(200,178,232,${0.8 * (1 - pulse)})`; g.lineWidth = 1.5; g.stroke()
        if (hover === m.id) { g.beginPath(); g.arc(q[0], q[1], size + 7, 0, 6.283); g.strokeStyle = '#c8b2e8'; g.lineWidth = 2; g.stroke() }
        g.beginPath(); g.arc(q[0], q[1], size, 0, 6.283)
        g.fillStyle = '#b8935a'; g.fill(); g.strokeStyle = '#2a1a3a'; g.lineWidth = 1.2; g.stroke()
        if (P.labels) {
          g.font = '600 13px Cinzel, serif'
          g.fillStyle = '#e9defa'
          g.shadowColor = '#0b0514'; g.shadowBlur = 6
          g.fillText(m.label, q[0] + size + 8, q[1] + 4)
          g.shadowBlur = 0
        }
        g.globalAlpha = 1
      })
    }

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const P = pr.current
      if (P.reduced && !dirty.current && !(P.focus && !settled.current)) return
      draw(t, dt)
      dirty.current = false
    }

    const near = (e: PointerEvent, rad: number) => {
      const r = c.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      let best: { id: string; x: number; y: number } | null = null
      let bd = rad
      for (const q of pins) {
        if (!q.vis) continue
        const d = Math.hypot(q.x - x, q.y - y)
        if (d < bd) { bd = d; best = { id: q.id, x: q.x, y: q.y } }
      }
      return best
    }
    const onMove = (e: PointerEvent) => {
      if (!pr.current.onHover && !pr.current.onPick) return
      const b = near(e, 26)
      const id = b ? b.id : null
      c.style.cursor = id ? 'pointer' : 'default'
      if (id !== hover) {
        hover = id
        dirty.current = true
        pr.current.onHover?.(id, b ? b.x : 0, b ? b.y : 0)
      }
    }
    const onLeave = () => {
      if (hover !== null) { hover = null; dirty.current = true; pr.current.onHover?.(null, 0, 0) }
    }
    const onUp = (e: PointerEvent) => {
      const b = near(e, 30)
      if (b) pr.current.onPick?.(b.id)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(c)
    resize()
    c.addEventListener('pointermove', onMove)
    c.addEventListener('pointerleave', onLeave)
    c.addEventListener('pointerup', onUp)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      c.removeEventListener('pointermove', onMove)
      c.removeEventListener('pointerleave', onLeave)
      c.removeEventListener('pointerup', onUp)
    }
  }, [])

  return <canvas ref={ref} className="fill" role="img" aria-label={p.label ?? 'Engraved globe'} />
}