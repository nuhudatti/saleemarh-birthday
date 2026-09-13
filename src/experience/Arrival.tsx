import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import type { Photo } from '../lib/media'

type Props = {
  photo?: Photo
  beginSrc?: string
  open: boolean
  onBegin: () => void
}

type CakeArt = {
  width: number
  height: number
  plateX: number
  plateY: number
  plateW: number
  plateH: number
  cakeX: number
  cakeY: number
  glow: string
  rim: string
}

type Frame = {
  x: number
  y: number
  w: number
  h: number
  viewW: number
  viewH: number
  buttonW: number
  buttonH: number
}

type Phase = 'boot' | 'armed' | 'reveal' | 'live'

function beginBox(frame: Frame): CSSProperties {
  const shelf = frame.viewH - (frame.y + frame.h)
  return {
    left: '50%',
    top: frame.y + frame.h + Math.max(8, (shelf - frame.buttonH) / 2),
    width: frame.buttonW,
    height: frame.buttonH,
    transform: 'translateX(-50%)',
  }
}

function inspectCake(image: HTMLImageElement): CakeArt {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const fallback: CakeArt = {
    width,
    height,
    plateX: 0.5,
    plateY: 0.51,
    plateW: 0.94,
    plateH: 0.96,
    cakeX: 0.49,
    cakeY: 0.36,
    glow: 'rgb(42, 26, 18)',
    rim: 'rgba(236, 224, 206, 0.48)',
  }

  const sw = 120
  const sh = Math.max(1, Math.round((height / Math.max(1, width)) * sw))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback

  ctx.drawImage(image, 0, 0, sw, sh)
  const data = ctx.getImageData(0, 0, sw, sh).data

  let px = 0
  let py = 0
  let pn = 0
  let pMinX = sw
  let pMaxX = 0
  let pMinY = sh
  let pMaxY = 0
  let cx = 0
  let cy = 0
  let cn = 0
  let wr = 0
  let wg = 0
  let wb = 0
  let wn = 0

  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < sw; x += 1) {
      const i = (y * sw + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const sat = max === 0 ? 0 : (max - min) / max

      if (lum > 150 && sat < 0.28) {
        pn += 1
        px += x
        py += y
        pMinX = Math.min(pMinX, x)
        pMaxX = Math.max(pMaxX, x)
        pMinY = Math.min(pMinY, y)
        pMaxY = Math.max(pMaxY, y)
        wr += r
        wg += g
        wb += b
        wn += 1
      } else if (lum < 92 && r > 28 && r >= g && r > b && y < sh * 0.62) {
        cn += 1
        cx += x
        cy += y
        wr += r * 1.6
        wg += g * 0.9
        wb += b * 0.45
        wn += 1.6
      }
    }
  }

  if (pn > 20) {
    fallback.plateX = px / pn / sw
    fallback.plateY = py / pn / sh
    fallback.plateW = Math.min(1, (pMaxX - pMinX + 1) / sw + 0.03)
    fallback.plateH = Math.min(1, (pMaxY - pMinY + 1) / sh + 0.03)
  }
  if (cn > 12) {
    fallback.cakeX = cx / cn / sw
    fallback.cakeY = cy / cn / sh
  }

  if (wn > 0) {
    const r = wr / wn
    const g = wg / wn
    const b = wb / wn
    fallback.glow = `rgb(${Math.round(r * 0.2 + 12 * 0.8)}, ${Math.round(g * 0.14 + 9 * 0.86)}, ${Math.round(b * 0.08 + 8 * 0.92)})`
    fallback.rim = `rgba(${Math.min(255, Math.round(r * 0.55 + 120))}, ${Math.min(255, Math.round(g * 0.5 + 110))}, ${Math.min(255, Math.round(b * 0.4 + 96))}, 0.5)`
  }

  return fallback
}

function composeOpening(art: CakeArt, viewW: number, viewH: number): Frame {
  const mobile = viewW < 720
  const buttonH = mobile ? 64 : 68
  const buttonW = Math.min(viewW - 56, mobile ? 176 : 200)
  const shelf = buttonH + (mobile ? 44 : 52)
  const maxW = viewW * (mobile ? 0.78 : 0.4)
  const maxH = Math.max(180, viewH - shelf - (mobile ? 36 : 48))
  const scale = Math.min(maxW / art.width, maxH / art.height)
  const w = art.width * scale
  const h = art.height * scale
  const x = (viewW - w) / 2
  const y = Math.max(16, (viewH - shelf - h) * (mobile ? 0.2 : 0.36))
  return { x, y, w, h, viewW, viewH, buttonW, buttonH }
}

async function decodeCake(src: string) {
  const image = new Image()
  image.decoding = 'async'
  image.fetchPriority = 'high'
  image.src = src
  if (typeof image.decode === 'function') {
    try {
      await image.decode()
      return image
    } catch {
      /* fall through to load event */
    }
  }
  if (image.complete && image.naturalWidth) return image
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('cake'))
  })
  return image
}

