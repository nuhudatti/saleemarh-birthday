import { useEffect, useRef } from 'react'
import { gift } from '../data/saleemarh'
import type { Photo } from '../lib/media'
import { driveClick, driveWhoosh, setDriveLevel } from '../lib/sound'

type Mode = 'accelerate' | 'corner' | 'night' | 'arrival' | 'memory'

type Speck = {
  x: number
  y: number
  ox: number
  oy: number
  tx: number
  ty: number
  r: number
  g: number
  b: number
  s: number
}

const MODES: Mode[] = ['accelerate', 'corner', 'night', 'arrival', 'memory']
const RISE = 1 / 2.9
const FALL = 1 / 0.78
const COMMIT = 0.87
const ENGAGE = 70

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / image.width, h / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function sampleName(width: number, height: number, text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return [] as { x: number; y: number }[]
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `italic 500 ${Math.min(width * 0.16, 140)}px "Playfair Display", serif`
  ctx.fillText(text, width / 2, height * 0.46)
  const data = ctx.getImageData(0, 0, width, height).data
  const pts: { x: number; y: number }[] = []
  for (let y = 0; y < height; y += 5) {
    for (let x = 0; x < width; x += 5) {
      if (data[(y * width + x) * 4 + 3] > 70) pts.push({ x, y })
    }
  }
  return pts
}

function samplePhoto(image: HTMLImageElement, w: number, h: number, count: number) {
  const sw = 160
  const sh = Math.max(90, Math.round((160 * h) / w))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [] as Speck[]
  cover(ctx, image, sw, sh)
  const data = ctx.getImageData(0, 0, sw, sh).data
  const pool: Speck[] = []
  for (let y = 0; y < sh; y += 2) {
    for (let x = 0; x < sw; x += 2) {
      const i = (y * sw + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r + g + b < 80) continue
      pool.push({
        x: (x / sw) * w,
        y: (y / sh) * h,
        ox: (x / sw) * w,
        oy: (y / sh) * h,
        tx: (x / sw) * w,
        ty: (y / sh) * h,
        r,
        g,
        b,
        s: 1.6 + Math.random() * 1.4,
      })
    }
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, count)
}

function drawM(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = 'rgba(232, 236, 245, 0.92)'
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ctx.moveTo(cx - size, cy + size)
  ctx.lineTo(cx - size, cy - size)
  ctx.lineTo(cx, cy + size * 0.12)
  ctx.lineTo(cx + size, cy - size)
  ctx.lineTo(cx + size, cy + size)
  ctx.stroke()
  ctx.restore()
}

type Props = {
  photos: Photo[]
  reducedMotion: boolean
  onFinale?: () => void
}

