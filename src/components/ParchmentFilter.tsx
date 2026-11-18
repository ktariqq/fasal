// hidden SVG defs: aged parchment grain with torn, wavy edges; used by .parchment::before in theme.css
export default function ParchmentFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="parchment-tex" x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" result="low" />
          <feDisplacementMap in="SourceGraphic" in2="low" scale="14" xChannelSelector="R" yChannelSelector="G" result="edge" />
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" seed="9" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.3  0 0 0 0 0.36  0 0 0 0.67 -0.35" result="tint" />
          <feComposite in="tint" in2="edge" operator="in" result="tintClip" />
          <feBlend in="tintClip" in2="edge" mode="multiply" />
        </filter>
      </defs>
    </svg>
  )
}