export function Arrival({ photo, beginSrc, open, onBegin }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const root = useRef<HTMLElement>(null)
  const beginFilm = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('boot')
  const [art, setArt] = useState<CakeArt | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const src = photo?.src

  const measure = useCallback(
    (nextArt: CakeArt) => {
      const node = root.current
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return composeOpening(nextArt, rect.width, rect.height)
    },
    [],
  )

  useEffect(() => {
    if (!src) return
    let dead = false
    void decodeCake(src)
      .then((image) => {
        if (dead) return
        const nextArt = inspectCake(image)
        setArt(nextArt)
        const nextFrame = measure(nextArt) ?? composeOpening(nextArt, window.innerWidth, window.innerHeight)
        setFrame(nextFrame)
        setPhase('armed')
      })
      .catch(() => {
        if (!dead) setPhase('live')
      })
    return () => {
      dead = true
    }
  }, [measure, src])

  useEffect(() => {
    if (phase !== 'armed' || !frame) return
    const id = requestAnimationFrame(() => {
      setPhase(reducedMotion ? 'live' : 'reveal')
    })
    return () => cancelAnimationFrame(id)
  }, [frame, phase, reducedMotion])

  useEffect(() => {
    if (phase !== 'reveal') return
    const t = window.setTimeout(() => setPhase('live'), 1680)
    return () => window.clearTimeout(t)
  }, [phase])

  useEffect(() => {
    const node = beginFilm.current
    if (!node || !beginSrc) return

    node.defaultMuted = true
    node.muted = true
    node.playsInline = true
    node.setAttribute('muted', '')
    node.setAttribute('playsinline', '')
    node.setAttribute('webkit-playsinline', 'true')
    node.setAttribute('autoplay', '')

    const play = () => {
      if (node.paused) void node.play().catch(() => undefined)
    }

    play()
    node.addEventListener('loadedmetadata', play)
    node.addEventListener('loadeddata', play)
    node.addEventListener('canplay', play)
    node.addEventListener('canplaythrough', play)
    const onVisible = () => {
      if (document.visibilityState === 'visible') play()
    }
    document.addEventListener('visibilitychange', onVisible)
    const retry = window.setInterval(play, 400)
    const stop = window.setTimeout(() => window.clearInterval(retry), 8000)

    return () => {
      node.removeEventListener('loadedmetadata', play)
      node.removeEventListener('loadeddata', play)
      node.removeEventListener('canplay', play)
      node.removeEventListener('canplaythrough', play)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(retry)
      window.clearTimeout(stop)
    }
  }, [beginSrc])

  useEffect(() => {
    if (!art) return
    const node = root.current
    if (!node) return
    const ro = new ResizeObserver(() => {
      const next = measure(art)
      if (next) setFrame(next)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [art, measure])

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (phase !== 'live' || reducedMotion) return
    if ((event.target as HTMLElement | null)?.closest?.('.opening-begin')) return
    const node = root.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const nx = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2
    const ny = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2
    setTilt({
      x: Math.max(-1, Math.min(1, nx)),
      y: Math.max(-1, Math.min(1, ny)),
    })
  }

  const onPointerLeave = () => setTilt({ x: 0, y: 0 })

  const ox = `${(art?.cakeX ?? 0.49) * 100}%`
  const oy = `${(art?.cakeY ?? 0.36) * 100}%`
  const ready = Boolean(art && frame)

  return (
    <section
      ref={root}
      id="arrival"
      className={`opening is-${phase}`}
      aria-busy={phase === 'boot'}
      onPointerDown={() => {
        const node = beginFilm.current
        if (!node || !node.paused) return
        node.muted = true
        void node.play().catch(() => undefined)
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={
        {
          '--ox': ox,
          '--oy': oy,
          '--cake-glow': art?.glow ?? 'rgb(42, 26, 18)',
          '--cake-rim': art?.rim ?? 'rgba(236, 224, 206, 0.48)',
          '--photo-w': frame ? `${frame.w}px` : '0px',
          '--lx': `${50 + tilt.x * 3.2}%`,
          '--ly': `${46 + tilt.y * 2.4}%`,
        } as CSSProperties
      }
    >
      {beginSrc ? (
        <video
          ref={beginFilm}
          className="opening-world"
          src={beginSrc}
          playsInline
          loop
          muted
          preload="auto"
          autoPlay
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
        />
      ) : (
        <div className="opening-night" aria-hidden="true" />
      )}
      <div className="opening-world-veil" aria-hidden="true" />
      {ready && art && frame ? (
        <div
          className="opening-stage"
          aria-hidden="true"
          style={{
            transform: `translate3d(${tilt.x * 2.4}px, ${tilt.y * 1.8}px, 0) rotateX(${-tilt.y * 0.42}deg) rotateY(${tilt.x * 0.5}deg)`,
          }}
        >
          <div className="opening-aura" />
          <div
            className="opening-rest"
            style={{
              left: frame.x,
              top: frame.y,
              width: frame.w,
              height: frame.h,
            }}
          >
            <div className="opening-back" aria-hidden="true" />
            <figure className="opening-frame">
            <img
              className="opening-print"
              src={src}
              alt=""
              width={art.width}
              height={art.height}
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
            <svg className="opening-trace" viewBox="0 0 100 100" preserveAspectRatio="none">
              <ellipse
                cx={art.plateX * 100}
                cy={art.plateY * 100}
                rx={art.plateW * 46}
                ry={art.plateH * 46}
                pathLength="100"
              />
            </svg>
          </figure>
          </div>
        </div>
      ) : null}
      {!open ? (
        <button
          type="button"
          className="opening-begin"
          style={frame ? beginBox(frame) : undefined}
          onClick={() => {
            beginFilm.current?.pause()
            onBegin()
          }}
          tabIndex={phase === 'live' ? 0 : -1}
          aria-hidden={phase !== 'live'}
        >
          <span className="opening-begin-glow" aria-hidden="true" />
          <span className="opening-begin-ring" aria-hidden="true" />
          <span className="opening-begin-word">Begin</span>
        </button>
      ) : null}
    </section>
  )
}
