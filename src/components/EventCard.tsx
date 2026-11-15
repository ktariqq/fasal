import type { SiteEvent } from '../types/data'
import { fmtDate } from '../lib/format'

interface Props { event: SiteEvent | null; position: number; total: number; onPrev: () => void; onNext: () => void }

export default function EventCard({ event, position, total, onPrev, onNext }: Props) {
  if (!event) {
    return (
      <section className="card event" aria-label="Event card">
        <p className="eyebrow">Event</p>
        <p>No events are recorded for this site.</p>
      </section>
    )
  }
  const cultural = event.type === 'cultural'
  return (
    <section className="card event" aria-label="Event card" aria-live="polite">
      <p className="eyebrow">
        <svg viewBox="0 0 10 10" width="12" height="12" aria-hidden="true">
          {cultural
            ? <polygon points="5,0.4 6.5,3.7 10,4 7.3,6.4 8.1,9.8 5,8 1.9,9.8 2.7,6.4 0,4 3.5,3.7" fill="var(--rebecca)" />
            : <circle cx="5" cy="5" r="3.6" fill="none" stroke="var(--rebecca)" strokeWidth="1.6" strokeDasharray="2 1.2" />}
        </svg>
        {cultural ? 'Cultural calendar' : 'Radar signal (hypothesis)'}
      </p>
      <h3>{event.label}</h3>
      {event.label_ur && <p className="ev-ur" lang="ur" dir="rtl">{event.label_ur}</p>}
      <p className="ev-date">{fmtDate(event.date)}</p>
      <p>{event.description}</p>
      {!cultural && <p className="ev-meta">Confidence: {event.confidence}</p>}
      <p className="source">
        {event.citation_needed && <span className="chip warn">CITATION_NEEDED</span>}
        Source: {event.source}
      </p>
      <div className="ev-nav">
        <button className="btn ghost" onClick={onPrev} disabled={position <= 0}>Earlier event</button>
        <span className="ev-meta">{position + 1} of {total}</span>
        <button className="btn ghost" onClick={onNext} disabled={position >= total - 1}>Later event</button>
      </div>
    </section>
  )
}