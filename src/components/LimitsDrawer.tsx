import Sheet from './Sheet'
import { LIMITS } from '../lib/phenology'
import { acqText } from '../lib/format'
import type { DataMode } from '../types/data'

interface Props { open: boolean; onClose: () => void; mode: DataMode; n: number; sensor: string }

export default function LimitsDrawer({ open, onClose, mode, n, sensor }: Props) {
  return (
    <Sheet open={open} title="Limits" onClose={onClose}>
      <p><em>This is a prototype that shows a method. It is not a farm report.</em></p>
      {mode === 'demo' && <p><strong>This site is showing ILLUSTRATIVE DEMO DATA. None of it is a NISAR observation, and none of it describes real fields.</strong></p>}
      {mode === 'mixed' && <p><strong>This site mixes sensors. Check the sensor label on each series.</strong></p>}
      <h3>This site</h3>
      <p>Sensor: {sensor}. {acqText(n)} available.{n < 15 ? ' With so few dates, seasonal patterns cannot be judged.' : ''}</p>
      <h3>Why to be careful</h3>
      <ul>{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
      <p>FASAL makes no yield or food-security claims.</p>
    </Sheet>
  )
}