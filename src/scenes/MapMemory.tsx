import { useEffect, useState } from 'react'
import '../styles/map.css'
import { useStore } from '../store/useStore'
import { frameUrl, imageExists, loadMaps, url } from '../lib/loadData'
import { fmtDate } from '../lib/format'
import { nearestIndex } from '../lib/phenology'
import type { MapInfo, SiteBundle } from '../types/data'
import Starfield from '../components/Starfield'
import SwipeCompare from '../components/SwipeCompare'

const SOURCES = ['Library of Congress', 'David Rumsey Map Collection', 'Wikimedia Commons', 'British Library']

function Inner({ b }: { b: SiteBundle }) {
  const reduced = useStore((s) => s.reduced)
  const view = useStore((s) => s.view)
  const idx = useStore((s) => s.idx)
  const go = useStore.getState().go
  const [info, setInfo] = useState<MapInfo | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const fdates = b.frames.map((f) => f.date)
  const [fi, setFi] = useState(() => nearestIndex(fdates, b.series.dates[Math.min(idx, b.series.dates.length - 1)]))

  useEffect(() => {
    let live = true
    loadMaps().then(async (list) => {
      const m = list.find((x) => x.site_id === b.meta.id) ?? null
      const ok = m ? await imageExists(url(m.file)) : false
      if (live) { setInfo(m); setState(ok ? 'ok' : 'missing') }
    })
    return () => { live = false }
  }, [b.meta.id])

  const f = b.frames[fi]
  const [W, S, E, N] = b.meta.bbox

  return (
    <div className="scene scroll mm nebula">
      <Starfield reduced={reduced} />
      <header className="mm-top">
        <h1>Map Memory: {b.meta.name}</h1>
        <nav className="mm-nav" aria-label="Navigation">
          <button className="btn" onClick={() => go('site')}>Back to the instrument</button>
          <button className="btn" onClick={() => go('record')}>Field Record</button>
          <button className="btn ghost" onClick={() => go('atlas')}>Atlas</button>
        </nav>
      </header>
      <main className="mm-body">
        <p className="mm-intro">Rivers on the Indus plain are known to change course over time. Swipe to compare an older map, as recorded then, with a radar view of the same ground.</p>
        {state === 'loading' && <p className="hud" role="status">Looking for the map...</p>}
        {state === 'missing' && (
          <section className="mm-empty parchment" aria-label="Add a public-domain map">
            <h2>Add a public-domain map</h2>
            <p>No historical map is installed for this site yet. FASAL does not bundle any map whose license has not been verified.</p>
            <ol>
              <li>Search for a historical map of the area at: {SOURCES.join(', ')}.</li>
              <li>Verify the license yourself. Use only maps you can confirm are in the public domain or that permit reuse with credit.</li>
              <li>Crop and align it, as closely as you can, to this site's extent: west {W}, south {S}, east {E}, north {N} (degrees). A square crop works best.</li>
              <li>Save it as <code>public/maps/{b.meta.id}.jpg</code>.</li>
              <li>Fill in <code>public/maps/maps.json</code> for <code>{b.meta.id}</code>: <code>title</code>, <code>year</code>, <code>source_url</code>, <code>license</code>, and set <code>verified</code> to true once you have checked it.</li>
            </ol>
            <p>Reload this page and the swipe will appear.</p>
          </section>
        )}
        {state === 'ok' && info && f && (
          <section className="mm-frame parchment" aria-label="Historical map and radar comparison">
            <div className="mm-pick">
              <label htmlFor="mm-date">Radar date</label>
              <select id="mm-date" value={fi} onChange={(e) => setFi(Number(e.target.value))}>
                {b.frames.map((fr, k) => <option key={fr.date} value={k}>{fmtDate(fr.date)}</option>)}
              </select>
              <span>{b.meta.sensor}</span>
            </div>
            <SwipeCompare
              leftSrc={url(info.file)}
              rightSrc={frameUrl(b.meta.id, f, view)}
              leftLabel={`Map${info.year ? `, ${info.year}` : ''}`}
              rightLabel={`Radar, ${fmtDate(f.date)}${b.meta.data_mode === 'demo' ? ' (ILLUSTRATIVE DEMO)' : ''}`}
            />
            <p className="mm-cap">
              <strong>{info.title || 'Untitled map (fill in maps.json)'}</strong>
              {info.year ? `, ${info.year}` : ''}.{' '}
              <span className="mono">License: {info.license || 'not recorded'}.</span>{' '}
              {info.source_url ? <a href={info.source_url} target="_blank" rel="noopener noreferrer">Source</a> : <span className="mono">Source: not recorded.</span>}{' '}
              {!info.verified && <span className="chip warn">VERIFY LICENSE</span>}
            </p>
          </section>
        )}
        {state === 'ok' && !info && <p className="hud">A map file was found but maps.json has no entry for this site.</p>}
      </main>
    </div>
  )
}

export default function MapMemory() {
  const b = useStore((s) => s.bundle)
  return b ? <Inner b={b} /> : null
}