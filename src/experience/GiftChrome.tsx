import type { ChapterId } from '../data/saleemarh'

export function Grain() {
  return <div className="grain" aria-hidden="true" />
}

export function Vignette() {
  return <div className="vignette" aria-hidden="true" />
}

export function SoundToggle({
  on,
  visible,
  onToggle,
}: {
  on: boolean
  visible: boolean
  onToggle: () => void
}) {
  if (!visible) return null
  return (
    <button type="button" className="sound" aria-pressed={on} onClick={onToggle}>
      {on ? 'sound on' : 'sound'}
    </button>
  )
}

export function Progress({
  value,
  visible,
}: {
  value: number
  chapter: ChapterId
  visible: boolean
}) {
  if (!visible) return null
  return <div className="top-line" style={{ width: `${Math.min(100, value * 100)}%` }} />
}

export function Viewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button type="button" className="viewer-close" onClick={onClose}>
        Close
      </button>
      <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
    </div>
  )
}
