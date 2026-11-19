import Sheet from './Sheet'


export default function FutureNisar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="Future of NISAR + FASAL" onClose={onClose}>
      <p><em>A future direction, not a finished service.</em></p>
      <p>NISAR is an L-band radar mission built to image land repeatedly. With enough acquisitions over a full growing year, a record like this one could show when fields flood, grow and are cleared.</p>
      <p>Smallholder communities and extension services could keep a simple Field Record per site, a dated rhythm to compare from one year to the next. FASAL demonstrates the idea; it has not been validated as a service.</p>
      <p>Food-security monitoring would need ground truth, crop-type labels and agronomic review before any statistic could be claimed. FASAL makes no such claim.</p>
      <p>Natural next steps: more sites and years, comparison with field observations, and a closer look at which polarizations best separate flooding, growth and harvest.</p>  
    </Sheet>
  )
}