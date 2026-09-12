import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  decideFrame,
  frameBox,
  hintFor,
  inspectImage,
  motionFor,
  type FitKind,
  type MotionKind,
  type PictureArt,
  type StageKind,
} from '../lib/picture'

type Props = {
  src: string
  alt?: string
  index?: number
  priority?: boolean
  className?: string
  onArt?: (art: PictureArt) => void
  bleed?: boolean
}

export function Shot({ src, alt = '', index = 0, priority = false, className = '', onArt, bleed = false }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [art, setArt] = useState<PictureArt | null>(null)
  const [fit, setFit] = useState<FitKind>('contain')
  const [stage, setStage] = useState<StageKind>('dark')
  const [motion, setMotion] = useState<MotionKind>('push')
  const [glow, setGlow] = useState('#0c0a09')
  const [box, setBox] = useState({ x: 0, y: 0, dw: 0, dh: 0 })

  useEffect(() => {
    const image = new Image()
    image.decoding = priority ? 'sync' : 'async'
    image.onload = () => {
      const next = inspectImage(image, src)
      setArt(next)
      setMotion(motionFor(next, index))
      onArt?.(next)
      const node = root.current?.getBoundingClientRect()
      if (node) {
        const frame = decideFrame(next, node.width, node.height)
        setFit(frame.fit)
        setStage(frame.stage)
        setGlow(frame.glow)
        setBox(frameBox(next, node.width, node.height, frame.fit, frame.focalX, frame.focalY))
      }
    }
    image.src = src
  }, [index, onArt, priority, src])

  useEffect(() => {
    const node = root.current
    if (!node || !art) return
    const ro = new ResizeObserver(([entry]) => {
      const frame = decideFrame(art, entry.contentRect.width, entry.contentRect.height)
      setFit(frame.fit)
      setStage(frame.stage)
      setGlow(frame.glow)
      setBox(frameBox(art, entry.contentRect.width, entry.contentRect.height, frame.fit, frame.focalX, frame.focalY))
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [art])

  const cover = bleed || fit === 'cover'
  const hint = art ? hintFor(art.src) : undefined
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  const fx = (narrow && hint?.mobileFocalX != null ? hint.mobileFocalX : art?.focalX) ?? 0.5
  const fy = (narrow && hint?.mobileFocalY != null ? hint.mobileFocalY : art?.focalY) ?? 0.42

  return (
    <div
      ref={root}
      className={`shot is-${bleed ? 'cover' : fit} is-stage-${stage} ${className}`}
      data-motion={motion}
      style={
        {
          '--fx': `${fx * 100}%`,
          '--fy': `${fy * 100}%`,
          '--glow': glow,
        } as CSSProperties
      }
    >
      <div className="shot-atmosphere" aria-hidden="true" />
      <div
        className="shot-frame"
        style={
          cover
            ? undefined
            : {
                left: box.dw ? box.x : undefined,
                top: box.dh ? box.y : undefined,
                width: box.dw || undefined,
                height: box.dh || undefined,
              }
        }
      >
        <img
          className="shot-photo"
          src={src}
          alt={alt}
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  )
}
