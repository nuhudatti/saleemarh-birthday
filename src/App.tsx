import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gift, type ChapterId } from './data/saleemarh'
import { useLenis } from './hooks/useLenis'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { getGiftMedia, isOpeningCake, isRealmVideo, namedVideo, openingVideoPaths } from './lib/media'
import { curateGiftPhotos } from './lib/sequence'
import { setSound, softChime, unlockSound } from './lib/sound'
import { Arrival } from './experience/Arrival'
import { HeroRealm } from './experience/HeroRealm'
import { Film } from './experience/Film'
import { Datti } from './experience/Datti'
import { ForYou } from './experience/ForYou'
import { Grain, Progress, Vignette, Viewer } from './experience/GiftChrome'
import { NameLight } from './experience/NameLight'
import { Portrait } from './experience/Portrait'
import { VideoFilm } from './experience/VideoFilm'

export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const { photos: allPhotos, videos, ambient } = getGiftMedia()
  const beginSrc = namedVideo(videos, ['begin', 'beging', 'begins'])?.src ?? openingVideoPaths.begin
  const heroSrc = namedVideo(videos, ['hero'])?.src ?? openingVideoPaths.hero
  const laterVideos = videos.filter((video) => !isRealmVideo(video.src))
  const storyPhotos = useMemo(
    () => allPhotos.filter((photo) => !isOpeningCake(photo.src)),
    [allPhotos],
  )
  const heroRef = useRef<HTMLVideoElement>(null)
  const [filmPhotos, setFilmPhotos] = useState(storyPhotos)
  const [lensPhotos, setLensPhotos] = useState(storyPhotos)
  const [open, setOpen] = useState(false)
  const [chapter, setChapter] = useState<ChapterId>('her')
  const [progress, setProgress] = useState(0)
  const [viewer, setViewer] = useState<string | null>(null)
  const lastPhoto = filmPhotos[filmPhotos.length - 1] ?? allPhotos[0]

  useLenis(open, reducedMotion)

  useEffect(() => {
    if (!open) return
    let dead = false
    void curateGiftPhotos(storyPhotos).then((seq) => {
      if (dead) return
      setFilmPhotos(seq.film)
      setLensPhotos(seq.lens.length ? seq.lens : seq.film)
    })
    return () => {
      dead = true
    }
  }, [open, storyPhotos])

  useEffect(() => {
    document.body.classList.toggle('is-locked', !open)
    return () => document.body.classList.remove('is-locked')
  }, [open])

  useEffect(() => {
    if (!open) return
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'))
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        const id = visible?.target.getAttribute('data-chapter') as ChapterId | null
        if (id) setChapter(id)
      },
      { threshold: [0.2, 0.45], rootMargin: '-20% 0px -40% 0px' },
    )
    nodes.forEach((node) => io.observe(node))
    return () => io.disconnect()
  }, [open, filmPhotos.length, lensPhotos.length, videos.length])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max <= 0 ? 0 : window.scrollY / max)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [open])

  const begin = useCallback(async () => {
    const hero = heroRef.current
    if (hero) {
      hero.muted = false
      void hero.play().catch(() => {
        hero.muted = true
        void hero.play().catch(() => undefined)
      })
    }
    await unlockSound()
    setSound(true, ambient)
    softChime()
    setOpen(true)
  }, [ambient])

  return (
    <div className="gift">
      <Grain />
      <Vignette />
      <Progress value={progress} chapter={chapter} visible={open} />
      {heroSrc ? (
        <HeroRealm src={heroSrc} active={open} reducedMotion={reducedMotion} videoRef={heroRef} />
      ) : null}
      {!open ? (
        <Arrival photo={allPhotos[0]} beginSrc={beginSrc} open={open} onBegin={() => void begin()} />
      ) : (
        <main>
          <Film photos={filmPhotos} reducedMotion={reducedMotion} onOpen={setViewer} />
          <VideoFilm videos={laterVideos} />
          <Portrait photos={lensPhotos} reducedMotion={reducedMotion} />
          <NameLight photo={lastPhoto} reducedMotion={reducedMotion} />
          <ForYou photo={lastPhoto} />
          <Datti />
        </main>
      )}
      {viewer ? (
        <Viewer src={viewer} alt={gift.firstName} onClose={() => setViewer(null)} />
      ) : null}
    </div>
  )
}
