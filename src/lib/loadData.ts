import type { FeatureCollection } from 'geojson'
import type { Analysis, FrameRef, Manifest, MapInfo, Series, SiteBundle, SiteEvent, SiteMeta, Story } from '../types/data'

export const url = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\/+/, '')}`

async function getJson<T>(p: string): Promise<T> {
  const r = await fetch(url(p))
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`)
  return (await r.json()) as T
}

// the dev server answers missing files with index.html, so a parse failure also lands here
async function optional<T>(p: string): Promise<T | null> {
  try { return await getJson<T>(p) } catch { return null }
}

export const loadManifest = () => getJson<Manifest>('data/manifest.json')
export const loadStories = async () => (await optional<Story[]>('data/stories.json')) ?? []
export const loadMaps = async () => (await optional<MapInfo[]>('maps/maps.json')) ?? []

export async function loadSite(meta: SiteMeta): Promise<SiteBundle> {
  const d = `data/${meta.id}`
  const [series, events, frames, analysis, fields] = await Promise.all([
    getJson<Series>(`${d}/series.json`),
    optional<SiteEvent[]>(`${d}/events.json`),
    getJson<FrameRef[]>(`${d}/frames.json`),
    optional<Analysis>(`${d}/analysis.json`),
    optional<FeatureCollection>(`${d}/fields.geojson`),
  ])
  return { meta, series, events: events ?? [], frames, analysis, fields }
}

export const frameUrl = (siteId: string, f: FrameRef, view: 'color' | 'gray') => url(`data/${siteId}/${view === 'color' ? f.file_color : f.file_gray}`)

export function imageExists(u: string): Promise<boolean> {
  return new Promise((res) => {
    const i = new Image()
    i.onload = () => res(true)
    i.onerror = () => res(false)
    i.src = u
  })
}