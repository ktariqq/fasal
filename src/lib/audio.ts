// Pitch mapping: the lowest dB in the shown series maps to 110 Hz and the highest to 880 Hz (three octaves, exponential).
// Lower backscatter gives a lower, darker tone (lower filter cutoff); higher gives a brighter one.
export const MAPPING_TEXT = 'Pitch follows the current backscatter. The lowest value in the series maps to 110 Hz and the highest to 880 Hz, in a smooth exponential scale: lower backscatter sounds lower and darker, higher sounds higher and brighter. A soft low pulse marks each step in time.'

interface Rig { ctx: AudioContext; master: GainNode; o1: OscillatorNode; o2: OscillatorNode; g2: GainNode; filt: BiquadFilterNode }
let rig: Rig | null = null
const LEVEL = 0.16

export const normDb = (db: number, lo: number, hi: number) => (hi > lo ? Math.min(1, Math.max(0, (db - lo) / (hi - lo))) : 0.5)
export const dbToHz = (db: number, lo: number, hi: number) => 110 * 2 ** (normDb(db, lo, hi) * 3)
export const toneWord = (hz: number) => (hz < 220 ? 'low' : hz < 440 ? 'middle' : 'high')

function impulse(ctx: AudioContext, sec = 2.4, decay = 3) {
  const n = Math.floor(ctx.sampleRate * sec)
  const buf = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay
  }
  return buf
}

// call only from a user gesture (click or key press)
export function startAudio(): boolean {
  if (rig) { void rig.ctx.resume(); return true }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return false
  const ctx = new AC()
  const master = ctx.createGain()
  master.gain.value = 0
  const filt = ctx.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.value = 900
  filt.Q.value = 0.7
  const o1 = ctx.createOscillator()
  o1.type = 'sine'
  const o2 = ctx.createOscillator()
  o2.type = 'triangle'
  const g1 = ctx.createGain()
  g1.gain.value = 0.6
  const g2 = ctx.createGain()
  g2.gain.value = 0.1
  const conv = ctx.createConvolver()
  conv.buffer = impulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  const dry = ctx.createGain()
  dry.gain.value = 0.7
  o1.connect(g1).connect(filt)
  o2.connect(g2).connect(filt)
  filt.connect(dry).connect(master)
  filt.connect(conv).connect(wet).connect(master)
  master.connect(ctx.destination)
  o1.start()
  o2.start()
  rig = { ctx, master, o1, o2, g2, filt }
  void ctx.resume()
  return true
}

export function setTone(hz: number, norm: number) {
  if (!rig) return
  const t = rig.ctx.currentTime
  rig.o1.frequency.setTargetAtTime(hz, t, 0.12)
  rig.o2.frequency.setTargetAtTime(hz * 2, t, 0.12)
  rig.filt.frequency.setTargetAtTime(500 + norm * 3200, t, 0.2)
  rig.g2.gain.setTargetAtTime(0.04 + 0.22 * norm, t, 0.2)
}

export function setActive(on: boolean) {
  if (rig) rig.master.gain.setTargetAtTime(on ? LEVEL : 0, rig.ctx.currentTime, 0.2)
}

// low gear-tick pulse, one per time step
export function pulse() {
  if (!rig) return
  const { ctx, master } = rig
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(58, t)
  o.frequency.exponentialRampToValueAtTime(40, t + 0.25)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + 0.32)
}