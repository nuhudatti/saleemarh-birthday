export type MotionKind = 'push' | 'drift' | 'depth' | 'light' | 'reveal' | 'cross'
export type FitKind = 'contain' | 'cover'
export type StageKind = 'dark' | 'soft'
export type PairRelation = 'distinct' | 'memory' | 'duplicate'
export type TransitionKind = 'light' | 'color' | 'memory' | 'soft' | 'hold' | 'wipe-x' | 'wipe-y'
export type AccentKind = 'red' | 'light' | 'none'
export type EdgeHue = 'cool' | 'warm' | 'neutral'

export type PictureArt = {
  src: string
  width: number
  height: number
  aspect: number
  focalX: number
  focalY: number
  scale: number
  fit: FitKind
  fullFigure: boolean
  tallSubject: boolean
  hasFace: boolean
  motion: MotionKind
  tone: { r: number; g: number; b: number; lum: number }
  subject: { x0: number; y0: number; x1: number; y1: number }
  edgeSat: number
  edgeHue: EdgeHue
  accent: AccentKind
  print: number[]
}

export type FrameDecision = {
  fit: FitKind
  stage: StageKind
  focalX: number
  focalY: number
  glow: string
}

export type PictureHint = Partial<Pick<PictureArt, 'focalX' | 'focalY' | 'scale' | 'fit' | 'motion'>> & {
  mobileFocalX?: number
  mobileFocalY?: number
}

const DEMO_NAME = /(?:^|[._-])(demo|sample|placeholder|stock)(?:[._-]|$)/i
const cache = new Map<string, PictureArt>()
const hints: Record<string, PictureHint> = {}

export function fileName(src: string) {
  return decodeURIComponent(src.split('/').pop() ?? src)
}

export function isDemoMedia(src: string) {
  const name = fileName(src)
  return name.startsWith('_') || DEMO_NAME.test(name)
}

export function mediaSortKey(src: string): [number, number, string] {
  const base = fileName(src).replace(/\.[^.]+$/, '')
  const match = base.match(/^(\d+)(?:\.(\d+))?(.*)$/)
  if (!match) return [Number.POSITIVE_INFINITY, 0, base.toLowerCase()]
  return [Number(match[1]), Number(match[2] || 0), match[3].toLowerCase()]
}

export function sortMedia(paths: string[]) {
  return [...paths].sort((a, b) => {
    const ka = mediaSortKey(a)
    const kb = mediaSortKey(b)
    if (ka[0] !== kb[0]) return ka[0] - kb[0]
    if (ka[1] !== kb[1]) return ka[1] - kb[1]
    return ka[2].localeCompare(kb[2], undefined, { numeric: true })
  })
}

export function setPictureHints(next: Record<string, PictureHint>) {
  Object.assign(hints, next)
  cache.clear()
}

export function hintFor(src: string) {
  return hints[fileName(src)]
}

