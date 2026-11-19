import Sheet from './Sheet'

export default function FutureNisar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="Future of NISAR + FASAL" onClose={onClose}>
      <p><em>A direction, not a finished service.</em></p>
      <h3>The idea</h3>
      <p>NISAR images the same land again and again. Over a full growing year, that record could show when fields flood, grow and are cleared. A community or extension service could keep a one-page Field Record per site and compare it from year to year.</p>
      <h3>What it still needs</h3>
      <ul>
        <li>A full year of regular passes</li>
        <li>Checks against real field observations</li>
        <li>Crop-type labels and expert review</li>
      </ul>
      <h3>Next steps</h3>
      <ul>
        <li>More sites and more years</li>
        <li>Comparison with ground observations</li>
        <li>Finding which radar setting best separates flooding, growth and harvest</li>
      </ul>
    </Sheet>
  )
}