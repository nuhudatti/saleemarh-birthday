declare module 'virtual:gift-media' {
  export const giftMedia: {
    photos: string[]
    videos: string[]
    audio: string[]
  }
  export const giftArt: Record<
    string,
    { focalX?: number; focalY?: number; scale?: number; fit?: 'contain' | 'cover'; motion?: string }
  >
}