function sat(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function crushTone(tone: { r: number; g: number; b: number }, amount = 0.14) {
  return {
    r: Math.round(tone.r * amount + 12 * (1 - amount)),
    g: Math.round(tone.g * amount + 10 * (1 - amount)),
    b: Math.round(tone.b * Math.min(amount, 0.08) + 9 * (1 - Math.min(amount, 0.08))),
  }
}

export function decideFrame(art: PictureArt, viewW: number, viewH: number): FrameDecision {
  const forced = hintFor(art.src)?.fit
  const padX = art.fullFigure ? (viewH > viewW * 1.25 ? 0.05 : 0.1) : art.hasFace ? 0.06 : 0.05
  const padY = art.fullFigure ? 0.06 : art.hasFace ? 0.08 : 0.05
  const needW = Math.min(1, art.subject.x1 - art.subject.x0 + padX * 2)
  const needH = Math.min(1, art.subject.y1 - art.subject.y0 + padY * 2)
  const coverScale = Math.max(viewW / art.width, viewH / art.height)
  const visW = Math.min(1, viewW / (art.width * coverScale))
  const visH = Math.min(1, viewH / (art.height * coverScale))
  const short = viewH / Math.max(1, viewW) < 0.72
  const tallView = viewH / Math.max(1, viewW) > 1.35

  let fit: FitKind = 'contain'
  if (forced) fit = forced
  else if (!short && visW >= needW - 0.01 && visH >= needH - 0.01) fit = 'cover'
  else if (art.fullFigure && tallView && visH >= needH - 0.05 && visW >= Math.min(needW, 0.4)) fit = 'cover'

  if (fit === 'cover' && art.hasFace && (visW < 0.2 || visH < 0.24)) fit = 'contain'

  const coolEdge = art.edgeHue === 'cool' || art.edgeSat > 0.2 || art.tone.g > art.tone.r + 10
  const stage: StageKind = fit === 'cover' || coolEdge ? 'dark' : 'soft'
  const glowTone = crushTone(art.tone, stage === 'soft' ? 0.2 : 0.06)
  return {
    fit,
    stage,
    focalX: art.focalX,
    focalY: art.focalY,
    glow: `rgb(${glowTone.r}, ${glowTone.g}, ${glowTone.b})`,
  }
}

export function decideFit(art: PictureArt, viewW: number, viewH: number): FitKind {
  return decideFrame(art, viewW, viewH).fit
}

export function inspectImage(image: HTMLImageElement, src = image.src): PictureArt {
  const hit = cache.get(src)
  if (hit && hit.width === image.naturalWidth) return hit

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const aspect = width / Math.max(1, height)
  const sw = 80
  const sh = Math.max(48, Math.round((80 * height) / width))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const hint = hintFor(src)

  let focalX = 0.5
  let focalY = 0.42
  let fullFigure = height / width > 1.2
  let tallSubject = true
  let hasFace = false
  let tone = { r: 28, g: 24, b: 20, lum: 24 }
  let motion: MotionKind = 'push'
  let subject = { x0: 0.08, y0: 0.08, x1: 0.92, y1: 0.92 }
  let edgeSat = 0
  let edgeHue: EdgeHue = 'neutral'
  let accent: AccentKind = 'none'
  const print: number[] = []

  if (ctx) {
    ctx.drawImage(image, 0, 0, sw, sh)
    const pixels = ctx.getImageData(0, 0, sw, sh).data
    const sample = (x: number, y: number) => {
      const i = (y * sw + x) * 4
      return [pixels[i], pixels[i + 1], pixels[i + 2]] as const
    }

    let er = 0
    let eg = 0
    let eb = 0
    let en = 0
    let es = 0
    const edge = (x: number, y: number) => {
      const [r, g, b] = sample(x, y)
      er += r
      eg += g
      eb += b
      es += sat(r, g, b)
      en += 1
    }
    for (let y = 0; y < sh; y += 1) {
      edge(0, y)
      edge(1, y)
      edge(sw - 1, y)
      edge(sw - 2, y)
    }
    for (let x = 2; x < sw - 2; x += 1) {
      edge(x, 0)
      edge(x, 1)
      edge(x, sh - 1)
      edge(x, sh - 2)
    }
    const eR = er / Math.max(1, en)
    const eG = eg / Math.max(1, en)
    const eB = eb / Math.max(1, en)
    edgeSat = es / Math.max(1, en)
    if (eG > eR + 12 && eG > eB) edgeHue = 'cool'
    else if (eB > eR + 8 && eB >= eG - 12) edgeHue = 'cool'
    else if (eR > eB + 16 && eR > 70) edgeHue = 'warm'
    else edgeHue = 'neutral'

    const corners = [sample(1, 1), sample(sw - 2, 1), sample(1, sh - 2), sample(sw - 2, sh - 2)]
    const bg = corners.reduce(
      (acc, [r, g, b]) => {
        acc.r += r
        acc.g += g
        acc.b += b
        return acc
      },
      { r: 0, g: 0, b: 0 },
    )
    bg.r /= 4
    bg.g /= 4
    bg.b /= 4

    let minX = sw
    let minY = sh
    let maxX = 0
    let maxY = 0
    let sx = 0
    let sy = 0
    let sn = 0
    let fx = 0
    let fy = 0
    let fn = 0
    let tr = 0
    let tg = 0
    let tb = 0
    let redN = 0
    const n = sw * sh
    const col = new Array(sw).fill(0)
    const row = new Array(sh).fill(0)

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const [r, g, b] = sample(x, y)
        tr += r
        tg += g
        tb += b
        if (r > 110 && r > g + 18 && r > b + 12) redN += 1
        const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b)
        const skin = r > 90 && g > 38 && b > 18 && r > g && r > b && r - g > 12
        if (dist < 26 && !skin) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        sx += x
        sy += y
        sn += 1
        col[x] += 1
        row[y] += 1
        if (skin && y < sh * 0.42) {
          fx += x
          fy += y
          fn += 1
        }
      }
    }

    const band = (hist: number[], lo: number, hi: number) => {
      let peak = 0
      let at = Math.floor((lo + hi) / 2)
      for (let i = lo; i < hi; i += 1) {
        if (hist[i] > peak) {
          peak = hist[i]
          at = i
        }
      }
      const floor = Math.max(2, peak * 0.42)
      let a = at
      let b = at
      while (a > lo && hist[a] >= floor) a -= 1
      while (b < hi - 1 && hist[b] >= floor) b += 1
      return [a / hist.length, (b + 1) / hist.length] as const
    }

    tone = {
      r: Math.round(tr / n),
      g: Math.round(tg / n),
      b: Math.round(tb / n),
      lum: (tr * 0.299 + tg * 0.587 + tb * 0.114) / n,
    }
    if (sn > 12) {
      focalX = sx / sn / sw
      focalY = sy / sn / sh
      tallSubject = (maxY - minY + 1) / sh > 0.68
      const [px0, px1] = band(col, 0, sw)
      const [py0, py1] = band(row, 0, sh)
      const primaryW = px1 - px0
      const looseW = (maxX - minX + 1) / sw
      fullFigure = tallSubject && primaryW < 0.62
      subject = {
        x0: primaryW < looseW * 0.82 ? px0 : minX / sw,
        y0: Math.min(minY / sh, py0),
        x1: primaryW < looseW * 0.82 ? px1 : (maxX + 1) / sw,
        y1: Math.max((maxY + 1) / sh, py1),
      }
    }
    if (fn > 14) {
      hasFace = true
      focalX = fx / fn / sw
      focalY = Math.min(0.48, fy / fn / sh)
    }
    if (tone.lum > 168) {
      motion = 'light'
      accent = 'light'
    } else if (fullFigure) motion = 'drift'
    else if (tone.lum < 62) motion = 'reveal'
    else if (tallSubject) motion = 'push'
    else motion = 'depth'
    if (redN > n * 0.02) accent = accent === 'light' ? 'light' : 'red'

    const pw = 4
    const ph = 4
    for (let py = 0; py < ph; py += 1) {
      for (let px = 0; px < pw; px += 1) {
        const x = Math.min(sw - 1, Math.floor(((px + 0.5) * sw) / pw))
        const y = Math.min(sh - 1, Math.floor(((py + 0.5) * sh) / ph))
        const [r, g, b] = sample(x, y)
        print.push(r, g, b)
      }
    }
  }

  const art: PictureArt = {
    src,
    width,
    height,
    aspect,
    focalX: hint?.focalX ?? focalX,
    focalY: hint?.focalY ?? focalY,
    scale: hint?.scale ?? 1,
    fit: hint?.fit ?? 'contain',
    fullFigure,
    tallSubject,
    hasFace,
    motion: hint?.motion ?? motion,
    tone,
    subject,
    edgeSat,
    edgeHue,
    accent,
    print,
  }
  cache.set(src, art)
  return art
}

