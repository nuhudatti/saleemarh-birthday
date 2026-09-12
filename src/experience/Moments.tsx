import { useEffect, useRef, useState } from 'react'
import { gift } from '../data/saleemarh'
import type { Photo, Video } from '../lib/media'

type Props = {
  photos: Photo[]
  videos: Video[]
  onOpen: (src: string) => void
}

function VideoCard({ video }: { video: Video }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [loud, setLoud] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.muted = true
          void node.play().catch(() => undefined)
        } else {
          node.pause()
          setPlaying(false)
        }
      },
      { threshold: 0.45 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const toggle = () => {
    const node = ref.current
    if (!node) return
    if (node.paused) {
      void node.play()
      setPlaying(true)
    } else {
      node.pause()
      setPlaying(false)
    }
  }

  return (
    <article className="video-scene">
      <video
        ref={ref}
        src={video.src}
        poster={video.poster}
        playsInline
        loop
        muted={!loud}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {!playing ? (
        <button type="button" className="play" aria-label="Play video" onClick={toggle} />
      ) : null}
      <div className="video-tools">
        <button type="button" onClick={toggle}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            const node = ref.current
            const next = !loud
            setLoud(next)
            if (node) node.muted = !next
          }}
        >
          {loud ? 'Sound on' : 'Sound off'}
        </button>
        <button
          type="button"
          onClick={() => {
            const node = ref.current
            if (!node) return
            if (node.requestFullscreen) void node.requestFullscreen()
          }}
        >
          Full screen
        </button>
      </div>
    </article>
  )
}

export function Moments({ photos, videos, onOpen }: Props) {
  if (!photos.length && !videos.length) return null

  return (
    <section className="chapter moments" id="moments" data-chapter="moments">
      <h2>{gift.momentsLead}</h2>
      {photos.length ? (
        <div className="strip" aria-label="Photographs">
          {photos.map((photo) => (
            <button type="button" key={photo.src} onClick={() => onOpen(photo.src)}>
              <img src={photo.src} alt={photo.alt} loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      {videos.map((video) => (
        <VideoCard key={video.src} video={video} />
      ))}
    </section>
  )
}
