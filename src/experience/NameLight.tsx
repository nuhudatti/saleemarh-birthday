import { useEffect, useRef } from 'react'
import type { Photo } from '../lib/media'
import { gift } from '../data/saleemarh'
import { frameDraw, inspectImage } from '../lib/picture'

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

function sampleText(width: number, height: number, text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return [] as { x: number; y: number }[]
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const size = Math.min(width * 0.18, 150)
  ctx.font = `italic 500 ${size}px "Playfair Display", serif`
  ctx.fillText(text, width / 2, height * 0.46)
  const data = ctx.getImageData(0, 0, width, height).data
  const points: { x: number; y: number }[] = []
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      if (data[(y * width + x) * 4 + 3] > 60) points.push({ x, y })
    }
  }
  return points
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  frameDraw(ctx, image, width, height, inspectImage(image, image.src))
}

function samplePhoto(image: HTMLImageElement, width: number, height: number, count: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return [] as Speck[]
  coverDraw(ctx, image, width, height)
  const data = ctx.getImageData(0, 0, width, height).data
  const pool: Speck[] = []
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r + g + b > 70) {
        pool.push({ x, y, ox: x, oy: y, tx: x, ty: y, r, g, b, s: 2.1 + Math.random() })
      }
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

export function NameLight({
  photo,
  reducedMotion,
}: {
  photo?: Photo
  reducedMotion: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wordRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const word = wordRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let dead = false
    let raf = 0
    const specks: Speck[] = []
    let progress = reducedMotion ? 1 : 0
    let picture: HTMLImageElement | undefined

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { width, height }
    }

    const seed = (image?: HTMLImageElement) => {
      const { width, height } = size()
      const targets = sampleText(width, height, gift.firstName)
      const origins = image
        ? samplePhoto(image, width, height, Math.min(900, targets.length))
        : targets.map((point) => ({
            ...point,
            ox: point.x,
            oy: point.y,
            tx: point.x,
            ty: point.y,
            r: 201,
            g: 165,
            b: 106,
            s: 2,
          }))
      specks.length = 0
      const n = Math.min(targets.length, origins.length, window.matchMedia('(pointer: coarse)').matches ? 360 : 880)
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

    const onScroll = () => {
      const section = canvas.closest('.wow')
      if (!section) return
      const rect = section.getBoundingClientRect()
      const span = Math.max(1, section.clientHeight - window.innerHeight)
      progress = reducedMotion ? 1 : Math.min(1, Math.max(0, -rect.top / span))
      if (word) word.classList.toggle('show', progress > 0.76)
    }

    const ease = (t: number) => 1 - (1 - t) ** 3

    const draw = () => {
      if (dead) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.clearRect(0, 0, width, height)

      const photoFade = Math.max(0, 1 - progress / 0.28)
      const gather = ease(Math.min(1, Math.max(0, (progress - 0.16) / 0.52)))
      const ghost = Math.max(0, (progress - 0.8) / 0.2)

      if (picture && (photoFade > 0.02 || ghost > 0)) {
        ctx.save()
        ctx.globalAlpha = Math.max(photoFade * 0.95, ghost * 0.18)
        coverDraw(ctx, picture, width, height)
        ctx.restore()
      }

      const speckleAlpha = Math.min(1, Math.max(0, (progress - 0.08) / 0.12))
      if (speckleAlpha > 0) {
        for (const speck of specks) {
          speck.x = speck.ox + (speck.tx - speck.ox) * gather
          speck.y = speck.oy + (speck.ty - speck.oy) * gather
          ctx.fillStyle = `rgba(${speck.r},${speck.g},${speck.b},${0.92 * speckleAlpha})`
          ctx.fillRect(speck.x, speck.y, speck.s, speck.s)
        }
      }

      raf = requestAnimationFrame(draw)
    }

    const boot = (image?: HTMLImageElement) => {
      picture = image
      seed(image)
      onScroll()
      raf = requestAnimationFrame(draw)
    }

    const onResize = () => seed(picture)

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    if (photo) {
      const image = new Image()
      image.onload = () => {
        if (!dead) boot(image)
      }
      image.onerror = () => {
        if (!dead) boot()
      }
      image.src = photo.src
    } else {
      boot()
    }

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [photo, reducedMotion])

  return (
    <section className="chapter wow" id="light" data-chapter="light">
      <div className="wow-stage">
        <canvas ref={canvasRef} />
        <p className="wow-word" ref={wordRef}>
          <span>{gift.birthday.hello}</span>
          <span>{gift.birthday.name}</span>
        </p>
      </div>
    </section>
  )
}
