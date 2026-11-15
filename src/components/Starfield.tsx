import { useEffect, useRef } from 'react'

const COLORS = ['#e9defa', '#c8b2e8', '#8b5fbf', '#ffffff']
interface Star { x: number; y: number; z: number; r: number; p: number; s: number; c: string }

export default function Starfield({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    let w = 0, h = 0, raf = 0, px = 0, py = 0, tx = 0, ty = 0
    let stars: Star[] = []
    const draw = (t: number) => {
      g.clearRect(0, 0, w, h)
      for (const s of stars) {
        g.globalAlpha = reduced ? 0.7 : 0.3 + 0.5 * (0.5 + 0.5 * Math.sin((t / 900) * s.s + s.p))
        const x = (((s.x * w + px * s.z * 28 + (reduced ? 0 : t * 0.002 * s.z)) % w) + w) % w
        const y = (((s.y * h + py * s.z * 28) % h) + h) % h
        g.fillStyle = s.c
        g.beginPath()
        g.arc(x, y, s.r * (0.6 + s.z * 0.8), 0, 6.283)
        g.fill()
      }
      g.globalAlpha = 1
    }
    const resize = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      c.width = w * d
      c.height = h * d
      g.setTransform(d, 0, 0, d, 0, 0)
      stars = Array.from({ length: Math.floor((w * h) / 5000) }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.28, s: Math.random() * 1.5 + 0.5, c: COLORS[Math.floor(Math.random() * COLORS.length)] }))
      if (reduced) draw(0)
    }
    const loop = (t: number) => {
      px += (tx - px) * 0.04
      py += (ty - py) * 0.04
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2
      ty = (e.clientY / window.innerHeight - 0.5) * 2
    }
    resize()
    window.addEventListener('resize', resize)
    if (!reduced) {
      window.addEventListener('pointermove', move)
      raf = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
    }
  }, [reduced])
  return <canvas ref={ref} className="fill" aria-hidden="true" />
}