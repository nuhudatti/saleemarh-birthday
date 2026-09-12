import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react'
import { gift } from '../data/saleemarh'

type Props = {
  src: string
  active: boolean
  reducedMotion: boolean
  videoRef?: Ref<HTMLVideoElement | null>
}

export function HeroRealm({ src, active, reducedMotion, videoRef }: Props) {
  const stage = useRef<HTMLElement>(null)
  const inner = useRef<HTMLVideoElement>(null)
  const spent = useRef(false)
  const [hint, setHint] = useState(true)
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 720))

  const setVideo = (node: HTMLVideoElement | null) => {
    inner.current = node
    if (typeof videoRef === 'function') videoRef(node)
    else if (videoRef) videoRef.current = node
  }

  useEffect(() => {
    const node = inner.current
    if (!node || !active) return
    node.playsInline = true
    node.loop = false
    if (!spent.current) node.muted = false
    void node.play().catch(() => {
      node.muted = true
      return node.play().catch(() => undefined)
    })
  }, [active, src])

  useEffect(() => {
    const onSize = () => setWide(window.innerWidth >= 720)
    onSize()
    window.addEventListener('resize', onSize)
    return () => window.removeEventListener('resize', onSize)
  }, [])

  useEffect(() => {
    if (!active) return
    setHint(true)
    let armed = false
    const arm = window.setTimeout(() => {
      armed = true
    }, 640)
    const onScroll = () => {
      const node = stage.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const travel = Math.max(1, rect.height - window.innerHeight)
      const p = Math.max(0, Math.min(1, -rect.top / travel))
      node.style.setProperty('--hero-p', p.toFixed(4))
      if (armed) setHint(p < 0.14)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(arm)
      window.removeEventListener('scroll', onScroll)
    }
  }, [active])

  const hush = () => {
    const node = inner.current
    if (!node) return
    spent.current = true
    node.dataset.spent = '1'
    node.muted = true
    node.loop = true
    if (node.currentTime > 0) node.currentTime = 0
    void node.play().catch(() => undefined)
  }

  const onMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!active || reducedMotion) return
    const node = stage.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5
    node.style.setProperty('--hx', x.toFixed(3))
    node.style.setProperty('--hy', y.toFixed(3))
  }

  const onLeave = () => {
    const node = stage.current
    if (!node) return
    node.style.setProperty('--hx', '0')
    node.style.setProperty('--hy', '0')
  }

  return (
    <section
      ref={stage}
      className={`hero-realm${active ? ' is-live' : ' is-wait'}${wide ? ' is-wide' : ' is-narrow'}`}
      data-chapter="her"
      aria-hidden={!active}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="hero-realm-stick">
        <video
          ref={setVideo}
          className="hero-realm-film"
          src={src}
          playsInline
          preload="auto"
          autoPlay={active}
          muted={!active || spent.current}
          onEnded={hush}
        />
        <div className="hero-realm-edge" aria-hidden="true" />
        <div className="hero-sheen" aria-hidden="true" />
        <div className="hero-dust" aria-hidden="true" />
        {active ? (
          <div className="hero-copy">
            <p className="hero-soft">Still</p>
            <p className="hero-hard">
              becoming
              <span className="hero-dots" aria-hidden="true">
                <i>.</i>
                <i>.</i>
                <i>.</i>
              </span>
            </p>
            <p className="hero-aside">
              {gift.aside.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
            <p className="hero-wish">{gift.birthday.wish}</p>
          </div>
        ) : null}
        {active && hint ? (
          <button
            type="button"
            className="hero-scroll"
            aria-label="Continue"
            onClick={() => {
              const next = document.querySelector('main')
              next?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
            }}
          >
            <span className="hero-scroll-mark" aria-hidden="true">
              <span className="hero-scroll-stem" />
              <span className="hero-scroll-chevron" />
            </span>
          </button>
        ) : null}
      </div>
    </section>
  )
}
