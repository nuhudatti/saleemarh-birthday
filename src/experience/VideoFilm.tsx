import { useEffect, useRef, useState } from 'react'
import type { Video } from '../lib/media'

function VideoShot({ video }: { video: Video }) {
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
      { threshold: 0.4 },
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
    <article className="video-shot">
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
        <button type="button" className="play" aria-label="Play" onClick={toggle} />
      ) : null}
      <div className="video-tools">
        <button
          type="button"
          onClick={() => {
            const node = ref.current
            const next = !loud
            setLoud(next)
            if (node) node.muted = !next
          }}
        >
          {loud ? 'sound on' : 'sound'}
        </button>
      </div>
    </article>
  )
}

export function VideoFilm({ videos }: { videos: Video[] }) {
  if (!videos.length) return null

  return (
    <section className="chapter video-film" id="moments" data-chapter="moments">
      {videos.map((video) => (
        <VideoShot key={video.src} video={video} />
      ))}
    </section>
  )
}
