import { useEffect, useMemo, useRef, useState } from 'react'
import { acqText, clamp, fmtDate, fmtDb } from '../lib/format'
import type { Polygon } from 'geojson'
import { useStore } from '../store/useStore'
import { frameUrl } from '../lib/loadData'
import { nearestEvent, nearestIndex } from '../lib/phenology'
import { dbToHz, normDb, pulse, setActive, setTone, startAudio, toneWord } from '../lib/audio'
import type { SiteBundle, SiteEvent, Story } from '../types/data'
import Starfield from '../components/Starfield'
import BrassDial from '../components/BrassDial'
import TimeScrubber from '../components/TimeScrubber'
import RhythmChart from '../components/RhythmChart'
import StoryCard from '../components/StoryCard'
import EventCard from '../components/EventCard'
import HowToRead from '../components/HowToRead'
import LimitsDrawer from '../components/LimitsDrawer'
import FutureNisar from '../components/FutureNisar'
import Gear from '../components/Gear'

function RadarFrame({ src, alt }: { src: string; alt: string }) {
  const [layers, setLayers] = useState<{ prev: string | null; cur: string }>({ prev: null, cur: src })
  const [broken, setBroken] = useState(false)
  useEffect(() => { setLayers((l) => (l.cur === src ? l : { prev: l.cur, cur: src })); setBroken(false) }, [src])
  if (!src || broken) return <div className="fr-missing">Frame not found. Run the pipeline to generate frames.</div>
  return (
    <>
      {layers.prev && <img className="fr fr-prev" src={layers.prev} alt="" aria-hidden="true" />}
      <img key={layers.cur} className="fr fr-cur" src={layers.cur} alt={alt} decoding="async" onError={() => setBroken(true)} />
    </>
  )
}

