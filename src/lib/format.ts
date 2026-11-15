import type { DataMode } from '../types/data'

export const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const fmtDb = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? 'n/a' : `${v.toFixed(1)} dB`)
export const acqText = (n: number) => `${n} acquisition${n === 1 ? '' : 's'}`
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// the banner text is chosen from the data_mode field in the JSON, never from the UI state
export const modeBanner = (m: DataMode): string =>
  m === 'demo' ? 'ILLUSTRATIVE DEMO DATA, NOT NISAR OBSERVATIONS' : m === 'mixed' ? 'MIXED DATA: NOT ALL SERIES ARE NISAR, CHECK EACH SENSOR LABEL' : 'SAR OBSERVATIONS: SEE SENSOR LABELS'

export const modeShort = (m: DataMode): string => (m === 'demo' ? 'ILLUSTRATIVE DEMO' : m === 'mixed' ? 'MIXED' : 'REAL SAR')