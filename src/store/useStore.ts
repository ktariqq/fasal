import { create } from 'zustand'
import type { Scene, SiteBundle } from '../types/data'

export type Drawer = 'how' | 'limits' | 'future' | null
export type View = 'color' | 'gray'

interface State {
  scene: Scene
  siteId: string | null
  loadId: number
  bundle: SiteBundle | null
  bundleError: string | null
  idx: number
  playing: boolean
  pol: string
  view: View
  sound: boolean
  drawer: Drawer
  reduced: boolean
  go: (s: Scene) => void
  openSite: (id: string) => void
  setBundle: (b: SiteBundle | null, err?: string | null) => void
  setIdx: (i: number) => void
  setPlaying: (p: boolean) => void
  setPol: (p: string) => void
  setView: (v: View) => void
  setSound: (s: boolean) => void
  setDrawer: (d: Drawer) => void
  setReduced: (r: boolean) => void
}

export const useStore = create<State>()((set) => ({
  scene: 'opening',
  siteId: null,
  loadId: 0,
  bundle: null,
  bundleError: null,
  idx: 0,
  playing: false,
  pol: 'HH',
  view: 'color',
  sound: false,
  drawer: null,
  reduced: false,
  go: (scene) => set({ scene, playing: false, drawer: null }),
  // loadId changes on every open, so reopening the same site reloads it
  openSite: (id) => set((s) => ({ siteId: id, loadId: s.loadId + 1, scene: 'site', bundle: null, bundleError: null, idx: 0, playing: false, drawer: null })),
  setBundle: (bundle, err = null) => set({ bundle, bundleError: err, pol: bundle?.series.polarizations[0] ?? 'HH' }),
  setIdx: (idx) => set({ idx }),
  setPlaying: (playing) => set({ playing }),
  setPol: (pol) => set({ pol }),
  setView: (view) => set({ view }),
  setSound: (sound) => set({ sound }),
  setDrawer: (drawer) => set({ drawer }),
  setReduced: (reduced) => set({ reduced }),
}))