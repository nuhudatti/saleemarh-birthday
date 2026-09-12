import { giftArt, giftMedia } from 'virtual:gift-media'
import { gift } from '../data/saleemarh'
import { fileName, isDemoMedia, setPictureHints, sortMedia, type PictureHint } from './picture'

function applyArt() {
  const next: Record<string, PictureHint> = {}
  for (const [key, value] of Object.entries(giftArt ?? {})) {
    next[key.split(/[/\\]/).pop() ?? key] = value as PictureHint
  }
  setPictureHints(next)
}

applyArt()

export type Photo = {
  src: string
  alt: string
  note: string
}

export type Video = {
  src: string
  poster?: string
}

function toPhotos(paths: string[]): Photo[] {
  return sortMedia(paths.filter((src) => !isDemoMedia(src))).map((src, index) => ({
    src,
    alt: gift.firstName,
    note: gift.photoNotes[index] ?? gift.firstName,
  }))
}

function toVideos(paths: string[], photos: string[]): Video[] {
  return sortMedia(paths.filter((src) => !isDemoMedia(src))).map((src, index) => ({
    src,
    poster: photos[index] ?? photos[0],
  }))
}

let cachedKey = ''
let cached = {
  photos: [] as Photo[],
  videos: [] as Video[],
  ambient: undefined as string | undefined,
}

export function getGiftMedia() {
  const key = `${giftMedia.photos.join('|')}::${giftMedia.videos.join('|')}::${giftMedia.audio.join('|')}::${JSON.stringify(giftArt)}`
  if (key === cachedKey) return cached
  cachedKey = key
  applyArt()
  cached = {
    photos: toPhotos(giftMedia.photos),
    videos: toVideos(giftMedia.videos, giftMedia.photos),
    ambient: giftMedia.audio[0],
  }
  return cached
}

function videoKey(src: string) {
  return fileName(src).replace(/\.[^.]+$/, '').toLowerCase()
}

export function namedVideo(videos: Video[], names: string[]) {
  return videos.find((video) => names.includes(videoKey(video.src)))
}

export function isRealmVideo(src: string) {
  const key = videoKey(src)
  return key === 'begin' || key === 'beging' || key === 'begins' || key === 'hero'
}

export const openingVideoPaths = {
  begin: '/media/videos/begins.mp4',
  hero: '/media/videos/hero.mp4',
}

export function isOpeningCake(src: string) {
  return fileName(src).replace(/\.[^.]+$/, '') === '01'
}