export function motionFor(art: PictureArt, index: number): MotionKind {
  if (hintFor(art.src)?.motion) return art.motion
  const cycle: MotionKind[] = ['light', 'push', 'drift', 'depth', 'reveal', 'cross']
  if (art.fullFigure) return index % 2 === 0 ? 'push' : 'drift'
  if (art.tone.lum > 170) return 'light'
  if (art.tone.lum < 60) return 'reveal'
  return cycle[index % cycle.length]
}

export function printDistance(a: PictureArt, b: PictureArt) {
  const n = Math.min(a.print.length, b.print.length)
  if (!n) return 999
  let sum = 0
  for (let i = 0; i < n; i += 1) sum += Math.abs(a.print[i] - b.print[i])
  return sum / n
}

export function pairRelation(from: PictureArt, to: PictureArt): PairRelation {
  const td = Math.hypot(from.tone.r - to.tone.r, from.tone.g - to.tone.g, from.tone.b - to.tone.b)
  const pd = printDistance(from, to)
  const samePlace = from.edgeHue === to.edgeHue && Math.abs(from.edgeSat - to.edgeSat) < 0.18
  if (pd < 22 && td < 24) return 'duplicate'
  const toWidth = to.subject.x1 - to.subject.x0
  const fromWidth = from.subject.x1 - from.subject.x0
  const pullBack = to.fullFigure && toWidth < 0.46 && fromWidth > toWidth + 0.12 && from.hasFace
  if (samePlace && pullBack && pd < 85 && td < 70) return 'memory'
  return 'distinct'
}

