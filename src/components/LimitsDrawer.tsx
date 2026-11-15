import Sheet from './Sheet'
import { LIMITS } from '../lib/phenology'
import { acqText } from '../lib/format'
import type { DataMode } from '../types/data'

interface Props { open: boolean; onClose: () => void; mode: DataMode; n: number; sensor: string }

export default function LimitsDrawer({ open, onClose, mode, n, sensor }: Props) {
  return (
    <Sheet open={open} title="Limits" onClose={onClose}>
      {mode === 'demo' && <p><strong>This site is showing ILLUSTRATIVE DEMO DATA. None of it is a NISAR observation, and none of it describes real fields.</strong></p>}
      {mode === 'mixed' && <p><strong>This site mixes sensors. Check the sensor label on each series.</strong></p>}
      <p>Sensor: {sensor}. {acqText(n)} available here.{n < 20 ? ' With so few dates, seasonal patterns cannot be judged.' : ''}</p>
      <ul>{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
    </Sheet>
  )
}