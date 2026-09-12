let ctx: AudioContext | null = null
let ambient: HTMLAudioElement | null = null
let enabled = false

function context() {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) ctx = new Ctor()
  }
  return ctx
}

function tone(freq: number, time: number, gain = 0.02) {
  const c = context()
  if (!c || !enabled) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + time)
  osc.connect(g)
  g.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + time + 0.03)
}

export async function unlockSound() {
  const c = context()
  if (c?.state === 'suspended') await c.resume()
}

export function setSound(on: boolean, ambientSrc?: string) {
  enabled = on
  if (!on) {
    ambient?.pause()
    setDriveLevel(0)
    return
  }
  if (ambientSrc) {
    if (!ambient || ambient.src !== new URL(ambientSrc, window.location.href).href) {
      ambient = new Audio(ambientSrc)
      ambient.loop = true
      ambient.volume = 0.16
    }
    void ambient.play().catch(() => undefined)
  }
}

export function softChime() {
  tone(392, 0.18, 0.018)
  window.setTimeout(() => tone(523, 0.28, 0.014), 90)
}

let hum: OscillatorNode | null = null
let humGain: GainNode | null = null
let humFilter: BiquadFilterNode | null = null

function ensureHum() {
  const c = context()
  if (!c || hum) return
  hum = c.createOscillator()
  hum.type = 'sine'
  hum.frequency.value = 46
  humFilter = c.createBiquadFilter()
  humFilter.type = 'lowpass'
  humFilter.frequency.value = 180
  humGain = c.createGain()
  humGain.gain.value = 0.0001
  hum.connect(humFilter)
  humFilter.connect(humGain)
  humGain.connect(c.destination)
  hum.start()
}

export function setDriveLevel(level: number) {
  const c = context()
  if (!c) return
  const v = Math.max(0, Math.min(1, level))
  if (!enabled || v < 0.02) {
    if (humGain) humGain.gain.setTargetAtTime(0.0001, c.currentTime, 0.08)
    return
  }
  ensureHum()
  if (!hum || !humGain || !humFilter) return
  const now = c.currentTime
  hum.frequency.setTargetAtTime(44 + v * 76, now, 0.09)
  humFilter.frequency.setTargetAtTime(160 + v * 420, now, 0.1)
  humGain.gain.setTargetAtTime(0.01 * v, now, 0.12)
}

export function driveClick() {
  tone(196, 0.05, 0.01)
}

export function driveWhoosh() {
  tone(70, 0.32, 0.02)
  window.setTimeout(() => tone(118, 0.22, 0.012), 70)
}
