import { useRef, type PointerEvent } from 'react'
import { gift } from '../data/saleemarh'
import type { Photo } from '../lib/media'
import { Shot } from './Shot'

export function ForYou({ photo }: { photo?: Photo }) {
  const root = useRef<HTMLElement>(null)

  const look = (event: PointerEvent<HTMLElement>) => {
    const node = root.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    node.style.setProperty('--lx', ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5).toFixed(3))
    node.style.setProperty('--ly', ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5).toFixed(3))
  }

  return (
    <section
      className="chapter for-you"
      id="you"
      data-chapter="you"
      ref={root}
      onPointerMove={look}
      onPointerLeave={() => {
        root.current?.style.setProperty('--lx', '0')
        root.current?.style.setProperty('--ly', '0')
      }}
    >
      {photo ? <Shot src={photo.src} alt="" className="for-you-shot" bleed /> : null}
      <div className="for-you-veil" />
      <div className="for-you-copy">
        <p className="close">{gift.birthday.close}</p>
      </div>
    </section>
  )
}
