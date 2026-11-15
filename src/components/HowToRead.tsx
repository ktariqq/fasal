import Sheet from './Sheet'
import { HINT_RULES } from '../lib/phenology'
import { MAPPING_TEXT } from '../lib/audio'

interface Props { open: boolean; onClose: () => void; minDates?: number; minSpan?: number }

export default function HowToRead({ open, onClose, minDates = 20, minSpan = 365 }: Props) {
  return (
    <Sheet open={open} title="How to read this" onClose={onClose}>
      <h3>The picture</h3>
      <p>Each frame is a radar image of a 10 km by 10 km area. Brighter pixels return more of the radar's energy to the satellite, darker pixels return less. Radar supplies its own signal, so it works at night and through cloud.</p>
      <h3>The chart</h3>
      <p>The line is the median backscatter, in decibels (dB), across the outlined sample fields. Each field's value is the mean of its pixels at that date. The shaded band spans the 25th to 75th percentile across fields, so it shows the middle half. Higher dB means a stronger return. Dashed gold lines mark cultural dates.</p>
      <h3>Polarizations</h3>
      <p>A polarization is a transmit and receive combination. Cross-polarized returns (such as HV) are generally more sensitive to vegetation structure than co-polarized ones (such as HH). Use the legend buttons to choose which polarization is drawn solid.</p>
      <h3>Colour and Science views</h3>
      <p>Both views show the same data. Science is the plain grayscale stretch. Colour maps the same values onto a violet ramp for the theme.</p>
      <h3>Reading hints (hypotheses)</h3>
      <ul>
        {HINT_RULES.map((r) => <li key={r.cue}><strong>{r.cue}:</strong> {r.reading}.</li>)}
      </ul>
      <p>These are rules of thumb applied to the numbers. They are never ground truth.</p>
      <h3>Cropping intensity</h3>
      <p>The estimate counts prominent peaks in the first 365 days. It is only computed when there are at least {minDates} acquisitions covering at least {minSpan} days. Otherwise the app reports: Insufficient dates for cropping-intensity estimate.</p>
      <h3>The tone</h3>
      <p>{MAPPING_TEXT}</p>
    </Sheet>
  )
}