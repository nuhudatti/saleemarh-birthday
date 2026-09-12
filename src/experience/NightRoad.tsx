import { useState } from 'react'
import { gift } from '../data/saleemarh'
import type { Photo } from '../lib/media'
import { softChime } from '../lib/sound'

type Props = {
  photo?: Photo
  onDrive: (driving: boolean) => void
}

export function NightRoad({ photo, onDrive }: Props) {
  const [down, setDown] = useState(false)

  const start = () => {
    setDown(true)
    onDrive(true)
    softChime()
  }

  const stop = () => {
    setDown(false)
    onDrive(false)
  }

  return (
    <section
      className={down ? 'chapter ahead is-held' : 'chapter ahead'}
      id="ahead"
      data-chapter="ahead"
    >
      {photo ? (
        <img className="drive-photo" src={photo.src} alt={photo.alt} />
      ) : (
        <div className="road-sky" aria-hidden="true" />
      )}
      <div className="glass" aria-hidden="true" />
      <div className="streaks" aria-hidden="true" />
      <div className="road">
        <div className="road-line" />
      </div>
      <div
        className="drive-pad"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        <p className="drive-line">{gift.ahead.line}</p>
        <span className="hold-hint">{down ? gift.ahead.held : gift.ahead.hold}</span>
      </div>
    </section>
  )
}
