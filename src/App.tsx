import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from './store/useStore'
import { loadManifest, loadSite, loadStories } from './lib/loadData'
import type { Manifest, Story } from './types/data'
import ParchmentFilter from './components/ParchmentFilter'
import DataModeBanner from './components/DataModeBanner'
import Opening from './scenes/Opening'
import Atlas from './scenes/Atlas'

const SiteView = lazy(() => import('./scenes/SiteView'))
const MapMemory = lazy(() => import('./scenes/MapMemory'))
const FieldRecord = lazy(() => import('./scenes/FieldRecord'))

function Fallback({ title, detail, action, label }: { title: string; detail: string; action?: () => void; label?: string }) {
  return (
    <div className="scene nebula center-all">
      <div className="fallback parchment" role="alert">
        <h2>{title}</h2>
        <p>{detail}</p>
        {action && <button className="plaque small" onClick={action}>{label ?? 'Try again'}</button>}
      </div>
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    return this.state.err ? <Fallback title="Something went wrong" detail={this.state.err.message} action={() => location.reload()} label="Reload" /> : this.props.children
  }
}

type Boot = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; manifest: Manifest; stories: Story[] }

const Waiting = ({ text }: { text: string }) => (
  <div className="scene nebula center-all" role="status"><p className="hud">{text}</p></div>
)

export default function App() {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })
  const scene = useStore((s) => s.scene)
  const siteId = useStore((s) => s.siteId)
  const loadId = useStore((s) => s.loadId)
  const bundle = useStore((s) => s.bundle)
  const bundleError = useStore((s) => s.bundleError)
  const setBundle = useStore((s) => s.setBundle)
  const setReduced = useStore((s) => s.setReduced)
  const reduced = useStore((s) => s.reduced)
  const go = useStore((s) => s.go)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setReduced(mq.matches)
    f()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [setReduced])

  useEffect(() => {
    let live = true
    Promise.all([loadManifest(), loadStories()])
      .then(([manifest, stories]) => { if (live) setBoot({ status: 'ready', manifest, stories }) })
      .catch((e: Error) => { if (live) setBoot({ status: 'error', message: e.message }) })
    return () => { live = false }
  }, [])

  // loadId is a dependency so reopening the same site loads it again
  useEffect(() => {
    if (!siteId || boot.status !== 'ready') return
    const meta = boot.manifest.sites.find((s) => s.id === siteId)
    if (!meta) { setBundle(null, `Unknown site: ${siteId}`); return }
    let live = true
    loadSite(meta)
      .then((b) => { if (live) setBundle(b) })
      .catch((e: Error) => { if (live) setBundle(null, e.message) })
    return () => { live = false }
  }, [siteId, loadId, boot, setBundle])

  if (boot.status === 'loading') return <Waiting text="Unrolling the chart..." />
  if (boot.status === 'error') {
    return <Fallback title="Data not found" detail={`${boot.message}. The atlas data could not be loaded. Please reload the page.`} action={() => location.reload()} label="Reload" />
  }
  const { manifest, stories } = boot
  const inSite = scene === 'site' || scene === 'map' || scene === 'record'
  const mode = inSite && bundle ? bundle.meta.data_mode : manifest.data_mode

  let body: ReactNode
  if (scene === 'opening') body = <Opening />
  else if (scene === 'atlas') body = <Atlas manifest={manifest} />
  else if (bundleError) body = <Fallback title="This site could not be loaded" detail={bundleError} action={() => go('atlas')} label="Back to the Atlas" />
  else if (!bundle) body = <Waiting text="Loading the instrument..." />
  else {
    body = (
      <Suspense fallback={<Waiting text="Calibrating..." />}>
        {scene === 'site' ? <SiteView stories={stories} /> : scene === 'map' ? <MapMemory /> : <FieldRecord stories={stories} />}
      </Suspense>
    )
  }

  return (
    <Boundary>
      <ParchmentFilter />
      <div className="global-banner">
        <DataModeBanner mode={mode} sensor={inSite && bundle ? bundle.meta.sensor : undefined} n={inSite && bundle ? bundle.meta.n_acquisitions : undefined} />
      </div>
      <AnimatePresence>
        <motion.div key={scene} className="layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : 1.1 }}>
          {body}
        </motion.div>
      </AnimatePresence>
    </Boundary>
  )
}