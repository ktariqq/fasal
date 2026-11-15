import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import Starfield from '../components/Starfield'
import GlobeCanvas, { PAKISTAN, type Marker } from '../components/GlobeCanvas'
import ArmillaryRings from '../components/ArmillaryRings'
import CompassRose from '../components/CompassRose'
import { GearTrain } from '../components/Gear'

const TITLE = 'FASAL'
const TAG = 'The Indus, as radar hears it.'
const BEACON: Marker[] = [{ id: 'indus', lon: 70.5, lat: 30.0, label: 'Indus basin' }]

function useTyped(text: string, delay: number, per: number, off: boolean) {
  const [n, setN] = useState(off ? text.length : 0)
  useEffect(() => {
    if (off) { setN(text.length); return }
    setN(0)
    let i = 0
    let iv = 0
    const t = window.setTimeout(() => {
      iv = window.setInterval(() => {
        i++
        setN(i)
        if (i >= text.length) window.clearInterval(iv)
      }, per)
    }, delay)
    return () => { window.clearTimeout(t); window.clearInterval(iv) }
  }, [text, delay, per, off])
  return text.slice(0, n)
}

export default function Opening() {
  const reduced = useStore((s) => s.reduced)
  const go = useStore((s) => s.go)
  const [phase, setPhase] = useState<'spin' | 'rest' | 'dive'>(reduced ? 'rest' : 'spin')
  const [showUr, setShowUr] = useState(reduced)
  const [ready, setReady] = useState(reduced)
  const title = useTyped(TITLE, 500, 120, reduced)
  const tag = useTyped(TAG, 2300, 36, reduced)

  useEffect(() => {
    if (reduced) { setPhase('rest'); setShowUr(true); setReady(true); return }
    const t = [
      window.setTimeout(() => setShowUr(true), 1500),
      window.setTimeout(() => setReady(true), 3700),
      window.setTimeout(() => setPhase((p) => (p === 'spin' ? 'rest' : p)), 5200),
    ]
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [reduced])

  const begin = () => (reduced ? go('atlas') : setPhase('dive'))
  const focus = phase === 'spin' ? null : phase === 'dive' ? PAKISTAN : { ...PAKISTAN, scale: 1.12 }

  return (
    <div className="scene nebula" role="region" aria-label="FASAL opening">
      <Starfield reduced={reduced} />
      <div className={`rings${phase === 'dive' ? ' rings-out' : ''}`} style={{ top: '45%' }} aria-hidden="true">
        <ArmillaryRings reduced={reduced} />
      </div>
      <GlobeCanvas
        reduced={reduced}
        start={{ lon: -25, lat: 20, scale: 1 }}
        focus={focus}
        spin={phase === 'spin'}
        sweep={!reduced && phase !== 'dive'}
        markers={BEACON}
        markerMode={reduced ? 'always' : 'sweep'}
        cyFrac={0.45}
        label="Rotating engraved globe with a radar sweep passing over the Indus basin"
        onSettled={phase === 'dive' ? () => go('atlas') : undefined}
      />
      <GearTrain className="corner-gears" />
      <CompassRose className="corner-rose" />
      <div className="title-block">
        <h1 className="title-main" aria-label="FASAL"><span aria-hidden="true">{title}</span></h1>
        <div className="title-ur" lang="ur" dir="rtl" style={{ opacity: showUr ? 1 : 0 }}>فصل</div>
        <p className="title-tag">{tag}</p>
        <button className="plaque" onClick={begin} tabIndex={ready ? 0 : -1} style={{ opacity: ready ? 1 : 0, pointerEvents: ready ? 'auto' : 'none' }}>
          Begin the voyage
        </button>
      </div>
      <button className="btn skip" onClick={() => go('atlas')}>Skip intro</button>
    </div>
  )
}