function Fields({ b }: { b: SiteBundle }) {
  if (!b.fields) return null
  const [W, S, E, N] = b.meta.bbox
  const X = (lon: number) => ((lon - W) / (E - W)) * 1000
  const Y = (lat: number) => ((N - lat) / (N - S)) * 1000
  return (
    <svg className="fields-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      {b.fields.features.map((f, k) => {
        if (f.geometry.type !== 'Polygon') return null
        const ring = (f.geometry as Polygon).coordinates[0]
        const pts = ring.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')
        return (
          <g key={k}>
            <polygon points={pts} fill="rgba(200,178,232,0.10)" stroke="#e9defa" strokeWidth="3" strokeDasharray="10 6" />
            <text x={X(ring[0][0]) + 6} y={Y(ring[0][1]) - 8} fill="#e9defa" fontSize="30" fontFamily="JetBrains Mono, monospace">{String(f.properties?.id ?? '')}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Inner({ b, stories }: { b: SiteBundle; stories: Story[] }) {
  const idx = useStore((s) => s.idx)
  const playing = useStore((s) => s.playing)
  const pol = useStore((s) => s.pol)
  const view = useStore((s) => s.view)
  const sound = useStore((s) => s.sound)
  const drawer = useStore((s) => s.drawer)
  const reduced = useStore((s) => s.reduced)
  const { setIdx, setPlaying, setPol, setView, setSound, setDrawer, go } = useStore.getState()
  const [pinned, setPinned] = useState<string | null>(null)
  const [outlines, setOutlines] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [grab, setGrab] = useState(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const fit = (p: { x: number; y: number }, z: number) => { const L = ((z - 1) / 2) * 100; return { x: clamp(p.x, -L, L), y: clamp(p.y, -L, L) } }
  const nudge = (dx: number, dy: number) => setPan((p) => fit({ x: p.x + dx, y: p.y + dy }, zoom))
  const changeZoom = (z: number) => { setZoom(z); setPan((p) => fit(p, z)) }
  const stop = () => { last.current = null; setGrab(false) }
  const [audioMsg, setAudioMsg] = useState('')

  const dates = b.series.dates
  const n = dates.length
  const i = Math.min(idx, n - 1)
  const pols = b.series.polarizations
  const st = b.series.series[pol] ?? b.series.series[pols[0]]
  const lo = Math.min(...st.median)
  const hi = Math.max(...st.median)
  const value = st.median[i]
  const hz = dbToHz(value, lo, hi)
  const events = useMemo(() => [...b.events].sort((a, c) => a.date.localeCompare(c.date)), [b.events])
  const shown: SiteEvent | null = (pinned ? events.find((e) => e.id === pinned) : undefined) ?? nearestEvent(events, dates[i])
  const evPos = shown ? events.indexOf(shown) : -1
  const story = stories.find((s) => s.id === b.meta.story_id)
  const frameDates = useMemo(() => b.frames.map((f) => f.date), [b.frames])
  const fi = b.frames.length ? nearestIndex(frameDates, dates[i]) : -1
  const src = fi >= 0 ? frameUrl(b.meta.id, b.frames[fi], view) : ''

  const scrub = (k: number) => { setPinned(null); setIdx(k) }
  const jump = (e: SiteEvent) => { setPinned(e.id); setIdx(nearestIndex(dates, e.date)) }

  useEffect(() => {
    for (const k of [fi - 1, fi + 1]) {
      if (k >= 0 && k < b.frames.length) new Image().src = frameUrl(b.meta.id, b.frames[k], view)
    }
  }, [fi, view, b])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const s = useStore.getState()
      setPinned(null)
      s.setIdx(s.idx >= n - 1 ? 0 : s.idx + 1)
    }, reduced ? 1500 : 900)
    return () => window.clearInterval(id)
  }, [playing, n, reduced])

  // sonification: tone follows the median dB; sustained while playing, a short blip when scrubbing
  useEffect(() => {
    if (!sound) { setActive(false); return }
    setTone(hz, normDb(value, lo, hi))
    setActive(true)
    if (playing) { pulse(); return }
    const t = window.setTimeout(() => setActive(false), 700)
    return () => window.clearTimeout(t)
  }, [sound, playing, i, hz, value, lo, hi])
  useEffect(() => () => setActive(false), [])

  const togglePlay = () => {
    if (!playing && sound) startAudio()
    setPlaying(!playing)
  }
  const toggleSound = () => {
    if (!sound && !startAudio()) { setAudioMsg('Audio is not available in this browser.'); return }
    setAudioMsg('')
    setSound(!sound)
  }
  const ci = b.analysis?.cropping_intensity
  const params = b.analysis?.parameters

  return (
    <div className="scene sv nebula">
      <Starfield reduced={reduced} />
      <header className="sv-top">
        <div className="sv-title">
          <h1>{b.meta.name}</h1>
          <span className="ur" lang="ur" dir="rtl">{b.meta.name_ur}</span>
        </div>
        <nav className="sv-nav" aria-label="Site tools">
          <button className="btn ghost" onClick={() => go('atlas')}>Atlas</button>
          <button className="btn" onClick={() => go('map')}>Map Memory</button>
          <button className="btn" onClick={() => go('record')}>Field Record</button>
          <button className="btn ghost" aria-pressed={drawer === 'how'} onClick={() => setDrawer(drawer === 'how' ? null : 'how')}>How to read</button>
          <button className="btn ghost" aria-pressed={drawer === 'limits'} onClick={() => setDrawer(drawer === 'limits' ? null : 'limits')}>Limits</button>
          <button className="btn ghost" aria-pressed={drawer === 'future'} onClick={() => setDrawer(drawer === 'future' ? null : 'future')}>Future</button>
        </nav>
      </header>

      <main className="sv-grid">
        <section className="sv-left parchment" aria-label="Story and events">
          <div className="scroll-in">
            <StoryCard story={story} />
            <EventCard
              event={shown}
              position={evPos}
              total={events.length}
              onPrev={() => evPos > 0 && jump(events[evPos - 1])}
              onNext={() => evPos < events.length - 1 && jump(events[evPos + 1])}
            />
          </div>
        </section>

        <section className="sv-center" aria-label="Radar frame">
          <BrassDial label={`Radar frame for ${fmtDate(dates[i])}`}>
            <div
              className={`zoom${grab ? ' grabbing' : ''}`}
              style={{ transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})`, cursor: zoom > 1 ? (grab ? 'grabbing' : 'grab') : 'default' }}
              tabIndex={zoom > 1 ? 0 : -1}
              aria-label="Radar frame. When zoomed in, drag or use the arrow keys to pan."
              onDragStart={(e) => e.preventDefault()}
              onPointerDown={(e) => { if (zoom === 1) return; e.currentTarget.setPointerCapture(e.pointerId); last.current = { x: e.clientX, y: e.clientY }; setGrab(true) }}
              onPointerMove={(e) => { if (!last.current) return; const w = e.currentTarget.offsetWidth; nudge(((e.clientX - last.current.x) / w) * 100, ((e.clientY - last.current.y) / w) * 100); last.current = { x: e.clientX, y: e.clientY } }}
              onPointerUp={stop}
              onPointerCancel={stop}
              onKeyDown={(e) => { const s = e.shiftKey ? 10 : 4; const m: Record<string, [number, number]> = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }; if (zoom > 1 && m[e.key]) { e.preventDefault(); nudge(...m[e.key]) } }}
            >
              <RadarFrame src={src} alt={`${b.series.polarizations[0]} radar backscatter frame, ${fmtDate(dates[i])}. ${b.meta.data_mode === 'demo' ? 'Illustrative demo data.' : ''}`} />
              {outlines && <Fields b={b} />}
            </div>
          </BrassDial>
          <div className="dial-controls">
            {[1, 1.5, 2].map((z) => <button key={z} className="btn" aria-pressed={zoom === z} onClick={() => changeZoom(z)}>{z}x</button>)}
            <button className="btn" aria-pressed={view === 'color'} onClick={() => setView('color')}>Colour</button>
            <button className="btn" aria-pressed={view === 'gray'} onClick={() => setView('gray')}>Science</button>
            <button className="btn ghost" aria-pressed={outlines} onClick={() => setOutlines(!outlines)}>Field outlines</button>
          </div>
          <p className="hud caption">{fmtDate(dates[i])} | frame polarization {pols[0]} | {b.meta.sensor}</p>
        </section>

        <section className="sv-right" aria-label="Rhythm chart">
          <div className="gauge" role="group" aria-label="Current reading">
            <div className="g-row"><span>DATE</span><strong>{fmtDate(dates[i])}</strong></div>
            <div className="g-row"><span>{pol} MEDIAN</span><strong>{fmtDb(value)}</strong></div>
            <div className="g-row"><span>MIDDLE HALF</span><strong>{st.q25[i].toFixed(1)} to {st.q75[i].toFixed(1)} dB</strong></div>
            <div className="g-row"><span>TONE</span><strong>Current tone: {toneWord(hz)}, ~{Math.round(hz)} Hz{sound ? '' : ' (sound off)'}</strong></div>
          </div>
          <h2 className="chart-title">Backscatter (dB)</h2>
          <RhythmChart series={b.series} pol={pol} events={events} idx={i} onPick={scrub} height={250} />
          <div className="legend" role="group" aria-label="Polarization and sensor">
            {pols.map((p) => (
              <button key={p} className="leg-btn" aria-pressed={p === pol} onClick={() => setPol(p)}>
                <svg width="34" height="10" aria-hidden="true"><line x1="0" y1="5" x2="34" y2="5" stroke="currentColor" strokeWidth={p === pol ? 3 : 1.5} strokeDasharray={p === pol ? undefined : '5 4'} /></svg>
                <span>{p}</span>
                <span className="sens">{b.series.sensor}</span>
              </button>
            ))}
            <span className="leg-note">Shaded band: middle half of fields. Gold dashes: cultural dates.</span>
          </div>
          <p className="note"><strong>{acqText(b.series.n_acquisitions)} available.</strong> {ci ? <><strong>Cropping intensity:</strong> {ci.message}</> : 'Analysis file not available.'}</p>
          {ci && ci.reason && <p className="note small">{ci.reason}</p>}
        </section>
      </main>

      <footer className="sv-bottom">
        <div className="play-row">
          <button className="plaque small" aria-pressed={playing} onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
          <svg className={`gears-mini${playing ? '' : ' paused'}`} viewBox="0 0 120 70" aria-hidden="true">
            <Gear cx={40} cy={38} r={30} teeth={12} speed={8} />
            <Gear cx={92} cy={22} r={18} teeth={8} speed={5} reverse />
          </svg>
          <span className="readout hud">{fmtDate(dates[i])} | {pol} {fmtDb(value)} | {i + 1} of {n}</span>
          <button className="btn" aria-pressed={sound} onClick={toggleSound}>{sound ? 'Sound on' : 'Sound off'}</button>
          {audioMsg && <span className="hud" role="status">{audioMsg}</span>}
        </div>
        <TimeScrubber dates={dates} idx={i} events={events} valueText={`${fmtDate(dates[i])}, ${pol} ${fmtDb(value)}`} onChange={scrub} onMarker={jump} />
      </footer>

      <HowToRead open={drawer === 'how'} onClose={() => setDrawer(null)} minDates={params?.min_dates} minSpan={params?.min_span} />
      <LimitsDrawer open={drawer === 'limits'} onClose={() => setDrawer(null)} mode={b.meta.data_mode} n={n} sensor={b.series.sensor} />
      <FutureNisar open={drawer === 'future'} onClose={() => setDrawer(null)} />
    </div>
  )
}

export default function SiteView({ stories }: { stories: Story[] }) {
  const b = useStore((s) => s.bundle)
  return b ? <Inner b={b} stories={stories} /> : null
}