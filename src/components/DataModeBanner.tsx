import type { DataMode } from '../types/data'
import { acqText, modeBanner } from '../lib/format'

export default function DataModeBanner({ mode, sensor, n }: { mode: DataMode; sensor?: string; n?: number }) {
  return (
    <div className={`banner banner-${mode}`} role="status" aria-live="polite">
      <strong>{modeBanner(mode)}</strong>
      {sensor && <span>| {sensor}</span>}
      {n !== undefined && <span>| {acqText(n)}</span>}
    </div>
  )
}