export function Drive({ photos, reducedMotion, onFinale }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const aRef = useRef<HTMLImageElement>(null)
  const bRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inviteRef = useRef<HTMLSpanElement>(null)
  const whisperRef = useRef<HTMLParagraphElement>(null)
  const markRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLParagraphElement>(null)
  const wishRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const stage = stageRef.current
    const imgA = aRef.current
    const imgB = bRef.current
    const canvas = canvasRef.current
    if (!root || !stage || !imgA || !imgB || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mobile = window.matchMedia('(pointer: coarse)').matches
    const maxSpecks = mobile ? 260 : 720
    const paths = photos.map((photo) => photo.src)
    const last = Math.max(0, paths.length - 1)
    let index = 0
    let dead = false
    let raf = 0
    let visible = true
    let held = false
    let engaged = false
    let energy = 0
    let commit = 0
    let commitT = 0
    let mode: Mode = 'accelerate'
    let corner = 1
    let pulse = 0
    let pulseX = 0
    let pulseY = 0
    let pointerX = 0
    let pointerY = 0
    let startX = 0
    let startY = 0
    let startAt = 0
    let headX = 0
    let headY = 0
    let headVx = 0
    let sweep = 0
    let egg = 0
    let mark = 0
    let flips = 0
    let lastDir = 0
    let extrema = 0
    let finale = 0
    let finaleLive = false
    let picture: HTMLImageElement | undefined
    const specks: Speck[] = []
    const trail: { x: number; y: number; a: number }[] = []

    let pointerId = 0
    let cw = 0
    let ch = 0

    const srcAt = (i: number) => paths[Math.max(0, Math.min(paths.length - 1, i))] || ''

    const fit = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (w !== cw || h !== ch) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        cw = w
        ch = h
      }
      return { w, h }
    }

    const loadPic = (src: string, into?: (image: HTMLImageElement) => void) => {
      if (!src) return
      const image = new Image()
      image.onload = () => into?.(image)
      image.src = src
    }

    if (srcAt(0)) imgA.src = srcAt(0)
    if (srcAt(1)) imgB.src = srcAt(1)
    loadPic(srcAt(0), (image) => {
      picture = image
    })
    paths.forEach((src) => {
      const warm = new Image()
      warm.src = src
    })

    const showMark = (on: boolean) => {
      if (markRef.current) markRef.current.classList.toggle('show', on)
    }

    const idleVisual = () => {
      imgA.style.opacity = paths.length ? '1' : '0'
      imgA.style.filter = 'none'
      imgA.style.transform = 'none'
      imgB.style.opacity = '0'
      imgB.style.filter = 'none'
      imgB.style.transform = 'none'
      if (inviteRef.current) inviteRef.current.style.opacity = '1'
      if (whisperRef.current) whisperRef.current.style.opacity = '1'
    }

    const applySpool = (w: number, h: number) => {
      const e = energy
      const nx = (pointerX / w - 0.5) * e
      const ny = (pointerY / h - 0.5) * e * 0.4
      const scale = 1 + e * 0.16
      const persp = 900
      imgA.style.opacity = '1'
      imgA.style.transform = `perspective(${persp}px) translate3d(${nx * -18}px, ${ny * -10}px, ${e * 36}px) scale(${scale}) scaleX(${1 + e * 0.035})`
      imgA.style.filter = e > 0.48 ? `blur(${(e - 0.48) * 5.5}px)` : 'none'
      imgB.style.opacity = '0'
      if (inviteRef.current) inviteRef.current.style.opacity = String(Math.max(0, 1 - e * 6))
      if (whisperRef.current) whisperRef.current.style.opacity = String(Math.max(0, 1 - e * 3.2))
      const dark = Math.min(0.42, e * 0.5)
      stage.style.setProperty('--drive-dark', String(dark))
    }

    const applyCommit = (t: number, w: number) => {
      const e = 1 - (1 - t) ** 2
      const nx = (pointerX / Math.max(1, w) - 0.5) * 2
      if (mode === 'accelerate') {
        imgA.style.transform = `scale(${1.14 + e * 0.42})`
        imgA.style.filter = `blur(${e * 9}px)`
        imgA.style.opacity = String(1 - e)
        imgB.style.opacity = String(e)
        imgB.style.transform = `scale(${1.3 - e * 0.3})`
      } else if (mode === 'corner') {
        const dir = corner
        imgA.style.transform = `translate3d(${-dir * e * 46}vw, 0, 0) scale(${1.06 + e * 0.08})`
        imgA.style.opacity = String(1 - e)
        imgB.style.opacity = String(e)
        imgB.style.transform = `translate3d(${dir * (1 - e) * 46}vw, 0, 0)`
        imgA.style.filter = `blur(${e * 4}px)`
      } else if (mode === 'night') {
        imgA.style.opacity = String(1 - e)
        imgA.style.filter = `brightness(${1 - e * 0.7}) blur(${e * 3}px)`
        imgB.style.opacity = String(e)
        imgB.style.transform = `scale(${1.08 - e * 0.08})`
        imgB.style.filter = `brightness(${0.7 + e * 0.3})`
        stage.style.setProperty('--drive-dark', String(0.22 + e * 0.28))
      } else if (mode === 'arrival') {
        imgA.style.opacity = String(1 - e * 0.85)
        imgA.style.transform = `scale(${1.04 + e * 0.06})`
        imgB.style.opacity = String(e)
        imgB.style.transform = `scale(${1.08 - e * 0.08})`
      } else {
        imgA.style.opacity = String(1 - e)
        imgA.style.filter = `blur(${e * 12}px)`
        imgB.style.opacity = String(e)
        imgB.style.transform = `scale(${1.12 - e * 0.12})`
      }
      void nx
    }

    const seedFinale = (image: HTMLImageElement | undefined, w: number, h: number) => {
      const targets = sampleName(w, h, gift.firstName)
      const origins = image
        ? samplePhoto(image, w, h, Math.min(maxSpecks, targets.length))
        : targets.map((p) => ({
            ...p,
            ox: p.x,
            oy: p.y,
            tx: p.x,
            ty: p.y,
            r: 210,
            g: 186,
            b: 140,
            s: 2,
          }))
      specks.length = 0
      const n = Math.min(targets.length, origins.length, maxSpecks)
      for (let i = 0; i < n; i += 1) {
        const from = origins[i]
        const to = targets[i]
        specks.push({
          x: from.ox,
          y: from.oy,
          ox: from.ox,
          oy: from.oy,
          tx: to.x,
          ty: to.y,
          r: from.r,
          g: from.g,
          b: from.b,
          s: from.s,
        })
      }
    }

    const paint = (w: number, h: number) => {
      ctx.clearRect(0, 0, w, h)
      const e = finaleLive ? 1 : energy
      const vanishX = w * 0.5 + (pointerX - w * 0.5) * 0.14 * e
      const vanishY = h * 0.4

      if (pulse > 0.02) {
        const r = (1 - pulse) * 90 + 10
        ctx.beginPath()
        ctx.arc(pulseX, pulseY, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(180, 205, 255, ${0.28 * pulse})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      if (e > 0.22) {
        const beam = Math.min(1, (e - 0.22) / 0.3)
        sweep += 0.008 + e * 0.045
        const x = ((sweep % 1) * 1.4 - 0.2) * w
        const y = h * 0.56 + (pointerY - h * 0.5) * 0.1
        const g = ctx.createLinearGradient(x - 80, y, x + 80, y)
        g.addColorStop(0, 'rgba(80, 140, 220, 0)')
        g.addColorStop(0.5, `rgba(210, 230, 255, ${0.18 + beam * 0.35})`)
        g.addColorStop(1, 'rgba(80, 140, 220, 0)')
        ctx.fillStyle = g
        ctx.fillRect(0, y - 1.2 - e * 4, w, 2.4 + e * 8)
      }

      if (e > 0.42) {
        const road = Math.min(1, (e - 0.42) / 0.28)
        ctx.strokeStyle = `rgba(201, 165, 106, ${0.16 * road})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(vanishX, vanishY)
        ctx.lineTo(w * 0.12, h)
        ctx.moveTo(vanishX, vanishY)
        ctx.lineTo(w * 0.88, h)
        ctx.stroke()
        ctx.strokeStyle = `rgba(140, 180, 230, ${0.12 * road})`
        ctx.beginPath()
        ctx.moveTo(vanishX, vanishY)
        ctx.lineTo(w * 0.5, h)
        ctx.stroke()
      }

      headVx += (pointerX - headX) * 0.14
      headVx *= 0.78
      headX += headVx
      headY += (pointerY - headY) * 0.16
      if (held && engaged && e > 0.12) {
        trail.unshift({ x: headX, y: headY, a: Math.min(1, e) })
        if (trail.length > 42) trail.pop()
      }
      for (let i = 0; i < trail.length; i += 1) {
        trail[i].a *= 0.94
        const p = trail[i]
        if (p.a < 0.03) continue
        const n = trail[i + 1]
        ctx.strokeStyle = `rgba(186, 214, 255, ${p.a * 0.55})`
        ctx.lineWidth = Math.max(0.6, 2.2 - i * 0.04)
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        if (n) ctx.lineTo(n.x, n.y)
        else ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      while (trail.length && trail[trail.length - 1].a < 0.03) trail.pop()

      if (mark > 0) {
        drawM(ctx, w * 0.5, h * 0.48, Math.min(w, h) * 0.16, mark)
      }

      if (finaleLive && specks.length) {
        const gather = Math.min(1, Math.max(0, (finale - 0.18) / 0.5))
        const ease = 1 - (1 - gather) ** 3
        const ghost = Math.max(0, (finale - 0.78) / 0.22)
        if (picture) {
          ctx.save()
          ctx.globalAlpha = Math.max(0, 1 - finale / 0.22) * 0.95 + ghost * 0.2
          cover(ctx, picture, w, h)
          ctx.restore()
        }
        const shown = Math.min(1, Math.max(0, (finale - 0.08) / 0.12))
        for (const speck of specks) {
          const drift = Math.min(1, finale / 0.2)
          speck.x = speck.ox + (speck.tx - speck.ox) * ease + drift * 12 * (1 - ease)
          speck.y = speck.oy + (speck.ty - speck.oy) * ease
          ctx.fillStyle = `rgba(${speck.r},${speck.g},${speck.b},${0.9 * shown})`
          ctx.fillRect(speck.x, speck.y, speck.s, speck.s)
        }
        if (nameRef.current) nameRef.current.style.opacity = gather > 0.72 ? '1' : '0'
        if (wishRef.current) wishRef.current.style.opacity = finale > 0.8 ? '1' : '0'
      }
    }

    const beginCommit = () => {
      if (commit) return
      const isLast = index >= last || paths.length <= 1
      commit = 1
      commitT = 0
      mode = reducedMotion ? 'arrival' : isLast ? 'accelerate' : MODES[index % MODES.length]
      corner = pointerX < canvas.clientWidth / 2 ? -1 : 1
      imgB.src = isLast ? srcAt(index) : srcAt(index + 1)
      imgB.style.opacity = '0'
      driveWhoosh()
      egg = 0
      showMark(false)
      if (isLast) {
        finaleLive = true
        finale = 0
        const { w, h } = fit()
        seedFinale(picture, w, h)
        imgA.style.opacity = '0'
        imgB.style.opacity = '0'
      }
    }

    const finishCommit = () => {
      if (finaleLive) {
        commit = 0
        energy = 0
        held = false
        engaged = false
        setDriveLevel(0)
        onFinale?.()
        return
      }
      index = Math.min(last, index + 1)
      imgA.src = srcAt(index)
      imgB.src = srcAt(index + 1)
      loadPic(srcAt(index), (image) => {
        picture = image
      })
      commit = 0
      commitT = 0
      energy = 0
      idleVisual()
      stage.style.setProperty('--drive-dark', '0')
    }

    const onDown = (event: PointerEvent) => {
      if (finaleLive || commit) return
      if (event.pointerType === 'touch' && event.button) return
      const rect = canvas.getBoundingClientRect()
      startX = event.clientX - rect.left
      startY = event.clientY - rect.top
      pointerX = startX
      pointerY = startY
      headX = startX
      headY = startY
      pulseX = startX
      pulseY = startY
      startAt = performance.now()
      pointerId = event.pointerId
      held = true
      engaged = false
      flips = 0
      lastDir = 0
      extrema = startX
      pulse = 1
      driveClick()
    }

    const onMove = (event: PointerEvent) => {
      if (!held) return
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (!engaged) {
        if (Math.abs(y - startY) > 16 && Math.abs(y - startY) > Math.abs(x - startX) + 4) {
          held = false
          energy = 0
          return
        }
        return
      }
      event.preventDefault()
      pointerX = x
      pointerY = y
      const dir = Math.sign(x - extrema)
      if (dir !== 0 && dir !== lastDir && Math.abs(x - extrema) > 36) {
        flips += 1
        lastDir = dir
        extrema = x
      }
    }

    const onUp = () => {
      if (!held) return
      held = false
      engaged = false
      stage.style.touchAction = 'pan-y'
      if (energy >= COMMIT) {
        beginCommit()
        return
      }
      if (flips >= 2 && energy > 0.42 && energy < 0.78) {
        mark = 1
      }
      driveClick()
    }

    let lastTs = performance.now()
    const tick = (now: number) => {
      if (dead) return
      raf = requestAnimationFrame(tick)
      if (!visible && energy < 0.001 && !commit && !finaleLive) {
        setDriveLevel(0)
        return
      }
      const dt = Math.min(0.048, (now - lastTs) / 1000)
      lastTs = now
      const { w, h } = fit()

      if (held && !engaged && now - startAt > ENGAGE) {
        engaged = true
        stage.style.touchAction = 'none'
        try {
          stage.setPointerCapture(pointerId)
        } catch {
          /* already released */
        }
      }

      if (finaleLive) {
        finale = Math.min(1, finale + dt / 4.2)
        energy = Math.min(1, energy + dt * 0.2)
        pulse *= 0.9
        mark *= 0.9
        paint(w, h)
        setDriveLevel(Math.max(0, 1 - finale))
        if (finale >= 1) finishCommit()
        return
      }

      if (commit) {
        commitT = Math.min(1, commitT + dt / (mode === 'arrival' ? 1.7 : 1.15))
        applyCommit(commitT, w)
        energy = Math.max(energy, 0.7)
        pulse *= 0.9
        paint(w, h)
        setDriveLevel(1 - commitT * 0.6)
        if (commitT >= 1) finishCommit()
        return
      }

      if (reducedMotion) {
        if (held && engaged) energy = Math.min(1, energy + dt * 2.4)
        else energy = Math.max(0, energy - dt * 3)
        pulse *= 0.9
        paint(w, h)
        if (held && engaged && energy > 0.55) beginCommit()
        return
      }

      if (held && engaged) energy = Math.min(1, energy + dt * RISE)
      else energy = Math.max(0, energy - dt * FALL)

      pulse *= Math.exp(-dt * 3.2)
      mark *= Math.exp(-dt * 2.4)
      if (energy > 0.8) {
        egg = Math.min(1, egg + dt * 4)
        if (egg > 0.15 && egg < 0.95) showMark(true)
      } else {
        egg = Math.max(0, egg - dt * 6)
        if (egg < 0.08) showMark(false)
      }

      if (energy >= COMMIT && held) beginCommit()

      applySpool(w, h)
      paint(w, h)
      setDriveLevel(energy)
    }

    idleVisual()
    fit()
    raf = requestAnimationFrame(tick)

    const down = (event: PointerEvent) => onDown(event)
    const move = (event: PointerEvent) => onMove(event)
    const up = () => onUp()
    stage.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
      },
      { threshold: 0.12 },
    )
    io.observe(root)

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      setDriveLevel(0)
      io.disconnect()
      stage.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [photos, reducedMotion, onFinale])

  return (
    <section className="chapter drive" id="ahead" data-chapter="ahead" ref={rootRef}>
      <div className="drive-stage" ref={stageRef}>
        <img ref={aRef} className="drive-layer" alt={gift.firstName} />
        <img ref={bRef} className="drive-layer drive-next" alt="" />
        <canvas ref={canvasRef} className="drive-fx" />
        <span className="drive-invite" ref={inviteRef} aria-hidden="true" />
        <p className="drive-whisper" ref={whisperRef}>
          {gift.ahead.line}
        </p>
        <span className="drive-mark" ref={markRef} aria-hidden="true">
          SEND
        </span>
        <p className="drive-sig" ref={nameRef}>
          {gift.firstName}
        </p>
        <p className="drive-sig drive-wish" ref={wishRef}>
          Happy Birthday
        </p>
      </div>
    </section>
  )
}
