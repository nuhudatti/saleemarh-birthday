import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { gift } from '../data/saleemarh'
import type { Photo } from '../lib/media'
import { fileName } from '../lib/picture'
import { Shot } from './Shot'

gsap.registerPlugin(ScrollTrigger)

type Props = {
  photos: Photo[]
  reducedMotion: boolean
  onOpen: (src: string) => void
}

type Trans = 'turn' | 'memory' | 'light' | 'depth' | 'soft'

type Beat =
  | { type: 'arrive'; photo: number; weight: number }
  | { type: 'hold'; photo: number; weight: number }
  | { type: 'cut'; from: number; to: number; trans: Trans; weight: number }
function keyOf(src: string) {
  return fileName(src).replace(/\.[^.]+$/, '')
}

function whisperFor(src: string) {
  const key = keyOf(src) as keyof typeof gift.whispers
  return gift.whispers[key] ?? { lead: '', line: '', place: 'none' as const }
}

function smooth(t: number) {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

function buildBeats(photos: Photo[]): Beat[] {
  const n = photos.length
  if (n === 0) return []
  if (n === 1) return [{ type: 'hold', photo: 0, weight: 1.4 }]

  const keys = photos.map((photo) => keyOf(photo.src))
  const six =
    keys[0] === '02' &&
    keys[1] === '03' &&
    keys[2] === '03.1' &&
    keys[3] === '04' &&
    keys[4] === '05' &&
    keys[5] === '06'

  const plan: Trans[] = six
    ? ['turn', 'memory', 'light', 'depth']
    : Array.from({ length: Math.max(0, n - 2) }, (_, i) =>
        i === 0 ? 'turn' : i === 1 ? 'memory' : i % 2 ? 'depth' : 'light',
      )

  const beats: Beat[] = [
    { type: 'arrive', photo: 0, weight: 0.3 },
    { type: 'hold', photo: 0, weight: 0.86 },
  ]

  plan.forEach((trans, i) => {
    const from = i
    const to = i + 1
    if (to >= n) return
    beats.push({ type: 'cut', from, to, trans, weight: 0.28 })
    beats.push({ type: 'hold', photo: to, weight: whisperFor(photos[to].src).line ? 1.05 : 0.78 })
  })

  const walk = n - 2
  const last = n - 1
  if (walk >= 0 && last > walk) {
    const already = beats.some((beat) => beat.type === 'cut' && beat.to === last)
    if (!already) {
      beats.push({ type: 'cut', from: walk, to: last, trans: 'soft', weight: 0.3 })
      beats.push({ type: 'hold', photo: last, weight: 0.82 })
    }
  }

  return beats
}

function clearLayer(node: HTMLDivElement) {
  node.style.opacity = '1'
  node.style.filter = 'none'
  node.style.transform = 'none'
  node.style.clipPath = ''
}

function paintCut(
  wrapA: HTMLDivElement,
  wrapB: HTMLDivElement,
  wash: HTMLDivElement | null,
  _trans: Trans,
  mix: number,
) {
  const k = smooth(mix)
  wrapA.style.clipPath = 'none'
  wrapB.style.clipPath = 'none'
  wrapA.style.filter = 'none'
  wrapB.style.filter = 'none'
  wrapA.style.opacity = String(1 - k)
  wrapB.style.opacity = String(k)
  wrapA.style.transform = `scale(${1 + k * 0.012})`
  wrapB.style.transform = `scale(${1.016 - k * 0.016})`
  if (wash) {
    wash.style.opacity = String(Math.sin(k * Math.PI) * 0.06)
    wash.style.background = 'rgba(12, 10, 9, 0.18)'
  }
}

function paintArrive(wrapA: HTMLDivElement, wrapB: HTMLDivElement, mix: number) {
  const ease = smooth(mix)
  wrapA.style.opacity = String(0.2 + ease * 0.8)
  wrapB.style.opacity = '0'
  wrapA.style.clipPath = 'none'
  wrapA.style.filter = `brightness(${0.88 + ease * 0.12})`
  wrapA.style.transform = `scale(${1.02 - ease * 0.02})`
}

export function Film({ photos, reducedMotion, onOpen }: Props) {
  const root = useRef<HTMLElement>(null)
  const aWrap = useRef<HTMLDivElement>(null)
  const bWrap = useRef<HTMLDivElement>(null)
  const bleed = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)
  const leadRef = useRef<HTMLSpanElement>(null)
  const wordRef = useRef<HTMLSpanElement>(null)
  const indexRef = useRef(0)
  const [pair, setPair] = useState([0, Math.min(1, Math.max(0, photos.length - 1))])

  useEffect(() => {
    const rootEl = root.current
    const wrapA = aWrap.current
    const wrapB = bWrap.current
    const wash = bleed.current
    const line = lineRef.current
    const lead = leadRef.current
    const word = wordRef.current
    if (!rootEl || !wrapA || !wrapB || photos.length === 0) return

    const beats = buildBeats(photos)
    const sum = beats.reduce((total, beat) => total + beat.weight, 0)
    let lastPair = ''
    let lookX = 0
    let lookY = 0
    let lookTX = 0
    let lookTY = 0
    let raf = 0
    let holdShown = 0
    let holding = false
    let holdSince = 0

    const paintWhisper = () => {
      if (!line) return
      const copy = whisperFor(photos[holdShown].src)
      if (lead && lead.textContent !== copy.lead) lead.textContent = copy.lead
      if (word && word.textContent !== copy.line) word.textContent = copy.line
      line.className = `film-whisper is-${copy.place || 'none'}`
      const waited = performance.now() - holdSince
      const ready = holding && Boolean(copy.line) && waited > 180
      line.classList.toggle('is-on', ready)
    }

    if (reducedMotion) {
      wrapB.style.opacity = '0'
      return
    }

    const trigger = ScrollTrigger.create({
      trigger: rootEl,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * Math.max(2.8, sum))}`,
      pin: true,
      scrub: 1.15,
      anticipatePin: 1,
      onUpdate: (self) => {
        let acc = 0
        let beat = beats[0]
        let mix = 0
        const x = self.progress * sum
        for (let i = 0; i < beats.length; i += 1) {
          const next = beats[i]
          if (acc + next.weight >= x || i === beats.length - 1) {
            beat = next
            mix = Math.min(1, Math.max(0, (x - acc) / Math.max(0.0001, next.weight)))
            break
          }
          acc += next.weight
        }

        const from = beat.type === 'hold' || beat.type === 'arrive' ? beat.photo : beat.from
        const to = beat.type === 'hold' || beat.type === 'arrive' ? beat.photo : beat.to
        const shown = beat.type === 'cut' ? (mix > 0.55 ? to : from) : from
        indexRef.current = shown
        const nowHold = beat.type === 'hold' || (beat.type === 'arrive' && mix > 0.78)
        if (shown !== holdShown || nowHold !== holding) {
          holdShown = shown
          holding = nowHold
          holdSince = performance.now()
        }

        const stamp = `${from}:${to}`
        if (stamp !== lastPair) {
          setPair([from, Math.min(photos.length - 1, to)])
          lastPair = stamp
          clearLayer(wrapA)
          clearLayer(wrapB)
        }

        if (beat.type === 'arrive') paintArrive(wrapA, wrapB, mix)
        else if (beat.type === 'hold') {
          wrapA.style.opacity = '1'
          wrapB.style.opacity = '0'
          wrapA.style.clipPath = 'none'
          wrapA.style.filter = 'none'
          wrapA.style.transform = 'none'
          if (wash) {
            wash.style.opacity = String(0.08 + Math.hypot(lookX, lookY) * 0.12)
            wash.style.background = `radial-gradient(ellipse at ${50 + lookX * 18}% ${42 + lookY * 14}%, rgba(247,241,232,0.14), transparent 46%)`
          }
        } else {
          paintCut(wrapA, wrapB, wash, beat.trans, mix)
        }

        paintWhisper()
      },
    })

    const tick = () => {
      raf = requestAnimationFrame(tick)
      lookX += (lookTX - lookX) * 0.08
      lookY += (lookTY - lookY) * 0.08
      rootEl.style.setProperty('--lx', lookX.toFixed(3))
      rootEl.style.setProperty('--ly', lookY.toFixed(3))
      paintWhisper()
    }
    raf = requestAnimationFrame(tick)

    const onPointer = (event: PointerEvent) => {
      const rect = rootEl.getBoundingClientRect()
      lookTX = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5
      lookTY = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5
    }
    const onLeave = () => {
      lookTX = 0
      lookTY = 0
    }
    const onOrient = (event: DeviceOrientationEvent) => {
      if (window.matchMedia('(pointer: fine)').matches) return
      lookTX = Math.max(-0.16, Math.min(0.16, (event.gamma ?? 0) / 70))
      lookTY = Math.max(-0.16, Math.min(0.16, ((event.beta ?? 45) - 45) / 80))
    }

    rootEl.addEventListener('pointermove', onPointer, { passive: true })
    rootEl.addEventListener('pointerleave', onLeave)
    window.addEventListener('deviceorientation', onOrient)
    const frame = requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(raf)
      trigger.kill()
      rootEl.removeEventListener('pointermove', onPointer)
      rootEl.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('deviceorientation', onOrient)
    }
  }, [photos, reducedMotion])

  if (!photos.length) return null

  return (
    <section className="chapter film" id="her" data-chapter="her" ref={root}>
      <div className="film-stage">
        <div className="film-layer film-a" ref={aWrap}>
          <div className="film-look">
            <Shot src={photos[pair[0]].src} alt={gift.firstName} index={pair[0]} priority bleed />
          </div>
        </div>
        <div className="film-layer film-b" ref={bWrap}>
          <div className="film-look">
            <Shot src={photos[pair[1]].src} alt="" index={pair[1]} priority bleed />
          </div>
        </div>
        <div className="film-bleed" ref={bleed} aria-hidden="true" />
        <div className="film-veil" />
        <p className="film-whisper is-none" ref={lineRef}>
          <span className="film-whisper-lead" ref={leadRef} />
          <span className="film-whisper-line" ref={wordRef} />
        </p>
        <button
          type="button"
          className="film-open"
          aria-label="View photograph"
          onClick={() => onOpen(photos[indexRef.current]?.src ?? photos[0].src)}
        />
      </div>
    </section>
  )
}
