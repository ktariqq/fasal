import Sheet from './Sheet'
import { HINT_RULES } from '../lib/phenology'
import { MAPPING_TEXT } from '../lib/audio'

interface Props { open: boolean; onClose: () => void; minDates?: number; minSpan?: number }

const sum = { cursor: 'pointer', color: 'var(--brass)', fontFamily: 'var(--f-cinzel)', letterSpacing: '0.08em', margin: '14px 0 6px' } as const

export default function HowToRead({ open, onClose, minDates = 20, minSpan = 365 }: Props) {
  return (
    <Sheet open={open} title="How to read this" onClose={onClose}>
      <p><em>A radar satellite watches farmland through cloud and night. FASAL turns its record into something you can watch and hear.</em></p>

      <h3>What you are looking at</h3>
      <p>NISAR sends its own radar signal down and measures the echo. Bright pixels are strong echoes, dark pixels weak ones. Water, growing crops and bare soil each echo differently, so a field's brightness changes with the seasons.</p>

      <h3>Try it in 30 seconds</h3>
      <ol>
        <li>Press <strong>Play</strong>, or drag the gold slider, to move through time.</li>
        <li>Watch the picture and the dot on the chart move together.</li>
        <li>Turn <strong>Sound on</strong>: a higher pitch means a stronger echo.</li>
        <li>Tap a star or gear on the slider to jump to an event.</li>
      </ol>

      <h3>The controls</h3>
      <ul>
        <li><strong>Colour / Science:</strong> the same picture, in purple or plain grey.</li>
        <li><strong>Zoom:</strong> enlarge the picture, then drag to move around.</li>
        <li><strong>Field outlines:</strong> dashed shapes mark the sample fields behind the chart.</li>
        <li><strong>Basemap:</strong> a satellite photo underneath, so you can see where the radar did not reach.</li>
        <li><strong>Map Memory:</strong> compare with an old map. </li>
        <li><strong>Field Record:</strong> a one-page printable summary.</li>
      </ul>

      <h3>Words you will see</h3>
      <ul>
        <li><strong>Backscatter (dB):</strong> how strong the echo is. Closer to zero is stronger, so -9 dB is stronger than -20 dB.</li>
        <li><strong>Acquisition:</strong> one satellite pass, giving one picture. More passes make a more reliable story.</li>
        <li><strong>HH and HV:</strong> two radar settings. HH reacts more to water and ground; HV reacts more to leaves and stems.</li>
        <li><strong>Shaded band:</strong> where the middle half of the sample fields fall. A wide band means the fields differ.</li>
        <li><strong>Star and gear markers:</strong> a star is a cultural date. A gear is a pattern that simple rules spotted in the data.</li>
        <li><strong>Hypothesis:</strong> every reading is "consistent with", never a confirmed fact.</li>
        <li><strong>Cropping intensity:</strong> how many crops a field grows in a year.</li>
      </ul>

      <details>
        <summary style={sum}>Going deeper</summary>
        <p>Each field's value is the mean of its pixels, averaged in linear power and then converted to dB. The line is the median across fields. The band spans their 25th to 75th percentiles.</p>
        <p>The rules behind the gear markers:</p>
        <ul>{HINT_RULES.map((r) => <li key={r.cue}><strong>{r.cue}:</strong> {r.reading}.</li>)}</ul>
        <p>Cropping intensity counts prominent peaks in the first 365 days. It is only computed with at least {minDates} passes covering at least {minSpan} days and no long gaps. Otherwise the app says the dates are insufficient.</p>
        <p>{MAPPING_TEXT}</p>
        <p>On some dates the satellite covered only part of the site. Those areas are transparent.</p>
      </details>
    </Sheet>
  )
}