export function transitionFor(
  from: PictureArt,
  to: PictureArt,
  relation: PairRelation,
  last: boolean,
): TransitionKind {
  if (relation === 'memory' || relation === 'duplicate') return 'memory'
  if (last) return 'hold'
  if (from.accent === 'light' || from.tone.lum > 148) return 'light'
  if (from.edgeHue === 'warm' || (from.accent !== 'red' && to.edgeHue === 'warm')) return 'soft'
  if (from.accent === 'red' && to.accent === 'red') return 'color'
  const dx = (to.focalX ?? 0.5) - (from.focalX ?? 0.5)
  const dy = (to.focalY ?? 0.42) - (from.focalY ?? 0.42)
  return Math.abs(dy) > Math.abs(dx) + 0.03 ? 'wipe-y' : 'wipe-x'
}

export function segmentWeight(relation: PairRelation, last: boolean, late: boolean) {
  if (relation === 'memory') return 0.4
  if (relation === 'duplicate') return 0.2
  if (last) return 1.32
  if (late) return 1.12
  return 1
}

export function containRect(imgW: number, imgH: number, viewW: number, viewH: number) {
  const scale = Math.min(viewW / imgW, viewH / imgH)
  const dw = imgW * scale
  const dh = imgH * scale
  return { x: (viewW - dw) / 2, y: (viewH - dh) / 2, dw, dh, scale }
}

export function coverRect(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
  focalX = 0.5,
  focalY = 0.42,
) {
  const scale = Math.max(viewW / imgW, viewH / imgH)
  const dw = imgW * scale
  const dh = imgH * scale
  const maxX = Math.max(0, dw - viewW)
  const maxY = Math.max(0, dh - viewH)
  return {
    x: -maxX * focalX,
    y: -maxY * focalY,
    dw,
    dh,
    scale,
  }
}

export function frameBox(
  art: PictureArt,
  viewW: number,
  viewH: number,
  fit: FitKind,
  focalX = art.focalX,
  focalY = art.focalY,
) {
  if (fit === 'cover') return coverRect(art.width, art.height, viewW, viewH, focalX, focalY)
  return containRect(art.width, art.height, viewW, viewH)
}

export function frameDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  art?: PictureArt,
  ox = 0,
  oy = 0,
) {
  const decision = art ? decideFrame(art, w, h) : null
  const fit = decision?.fit ?? 'contain'
  const fx = art?.focalX ?? 0.5
  const fy = art?.focalY ?? 0.42
  ctx.fillStyle = '#0c0a09'
  ctx.fillRect(0, 0, w, h)
  if (decision?.stage === 'soft') {
    const g = ctx.createRadialGradient(fx * w, fy * h, 12, fx * w, fy * h, Math.max(w, h) * 0.55)
    g.addColorStop(0, decision.glow.replace('rgb', 'rgba').replace(')', ',0.22)'))
    g.addColorStop(1, 'rgba(12,10,9,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  const box =
    fit === 'cover'
      ? coverRect(image.width, image.height, w, h, fx, fy)
      : containRect(image.width, image.height, w, h)
  ctx.drawImage(image, box.x + ox, box.y + oy, box.dw, box.dh)
}

export function frameMul(
  image: HTMLImageElement,
  w: number,
  h: number,
  fit: FitKind,
): [number, number] {
  const scale = (fit === 'contain' ? Math.min : Math.max)(w / image.width, h / image.height)
  return [w / (image.width * scale), h / (image.height * scale)]
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(src))
    image.src = src
  })
}
