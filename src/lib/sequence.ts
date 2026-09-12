import type { Photo } from './media'
import {
  inspectImage,
  loadImage,
  pairRelation,
  segmentWeight,
  type PairRelation,
  type PictureArt,
} from './picture'

export type GiftBeat = {
  photo: Photo
  art: PictureArt
  role: 'scene' | 'echo'
  relationIn: PairRelation
}

export type GiftSequence = {
  film: Photo[]
  lens: Photo[]
  beats: GiftBeat[]
}

export async function curateGiftPhotos(photos: Photo[]): Promise<GiftSequence> {
  const arts = await Promise.all(
    photos.map(async (photo) => {
      const image = await loadImage(photo.src)
      return inspectImage(image, photo.src)
    }),
  )

  const beats: GiftBeat[] = []
  const film: Photo[] = []
  const lens: Photo[] = []

  photos.forEach((photo, index) => {
    const art = arts[index]
    const relationIn = index === 0 ? 'distinct' : pairRelation(arts[index - 1], art)
    if (relationIn === 'duplicate') return
    const role: GiftBeat['role'] = relationIn === 'memory' ? 'echo' : 'scene'
    beats.push({ photo, art, role, relationIn })
    film.push(photo)
    if (role === 'scene') lens.push(photo)
  })

  if (!film.length && photos[0]) {
    film.push(photos[0])
    lens.push(photos[0])
  }

  return { film, lens, beats }
}

export function beatWeight(beats: GiftBeat[], index: number) {
  const next = beats[index + 1]
  if (!next) return 1
  const last = index >= beats.length - 2
  const late = index >= beats.length - 3
  return segmentWeight(next.relationIn, last, late)
}
