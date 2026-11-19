import type { FeatureCollection } from 'geojson'

export type DataMode = 'real' | 'demo' | 'mixed'
export type Scene = 'opening' | 'atlas' | 'site' | 'map' | 'record'

export interface SiteMeta {
  id: string
  name: string
  name_ur: string
  bbox: [number, number, number, number]
  center: [number, number]
  story_id: string
  cultural_event_ids: string[]
  data_mode: DataMode
  sensor: string
  n_acquisitions: number
  date_range: [string, string]
}

export interface Manifest { project: string; data_mode: DataMode; generated_at: string; sites: SiteMeta[] }
export interface Stat { median: number[]; q25: number[]; q75: number[] }
export interface PerField { id: string; [pol: string]: number[] | string }

export interface Series {
  site_id: string
  data_mode: DataMode
  source: string
  sensor: string
  polarizations: string[]
  unit: 'dB'
  dates: string[]
  series: Record<string, Stat>
  per_field: PerField[]
  n_acquisitions: number
}

export interface SiteEvent {
  id: string
  date: string
  type: 'cultural' | 'signal'
  label: string
  label_ur: string
  description: string
  source: string
  confidence: string
  citation_needed: boolean
}

export interface FrameRef { date: string; file_color: string; file_gray: string; coverage?: number }
export interface Story { id: string; site_id: string; title: string; author: string; year: string; paraphrase: string; landscape_link: string; source: string }
export interface MapInfo { site_id: string; file: string; title: string; year: number | null; source_url: string; license: string; verified: boolean }
export interface BasemapInfo { attribution: string; tiles?: string; zoom?: number }

export interface CroppingIntensity {
  allowed: boolean
  estimate: number | null
  polarization: string
  n_acquisitions: number
  span_days: number
  max_gap_days?: number
  peaks_in_window: string[]
  message: string
  reason: string
}

export interface Gap { fall_date: string; next_rise_date: string; days: number; citation_needed: boolean }
export interface Analysis { cropping_intensity: CroppingIntensity; gaps: Gap[]; polarization: string; parameters: Record<string, number>; n_acquisitions: number }

export interface SiteBundle {
  meta: SiteMeta
  series: Series
  events: SiteEvent[]
  frames: FrameRef[]
  analysis: Analysis | null
  fields: FeatureCollection | null
  basemap: BasemapInfo | null
}