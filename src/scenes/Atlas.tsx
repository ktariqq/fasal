import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { Manifest } from '../types/data'
import Starfield from '../components/Starfield'
import GlobeCanvas, { PAKISTAN } from '../components/GlobeCanvas'
import Cartouche from '../components/Cartouche'
import { acqText, modeShort } from '../lib/format'

export default function Atlas({ manifest }: { manifest: Manifest }) {
  const reduced = useStore((s) => s.reduced)
  const openSite = useStore((s) => s.openSite)
  const go = useStore((s) => s.go)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [diving, setDiving] = useState<string | null>(null)
  const sites = manifest.sites
  const target = sites.find((s) => s.id === diving)
  const focus = target ? { lon: target.center[0], lat: target.center[1], scale: 22 } : PAKISTAN
  const dive = (id: string) => {
    if (diving) return
    if (reduced) openSite(id)
    else setDiving(id)
  }
  const hs = hover ? sites.find((s) => s.id === hover.id) : undefined
  const fade = { opacity: diving ? 0 : 1 }

  return (
    <div className="scene nebula" role="region" aria-label="The Atlas: choose a site">
      <Starfield reduced={reduced} />
      <GlobeCanvas
        reduced={reduced}
        start={PAKISTAN}
        focus={focus}
        markers={sites.map((s) => ({ id: s.id, lon: s.center[0], lat: s.center[1], label: s.name }))}
        markerMode="always"
        markerSize={7}
        labels
        highlight="586"
        label="Map of Pakistan with three site markers"
        onHover={(id, x, y) => setHover(id ? { id, x, y } : null)}
        onPick={dive}
        onSettled={diving ? () => openSite(diving) : undefined}
      />
      <div className="atlas-head" style={fade}>
        <h2>The Atlas</h2>
        <p>Three sites on the Indus plains. Choose one to hear its radar rhythm.</p>
      </div>
      <button className="btn ghost replay" style={fade} onClick={() => go('opening')}>Replay intro</button>
      {hs && hover && !diving && (
        <Cartouche
          title={hs.name}
          titleUr={hs.name_ur}
          lines={[modeShort(hs.data_mode), acqText(hs.n_acquisitions), `${hs.date_range[0]} to ${hs.date_range[1]}`]}
          style={{ position: 'absolute', left: Math.max(8, Math.min(hover.x + 18, window.innerWidth - 310)), top: Math.max(48, Math.min(hover.y + 18, window.innerHeight - 190)), pointerEvents: 'none' }}
        />
      )}
      <div className="atlas-list" style={fade}>
        {sites.map((s) => (
          <button key={s.id} className="site-btn" onClick={() => dive(s.id)}>
            <span className="site-name">{s.name}</span>
            <span className="site-ur" lang="ur" dir="rtl">{s.name_ur}</span>
            <span className="site-meta">{modeShort(s.data_mode)} | {acqText(s.n_acquisitions)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}