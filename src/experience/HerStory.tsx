import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { gift } from '../data/saleemarh'
import type { Photo } from '../lib/media'

gsap.registerPlugin(ScrollTrigger)

type Props = {
  photos: Photo[]
  reducedMotion: boolean
  onOpen: (src: string) => void
}

export function HerStory({ photos, reducedMotion, onOpen }: Props) {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    if (reducedMotion || !root.current || !photos.length) return
    const frames = root.current.querySelectorAll<HTMLElement>('[data-frame]')
    const tweens = Array.from(frames).map((frame) =>
      gsap.fromTo(
        frame,
        { scale: 1.16, clipPath: 'inset(10% 14%)' },
        {
          scale: 1,
          clipPath: 'inset(0% 0%)',
          ease: 'none',
          scrollTrigger: {
            trigger: frame.closest('.story-beat'),
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      ),
    )
    return () => {
      tweens.forEach((tween) => {
        tween.scrollTrigger?.kill()
        tween.kill()
      })
    }
  }, [photos, reducedMotion])

  if (!photos.length) {
    return (
      <section className="chapter her-words" id="her" data-chapter="her">
        {gift.story.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
    )
  }

  return (
    <section className="chapter" id="her" data-chapter="her" ref={root}>
      {photos.slice(0, gift.story.length).map((photo, index) => {
        const line = gift.story[index]
        return (
          <article className="story-beat" key={photo.src}>
            <div className="story-sticky">
              <button
                type="button"
                className="cover"
                data-frame
                onClick={() => onOpen(photo.src)}
                aria-label="View photograph"
              >
                <img src={photo.src} alt={photo.alt} />
              </button>
              <div className="arrival-veil" />
              <p className={index % 2 ? 'story-copy right' : 'story-copy'}>{line}</p>
            </div>
          </article>
        )
      })}
    </section>
  )
}
