import type { SiteEvent } from '../types/data'

export const HINT_RULES = [
  { cue: 'Sustained very low backscatter in the Jun-Sep window', reading: 'consistent with standing water (flooded paddy) or a smooth bare surface' },
  { cue: 'A rise after low values', reading: 'consistent with canopy growth or field preparation' },
  { cue: 'A peak followed by an abrupt fall', reading: 'consistent with harvest or field clearing' },
  { cue: 'Low-to-moderate, stable returns', reading: 'consistent with bare or fallow ground' },
]

export const LIMITS = [
  'Revisit gaps: acquisitions are days to weeks apart, so short events can fall between dates.',
  'Speckle: radar images are grainy; averaging inside a field reduces but does not remove it.',
  'Incidence angle and soil moisture change backscatter without any change in the crop.',
  'No ground truth: nothing here has been checked against field observations.',
  'Small sample polygons: a few fields cannot represent a whole region.',
  'Every reading is a hypothesis ("consistent with"), never a measurement of what grew.',
]

const DAY = 86400000
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

export function nearestIndex(dates: string[], iso: string): number {
  let best = 0
  let bd = Infinity
  dates.forEach((d, i) => {
    const v = Math.abs(daysBetween(iso, d))
    if (v < bd) { bd = v; best = i }
  })
  return best
}

export function nearestEvent(events: SiteEvent[], iso: string): SiteEvent | null {
  let best: SiteEvent | null = null
  let bd = Infinity
  for (const e of events) {
    const v = Math.abs(daysBetween(iso, e.date))
    if (v < bd) { bd = v; best = e }
  }
  return best
}