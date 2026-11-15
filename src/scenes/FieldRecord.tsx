import '../styles/record.css'
import { useStore } from '../store/useStore'
import { acqText, fmtDate, modeBanner } from '../lib/format'
import { LIMITS } from '../lib/phenology'
import type { SiteBundle, Story } from '../types/data'
import RhythmChart from '../components/RhythmChart'
import Starfield from '../components/Starfield'

const MAXSIG = 8
const needsCite = (s: string) => s.startsWith('CITATION_NEEDED')

const Corner = ({ cls }: { cls: string }) => (
  <svg className={`rc ${cls}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 22 V8 Q2 2 8 2 H22 M7 17 V9 Q7 7 9 7 H17" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="3.5" cy="3.5" r="1.8" fill="currentColor" />
  </svg>
)

function Inner({ b, stories }: { b: SiteBundle; stories: Story[] }) {
  const pol = useStore((s) => s.pol)
  const reduced = useStore((s) => s.reduced)
  const go = useStore.getState().go
  const { series: s, analysis: a, meta } = b
  const ci = a?.cropping_intensity
  const story = stories.find((x) => x.id === meta.story_id)
  const sig = b.events.filter((e) => e.type === 'signal').sort((x, y) => x.date.localeCompare(y.date))
  const cul = b.events.filter((e) => e.type === 'cultural').sort((x, y) => x.date.localeCompare(y.date))
  const print = () => {
    const prev = document.title
    document.title = `FASAL Field Record ${meta.id}`
    window.print()
    document.title = prev
  }

  return (
    <div className="scene scroll rec-scene nebula">
      <div className="no-print"><Starfield reduced={reduced} /></div>
      <div className="rec-tools no-print">
        <button className="btn" onClick={() => go('site')}>Back to the instrument</button>
        <button className="btn" onClick={() => go('map')}>Map Memory</button>
        <button className="plaque small" onClick={print}>Print / Save as PDF</button>
      </div>

      <article className="field-record parchment" aria-label={`Field Record for ${meta.name}`}>
        {meta.data_mode === 'demo' && <div className="rec-watermark" aria-hidden="true">ILLUSTRATIVE DEMO DATA</div>}
        <Corner cls="rc-tl" /><Corner cls="rc-tr" /><Corner cls="rc-br" /><Corner cls="rc-bl" />
        <div className={`rec-mode rec-mode-${meta.data_mode}`} role="status">{modeBanner(meta.data_mode)}</div>

        <header className="rec-head">
          <p className="rec-eyebrow">Field Record</p>
          <h1>{meta.name}</h1>
          <p className="rec-ur" lang="ur" dir="rtl">{meta.name_ur}</p>
          <dl className="rec-meta">
            <div><dt>Sensor</dt><dd>{s.sensor}</dd></div>
            <div><dt>Data mode</dt><dd>{meta.data_mode.toUpperCase()}</dd></div>
            <div><dt>Date range</dt><dd>{fmtDate(s.dates[0])} to {fmtDate(s.dates[s.dates.length - 1])}</dd></div>
            <div><dt>Acquisitions</dt><dd>{acqText(s.n_acquisitions)}</dd></div>
            <div><dt>Polarizations</dt><dd>{s.polarizations.join(', ')}</dd></div>
            <div><dt>Data source</dt><dd>{s.source}</dd></div>
          </dl>
        </header>

        <section aria-label="Rhythm chart">
          <h2>Rhythm of the land</h2>
          <RhythmChart series={s} pol={pol} events={b.events} height={170} theme="ink" />
          <p className="rec-chart-note">Solid: {pol} median backscatter (dB). Dashed: other polarizations. Band: middle half of sample fields. Gold dashes: cultural dates. Sensor: {s.sensor}.</p>
        </section>

        <div className="rec-cols">
          <section aria-label="Detected signals">
            <h2>Detected signals (hypotheses)</h2>
            {sig.length === 0 ? <p>No signals detected.</p> : (
              <ul>
                {sig.slice(0, MAXSIG).map((e) => (
                  <li key={e.id}><span className="mono">{e.date}</span> {e.label} <span className="mono">({e.confidence} confidence{e.citation_needed ? ', CITATION_NEEDED' : ''})</span></li>
                ))}
              </ul>
            )}
            {sig.length > MAXSIG && <p className="mono">+{sig.length - MAXSIG} more in the app.</p>}
          </section>
          <section aria-label="Cultural calendar">
            <h2>Cultural calendar</h2>
            {cul.length === 0 ? <p>No cultural dates fall inside this date range.</p> : (
              <ul>
                {cul.map((e) => (
                  <li key={e.id}>
                    <span className="mono">{e.date}</span> {e.label} <span className="ur-inline" lang="ur" dir="rtl">{e.label_ur}</span>{' '}
                    {needsCite(e.source) ? <span className="chip warn">CITATION_NEEDED</span> : <span className="mono">Source: {e.source}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="Cropping intensity and gap">
          <h2>Cropping intensity and turnaround</h2>
          <p><strong>Cropping-intensity estimate:</strong> {ci ? ci.message : 'Analysis file not available; no estimate.'}{ci && !ci.allowed && ci.reason ? ` ${ci.reason}` : ''}</p>
          <p>
            <strong>Fall-to-rise gap (hypothesis):</strong>{' '}
            {a && a.gaps.length > 0
              ? a.gaps.map((g) => `${g.days} days between ${g.fall_date} and ${g.next_rise_date}`).join('; ') + '. Agronomic framing needs a citation (CITATION_NEEDED).'
              : 'none detected in this record.'}
          </p>
        </section>

        <section aria-label="Limits">
          <h2>Limits</h2>
          <ul className="rec-lim">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>

        <footer>
          <p className="rec-src">
            Credits: data source: {s.source}.{story ? ` Story: ${story.title}, ${story.author} (${story.year}), retold in the FASAL author's words.` : ''} Software and fonts: see REFERENCES.md. Open source, MIT license.
          </p>
          <p className="rec-foot">Generated by FASAL, NASA Space Apps 2026. Interpretations are hypotheses, not ground truth.</p>
        </footer>
      </article>
    </div>
  )
}

export default function FieldRecord({ stories }: { stories: Story[] }) {
  const b = useStore((s) => s.bundle)
  return b ? <Inner b={b} stories={stories} /> : null
}