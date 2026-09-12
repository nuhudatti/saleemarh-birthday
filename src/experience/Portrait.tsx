import { useEffect, useRef } from 'react'
import { gift } from '../data/saleemarh'
import type { Photo } from '../lib/media'
import { decideFrame, frameBox, frameDraw, frameMul, inspectImage, type PictureArt } from '../lib/picture'
import { driveWhoosh, softChime } from '../lib/sound'

type Speck = {
  x: number
  y: number
  z: number
  ox: number
  oy: number
  tx: number
  ty: number
  vx: number
  vy: number
  r: number
  g: number
  b: number
  s: number
  hold: number
}

type Trail = { x: number; y: number }

type Lens = {
  render: (s: LensState) => void
  setCurrent: (image: HTMLImageElement) => void
  setNext: (image: HTMLImageElement | null) => void
  resize: (w: number, h: number) => void
  lost: () => boolean
}

type LensState = {
  w: number
  h: number
  lookX: number
  lookY: number
  headX: number
  headY: number
  trail: Trail[]
  depth: number
  enter: number
  speed: number
  mix: number
  dark: number
  light: [number, number, number]
  ghost: number
  reduced: boolean
  fit: 'contain' | 'cover'
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uNext;
uniform vec2 uCoverA;
uniform vec2 uCoverB;
uniform vec2 uLook;
uniform vec2 uHead;
uniform vec2 uTrail[12];
uniform float uTrailN;
uniform vec3 uLight;
uniform float uDepth;
uniform float uEnter;
uniform float uSpeed;
uniform float uMix;
uniform float uDark;
uniform float uGhost;

vec2 mapUv(vec2 uv, vec2 cover, vec2 look, float zoom, float stretch) {
  vec2 p = uv;
  p.x = (p.x - 0.5) / stretch + 0.5;
  p = (p - look) / zoom + look;
  return (p - 0.5) * cover + 0.5;
}

float distSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float zoom = 1.0 + uDepth * 0.038 + uEnter * 0.92;
  float stretch = 1.0 + uDepth * 0.018 + uEnter * 0.22 + uSpeed * 0.04;
  vec2 uvA = mapUv(vUv, uCoverA, uLook, zoom, stretch);
  if (uvA.x < 0.0 || uvA.x > 1.0 || uvA.y < 0.0 || uvA.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float lum = dot(texture2D(uTex, clamp(uvA, 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
  vec2 par = (uLook - 0.5) * (0.034 + uDepth * 0.05);
  vec2 uvBack = uvA + par * (0.82 - lum);
  vec2 uvFore = uvA - par * (lum * 1.45);
  vec3 back = texture2D(uTex, clamp(uvBack, 0.0, 1.0)).rgb;
  vec3 fore = texture2D(uTex, clamp(uvFore, 0.0, 1.0)).rgb;
  vec3 col = mix(back, fore, smoothstep(0.22, 0.78, lum));

  if (uEnter > 0.01) {
    vec2 dir = normalize(uHead - vec2(0.5) + vec2(0.0001));
    vec3 acc = col;
    for (int i = 1; i <= 7; i++) {
      float t = float(i) / 7.0;
      vec2 smear = dir * t * uEnter * (0.08 + lum * 0.42);
      acc += texture2D(uTex, clamp(uvFore + smear, 0.0, 1.0)).rgb;
    }
    col = acc / 8.0;
    col += lum * uEnter * uLight * 0.18;
  }

  if (uMix > 0.0) {
    float nz = 1.55 - uMix * 0.55;
    vec2 uvB = mapUv(vUv, uCoverB, vec2(0.5), nz, 1.0);
    vec3 nxt = texture2D(uNext, clamp(uvB, 0.0, 1.0)).rgb;
    float emerge = smoothstep(0.28, 0.96, uMix);
    col = mix(col, nxt, emerge);
  }

  float beam = 0.0;
  for (int i = 0; i < 11; i++) {
    float live = step(float(i), uTrailN - 1.51);
    float d = distSeg(vUv, uTrail[i], uTrail[i + 1]);
    float w = 0.0014 + uSpeed * 0.014 + uDepth * 0.001 + float(i) * 0.00012;
    beam += exp(-d * d / (w * w)) * (1.0 - float(i) / 12.0) * live;
  }
  col += uLight * beam * (0.28 + uDepth * 0.72 + uSpeed * 0.4);

  float curve = pow(clamp(1.0 - length(vUv - uHead) * (1.7 - uDepth * 0.4), 0.0, 1.0), 2.4);
  col += uLight * curve * uDepth * 0.11 * (0.35 + lum);

  float vig = smoothstep(0.15, 1.15, length(vUv - 0.5) * (0.92 + uDepth * 0.55 + uEnter * 0.8));
  col *= 1.0 - vig * (0.22 + uDark * 0.7);
  col *= 1.0 - uDark * 0.55;
  col = mix(col, col * 0.22, uGhost);
  gl_FragColor = vec4(col, 1.0);
}
`

function coverDraw(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  ox = 0,
  oy = 0,
  art?: PictureArt,
) {
  frameDraw(ctx, image, w, h, art, ox, oy)
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function glUsable() {
  const probe = document.createElement('canvas')
  const gl = probe.getContext('webgl', { alpha: false })
  if (!gl) return false
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return false
  const prog = gl.createProgram()
  if (!prog) return false
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  return Boolean(gl.getProgramParameter(prog, gl.LINK_STATUS))
}

function createGlLens(canvas: HTMLCanvasElement): Lens | null {
  if (!glUsable()) return null
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  })
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.bindAttribLocation(prog, 0, 'aPos')
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(prog))
    return null
  }
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const texA = gl.createTexture()
  const texB = gl.createTexture()
  if (!texA || !texB) return null

  const setup = (tex: WebGLTexture) => {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 10, 9, 255]))
  }
  setup(texA)
  setup(texB)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)

  const loc = {
    uTex: gl.getUniformLocation(prog, 'uTex'),
    uNext: gl.getUniformLocation(prog, 'uNext'),
    uCoverA: gl.getUniformLocation(prog, 'uCoverA'),
    uCoverB: gl.getUniformLocation(prog, 'uCoverB'),
    uLook: gl.getUniformLocation(prog, 'uLook'),
    uHead: gl.getUniformLocation(prog, 'uHead'),
    uTrailN: gl.getUniformLocation(prog, 'uTrailN'),
    uLight: gl.getUniformLocation(prog, 'uLight'),
    uDepth: gl.getUniformLocation(prog, 'uDepth'),
    uEnter: gl.getUniformLocation(prog, 'uEnter'),
    uSpeed: gl.getUniformLocation(prog, 'uSpeed'),
    uMix: gl.getUniformLocation(prog, 'uMix'),
    uDark: gl.getUniformLocation(prog, 'uDark'),
    uGhost: gl.getUniformLocation(prog, 'uGhost'),
  }

  gl.uniform1i(loc.uTex, 0)
  gl.uniform1i(loc.uNext, 1)
  const trailLocs = Array.from({ length: 12 }, (_, i) => gl.getUniformLocation(prog, `uTrail[${i}]`))

  let current: HTMLImageElement | null = null
  let next: HTMLImageElement | null = null
  let dead = false
  let ready = false
  const trailData = new Float32Array(24)

  const upload = (unit: number, tex: WebGLTexture, image: HTMLImageElement) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    if (unit === 0) ready = true
  }

  return {
    lost: () => dead || gl.isContextLost(),
    setCurrent: (image) => {
      current = image
      upload(0, texA, image)
    },
    setNext: (image) => {
      next = image
      if (image) upload(1, texB, image)
    },
    resize: (w, h) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      const pw = Math.max(1, Math.floor(w * dpr))
      const ph = Math.max(1, Math.floor(h * dpr))
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
      }
      gl.viewport(0, 0, pw, ph)
    },
    render: (s) => {
      if (dead || gl.isContextLost()) {
        dead = true
        return
      }
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (!ready) return
      gl.useProgram(prog)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texA)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, texB)
      const coverA = current ? frameMul(current, s.w, s.h, s.fit) : [1, 1]
      const coverB = next ? frameMul(next, s.w, s.h, s.fit) : coverA
      gl.uniform2f(loc.uCoverA, coverA[0], coverA[1])
      gl.uniform2f(loc.uCoverB, coverB[0], coverB[1])
      gl.uniform2f(loc.uLook, s.lookX, 1 - s.lookY)
      gl.uniform2f(loc.uHead, s.headX, 1 - s.headY)
      trailData.fill(0)
      const n = Math.min(12, s.trail.length)
      for (let i = 0; i < n; i += 1) {
        trailData[i * 2] = s.trail[i].x
        trailData[i * 2 + 1] = 1 - s.trail[i].y
      }
      for (let i = 0; i < 12; i += 1) {
        gl.uniform2f(trailLocs[i], trailData[i * 2], trailData[i * 2 + 1])
      }
      gl.uniform1f(loc.uTrailN, n)
      gl.uniform3f(loc.uLight, s.light[0] / 255, s.light[1] / 255, s.light[2] / 255)
      gl.uniform1f(loc.uDepth, s.reduced ? s.depth * 0.18 : s.depth)
      gl.uniform1f(loc.uEnter, s.reduced ? Math.min(s.enter, 0.2) : s.enter)
      gl.uniform1f(loc.uSpeed, s.speed)
      gl.uniform1f(loc.uMix, s.mix)
      gl.uniform1f(loc.uDark, s.dark)
      gl.uniform1f(loc.uGhost, s.ghost)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
  }
}

function sampleField(image: HTMLImageElement, w: number, h: number, step: number) {
  const sw = 180
  const sh = Math.max(100, Math.round((180 * h) / w))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { specks: [] as Speck[], data: null as ImageData | null, sw, sh }
  coverDraw(ctx, image, sw, sh, 0, 0, inspectImage(image, image.src))
  const data = ctx.getImageData(0, 0, sw, sh)
  const specks: Speck[] = []
  const px = data.data
  for (let y = 0; y < sh; y += step) {
    for (let x = 0; x < sw; x += step) {
      const i = (y * sw + x) * 4
      const r = px[i]
      const g = px[i + 1]
      const b = px[i + 2]
      const lum = r * 0.299 + g * 0.587 + b * 0.114
      if (lum < 28) continue
      const nx = x / sw
      const ny = y / sh
      const face = nx > 0.32 && nx < 0.68 && ny > 0.22 && ny < 0.68 && lum > 70 && lum < 210
      specks.push({
        x: nx * w,
        y: ny * h,
        z: lum / 255,
        ox: nx * w,
        oy: ny * h,
        tx: nx * w,
        ty: ny * h,
        vx: 0,
        vy: 0,
        r,
        g,
        b,
        s: 1.15 + (lum / 255) * 1.7,
        hold: face ? 0.42 : lum > 170 ? 0.04 : 0.16,
      })
    }
  }
  for (let i = specks.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = specks[i]
    specks[i] = specks[j]
    specks[j] = tmp
  }
  return { specks, data, sw, sh }
}

function sampleText(
  width: number,
  height: number,
  text: string,
  y: number,
  size: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return [] as { x: number; y: number }[]
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
      ctx.font = `italic 500 ${size}px "Playfair Display", serif`
      ctx.fillText(text, width / 2, y)
      ctx.fillText(text, width / 2, y)
  const data = ctx.getImageData(0, 0, width, height).data
  const pts: { x: number; y: number }[] = []
  const gap = width < 700 ? 3 : 2
  for (let py = 0; py < height; py += gap) {
    for (let px = 0; px < width; px += gap) {
      if (data[(py * width + px) * 4 + 3] > 70) pts.push({ x: px, y: py })
    }
  }
  return pts
}

function colorAt(data: ImageData | null, nx: number, ny: number): [number, number, number] {
  if (!data) return [232, 220, 198]
  const x = Math.max(0, Math.min(data.width - 1, Math.floor(nx * data.width)))
  const y = Math.max(0, Math.min(data.height - 1, Math.floor(ny * data.height)))
  const i = (y * data.width + x) * 4
  return [data.data[i], data.data[i + 1], data.data[i + 2]]
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(src))
    image.src = src
  })
}

function paintFallback(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  next: HTMLImageElement | null,
  s: LensState,
) {
  const { w, h } = s
  ctx.fillStyle = '#0c0a09'
  ctx.fillRect(0, 0, w, h)
  if (!image) return
  const k = s.reduced ? 0.14 : 1
  const zoom = 1 + s.depth * 0.045 * k + s.enter * 1.15 * k
  const stretch = 1 + s.depth * 0.016 * k + s.enter * 0.12
  const ox = (s.lookX - 0.5) * w
  const oy = (s.lookY - 0.5) * h
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(zoom * stretch, zoom)
  ctx.translate(-w / 2, -h / 2)
  const art = inspectImage(image, image.src)
  ctx.globalAlpha = Math.max(0, 1 - s.mix * 0.9) * (1 - s.ghost * 0.72)
  coverDraw(ctx, image, w, h, ox * 0.03 * k, oy * 0.02 * k, art)
  ctx.globalAlpha *= 0.55
  ctx.globalCompositeOperation = 'lighter'
  coverDraw(ctx, image, w, h, ox * -0.05 * k, oy * -0.04 * k, art)
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
  if (next && s.mix > 0.2) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, (s.mix - 0.2) / 0.8)
    ctx.translate(w / 2, h / 2)
    ctx.scale(1.18 - s.mix * 0.18, 1.18 - s.mix * 0.18)
    ctx.translate(-w / 2, -h / 2)
    coverDraw(ctx, next, w, h, 0, 0, inspectImage(next, next.src))
    ctx.restore()
  }
  ctx.fillStyle = `rgba(8,9,12,${s.dark * 0.7})`
  ctx.fillRect(0, 0, w, h)
}

type Props = {
  photos: Photo[]
  reducedMotion: boolean
}

export function Portrait({ photos, reducedMotion }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const underlayRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLImageElement>(null)
  const lensRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const lineRef = useRef<HTMLParagraphElement>(null)
  const nameRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const lensCanvas = lensRef.current
    const fxCanvas = fxRef.current
    if (!root || !lensCanvas || !fxCanvas || photos.length === 0) return
    const fx = fxCanvas.getContext('2d')
    if (!fx) return

    const mobile = window.matchMedia('(pointer: coarse)').matches
    const cap = mobile ? 320 : 900
    const paths = photos.map((photo) => photo.src)
    const lastIndex = Math.max(0, paths.length - 1)
    const gl = createGlLens(lensCanvas)
    const fallback = !gl ? lensCanvas.getContext('2d') : null

    let dead = false
    let raf = 0
    let visible = false
    let index = 0
    let pictureFit: 'contain' | 'cover' = 'contain'
    let currentArt: PictureArt | undefined
    let current: HTMLImageElement | null = null
    let upcoming: HTMLImageElement | null = null
    let field = { specks: [] as Speck[], data: null as ImageData | null, sw: 1, sh: 1 }
    let fly: Speck[] = []
    let specks: Speck[] = []
    let pointerX = 0.5
    let pointerY = 0.5
    let lookX = 0.5
    let lookY = 0.5
    let lookVx = 0
    let lookVy = 0
    let headX = 0.5
    let headY = 0.5
    let headVx = 0
    let headVy = 0
    let down = false
    let inside = false
    let presence = 0
    let speed = 0
    let lastPx = 0.5
    let lastPy = 0.5
    let enter = 0
    let mix = 0
    let entering = false
    let signing = false
    let signed = false
    let signature = 0
    let interact = 0
    let pathLen = 0
    let away = 0
    let scrolling = 0
    let chimed = false
    let dwell = 0
    let cool = 0
    let cw = 0
    let ch = 0
    const trail: Trail[] = []
    const images: Record<string, HTMLImageElement> = {}

    const fitFx = () => {
      const w = fxCanvas.clientWidth
      const h = fxCanvas.clientHeight
      if (w !== cw || h !== ch) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        fxCanvas.width = Math.floor(w * dpr)
        fxCanvas.height = Math.floor(h * dpr)
        fx.setTransform(dpr, 0, 0, dpr, 0, 0)
        cw = w
        ch = h
      }
      gl?.resize(w, h)
      if (fallback) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        lensCanvas.width = Math.floor(w * dpr)
        lensCanvas.height = Math.floor(h * dpr)
        fallback.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      return { w, h }
    }

    const dressUnderlay = (image: HTMLImageElement, art: PictureArt, w: number, h: number) => {
      const frame = decideFrame(art, w, h)
      const wrap = underlayRef.current
      const holder = frameRef.current
      if (wrap) {
        wrap.classList.toggle('is-cover', frame.fit === 'cover')
        wrap.classList.toggle('is-contain', frame.fit === 'contain')
        wrap.classList.toggle('is-stage-dark', frame.stage === 'dark')
        wrap.classList.toggle('is-stage-soft', frame.stage === 'soft')
        wrap.style.setProperty('--fx', `${(frame.focalX * 100).toFixed(2)}%`)
        wrap.style.setProperty('--fy', `${(frame.focalY * 100).toFixed(2)}%`)
        wrap.style.setProperty('--glow', frame.glow)
      }
      if (holder) {
        if (frame.fit === 'cover') {
          holder.style.left = '0'
          holder.style.top = '0'
          holder.style.width = '100%'
          holder.style.height = '100%'
        } else {
          const box = frameBox(art, w, h, frame.fit, frame.focalX, frame.focalY)
          holder.style.left = `${box.x}px`
          holder.style.top = `${box.y}px`
          holder.style.width = `${box.dw}px`
          holder.style.height = `${box.dh}px`
        }
      }
      if (photoRef.current) photoRef.current.src = image.src
      return frame.fit
    }

    const arm = (image: HTMLImageElement, w: number, h: number) => {
      current = image
      currentArt = inspectImage(image, image.src)
      pictureFit = dressUnderlay(image, currentArt, w, h)
      field = sampleField(image, w, h, mobile ? 3 : 2)
      fly = field.specks.slice(0, Math.min(cap, field.specks.length))
      gl?.setCurrent(image)
    }

    const cache = async (src: string) => {
      if (!src) return null
      if (images[src]) return images[src]
      try {
        const image = await loadImage(src)
        images[src] = image
        return image
      } catch {
        return null
      }
    }

    const reset = async () => {
      index = 0
      entering = false
      signing = false
      signed = false
      signature = 0
      enter = 0
      mix = 0
      presence = 0
      interact = 0
      pathLen = 0
      dwell = 0
      chimed = false
      specks = []
      const { w, h } = fitFx()
      const image = await cache(paths[0])
      if (image && !dead) {
        arm(image, w, h)
        const nxt = await cache(paths[Math.min(1, lastIndex)])
        upcoming = nxt
        if (nxt) gl?.setNext(nxt)
      }
      if (nameRef.current) nameRef.current.style.opacity = '0'
    }

    void document.fonts.load('italic 500 120px "Playfair Display"').catch(() => undefined)

    void (async () => {
      const { w, h } = fitFx()
      const first = await cache(paths[0])
      if (dead || !first) return
      arm(first, w, h)
      const nxt = await cache(paths[Math.min(1, lastIndex)])
      upcoming = nxt
      if (nxt) gl?.setNext(nxt)
    })()

    const beginEnter = (w: number, h: number) => {
      if (entering || signing || signed || cool > 0) return
      if (index >= lastIndex) {
        signing = true
        signature = 0
        enter = 0
        mix = 0
        const origins = [...(field.specks.length ? field.specks : fly)].sort((a, b) => a.hold - b.hold)
        const namePts = sampleText(w, h, gift.firstName, h * 0.46, Math.min(w * 0.2, 170))
        const wishPts: { x: number; y: number }[] = []
        specks = []
        const take = (pts: { x: number; y: number }[], extraHold: number, budget: number) => {
          const step = Math.max(1, Math.ceil(pts.length / Math.max(1, budget)))
          for (let i = 0; i < pts.length; i += step) {
            const from = origins[i % Math.max(1, origins.length)] ?? {
              ox: w / 2,
              oy: h / 2,
              z: 0.5,
              r: 214,
              g: 188,
              b: 148,
              s: 1.6,
              hold: 0.1,
              x: 0,
              y: 0,
              tx: 0,
              ty: 0,
              vx: 0,
              vy: 0,
            }
            specks.push({
              ...from,
              x: from.ox,
              y: from.oy,
              tx: pts[i].x,
              ty: pts[i].y,
              s: 1.2 + from.z * 0.55,
              hold: from.hold + extraHold,
            })
          }
        }
        take(namePts, 0, Math.floor(cap * 0.7))
        take(wishPts, 0.22, Math.floor(cap * 0.3))
        return
      }
      entering = true
      enter = 0
      mix = 0
      driveWhoosh()
      void cache(paths[index + 1]).then((image) => {
        if (dead || !image) return
        upcoming = image
        gl?.setNext(image)
      })
    }

    const finishEnter = async (w: number, h: number) => {
      entering = false
      enter = 0
      mix = 0
      presence = 0.1
      interact = 0
      pathLen = 0
      dwell = 0
      cool = 1.15
      trail.length = 0
      index = Math.min(lastIndex, index + 1)
      const image = await cache(paths[index])
      if (dead || !image) return
      arm(image, w, h)
      const nxt = await cache(paths[Math.min(lastIndex, index + 1)])
      upcoming = nxt
      if (nxt) gl?.setNext(nxt)
    }

    const spring = (
      value: number,
      vel: number,
      target: number,
      stiffness: number,
      damping: number,
      dt: number,
    ) => {
      const nextVel = vel + (target - value) * stiffness * dt
      const damped = nextVel * Math.exp(-damping * dt)
      return [value + damped * dt, damped] as const
    }

    const drawFx = (w: number, h: number, depth: number) => {
      fx.clearRect(0, 0, w, h)
      if (enter > 0.06 && fly.length && !signing) {
        for (const s of fly) {
          const z = 1 + enter * (0.35 + s.z * 3.6)
          const px = w / 2 + (s.ox - w / 2) * z + (lookX - 0.5) * enter * 90
          const py = h / 2 + (s.oy - h / 2) * z + (lookY - 0.5) * enter * 40
          const alpha = enter < 0.55 ? enter * 1.2 : (1 - enter) * 1.4
          if (alpha <= 0) continue
          fx.fillStyle = `rgba(${s.r},${s.g},${s.b},${Math.min(0.9, alpha)})`
          fx.fillRect(px, py, s.s * z, s.s * z)
        }
      }

      if ((signing || signed) && specks.length) {
        const drift = Math.min(1, Math.max(0, (signature - 0.28) / 0.18))
        const gatherName = Math.min(1, Math.max(0, (signature - 0.46) / 0.28))
        const gatherWish = Math.min(1, Math.max(0, (signature - 0.72) / 0.16))
        const shown = Math.min(1, Math.max(0, (signature - 0.3) / 0.08))
        const ease = (t: number) => 1 - (1 - t) ** 3
        const veil = signed
          ? 0.28
          : Math.max(0, Math.min(0.58, (signature - 0.16) * 0.85 - Math.max(0, signature - 0.88) * 1.6))
        fx.fillStyle = `rgba(8, 9, 12, ${veil})`
        fx.fillRect(0, 0, w, h)
        for (const s of specks) {
          const ready = Math.min(1, Math.max(0, (signature - s.hold * 0.5 - 0.26) / 0.12))
          const toward = s.ty > ch * 0.5 ? gatherWish : gatherName
          const t = ease(toward) * ready
          const loose = signed ? 0 : drift * (1 - t)
          s.x = s.ox + (s.tx - s.ox) * t + Math.sin(s.ox * 0.04) * loose * 18
          s.y = s.oy + (s.ty - s.oy) * t - loose * (20 + s.z * 40)
          const lift = 1 + t * 0.7
          const size = s.s + t * 0.7
          fx.fillStyle = `rgba(${Math.min(255, s.r * lift + 22)},${Math.min(255, s.g * lift + 16)},${Math.min(255, s.b * lift + 10)},${0.96 * shown})`
          fx.fillRect(s.x, s.y, size, size)
        }
        if (nameRef.current) nameRef.current.style.opacity = '0'
        if (gatherName > 0.86 && !chimed) {
          chimed = true
          softChime()
        }
      }

      if (!gl && (inside || down || depth > 0.05) && !signing) {
        const [r, g, b] = colorAt(field.data, headX, headY)
        fx.strokeStyle = `rgba(${Math.min(255, r + 36)},${Math.min(255, g + 24)},${Math.min(255, b + 40)},${0.28 + depth * 0.4})`
        fx.lineWidth = Math.max(0.6, 1.4 + speed * 2.2)
        fx.beginPath()
        trail.forEach((p, i) => {
          const x = p.x * w
          const y = p.y * h
          if (i === 0) fx.moveTo(x, y)
          else fx.lineTo(x, y)
        })
        fx.stroke()
      }
    }

    let prev = performance.now()
    const tick = (now: number) => {
      if (dead) return
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.033, (now - prev) / 1000)
      prev = now
      if (!visible && presence < 0.02 && !entering && !signing) {
        away += dt
        if (away > 1.4 && (index > 0 || signed || signature > 0)) void reset()
        return
      }
      if (visible) away = 0
      scrolling = Math.max(0, scrolling - dt)
      cool = Math.max(0, cool - dt)
      if (signing || signed) {
        pointerX += (0.5 - pointerX) * Math.min(1, dt * 2.2)
        pointerY += (0.46 - pointerY) * Math.min(1, dt * 2.2)
      }
      const { w, h } = fitFx()
      if (w < 2 || h < 2) return
      if (currentArt && current) {
        const nextFit = dressUnderlay(current, currentArt, w, h)
        if (nextFit !== pictureFit) pictureFit = nextFit
      }

      const dx = pointerX - lastPx
      const dy = pointerY - lastPy
      speed = speed * Math.exp(-dt * 5.2) + Math.hypot(dx, dy) * 22
      lastPx = pointerX
      lastPy = pointerY
      pathLen += Math.hypot(dx, dy)

      const using = (inside || down) && (down || scrolling <= 0)
      if (using) {
        presence = Math.min(1, presence + dt * 0.35 + speed * dt * 1.4 + (down ? dt * 0.2 : 0))
        interact += dt
      } else {
        presence = Math.max(0, presence - dt * 0.42)
        speed *= Math.exp(-dt * 2.4)
      }

      const tiltX = pointerX
      const tiltY = pointerY
      ;[lookX, lookVx] = spring(lookX, lookVx, tiltX, 18, 7.5, dt)
      ;[lookY, lookVy] = spring(lookY, lookVy, tiltY, 18, 7.5, dt)
      ;[headX, headVx] = spring(headX, headVx, lookX, 9.5, 5.8, dt)
      ;[headY, headVy] = spring(headY, headVy, lookY, 9.5, 5.8, dt)

      if (using || presence > 0.04) {
        trail.unshift({ x: headX, y: headY })
        const maxTrail = Math.min(12, 5 + Math.floor(speed * 18))
        if (trail.length > maxTrail) trail.length = maxTrail
      } else if (trail.length) {
        trail.pop()
      }

      dwell += visible && !entering && !signing ? dt : 0
      const isLast = index >= lastIndex
      if (!entering && !signing && !signed && !reducedMotion && cool <= 0) {
        if (!isLast && dwell > 1.2 && interact > 0.85 && pathLen > 0.2 && presence > 0.5) beginEnter(w, h)
        if (isLast && dwell > 2.8 && (interact > 0.35 || dwell > 4.4)) beginEnter(w, h)
      }
      if (reducedMotion && down && interact > 0.2 && !entering && !signing && !signed) beginEnter(w, h)

      if (entering) {
        enter = Math.min(1, enter + dt / 1.55)
        mix = Math.min(1, Math.max(0, (enter - 0.32) / 0.68))
        if (enter >= 1) void finishEnter(w, h)
      }
      if (signing) {
        signature = Math.min(1, signature + dt / 7.4)
        enter = 0
        mix = 0
        if (signature >= 1) {
          signing = false
          signed = true
        }
      }

      const depth = Math.min(1, presence * 1.05 + speed * 0.28 + (signing ? Math.min(0.55, signature * 0.7) : 0))
      const dark = Math.min(
        0.72,
        depth * 0.22 + enter * 0.42 + (signing ? Math.min(0.62, Math.max(0, signature - 0.2) * 0.9) : 0),
      )
      const ghost = signed
        ? 0.26
        : signing
          ? Math.max(0, (signature - 0.18) * 0.7 - Math.max(0, signature - 0.9) * 1.4)
          : 0
      const light = colorAt(field.data, headX, headY)

      const state: LensState = {
        w,
        h,
        lookX,
        lookY,
        headX,
        headY,
        trail,
        depth,
        enter: signing || signed ? 0 : enter,
        speed,
        mix,
        dark,
        light,
        ghost,
        reduced: reducedMotion,
        fit: pictureFit,
      }

      if (gl && !gl.lost() && current) gl.render(state)
      else if (fallback && current) paintFallback(fallback, current, upcoming, state)

      drawFx(w, h, depth)

      if (lineRef.current) {
        const hide = presence > 0.16 || entering || signing || signed
        lineRef.current.style.opacity = hide ? '0' : '1'
      }
    }

    const local = (event: PointerEvent) => {
      const rect = lensCanvas.getBoundingClientRect()
      pointerX = (event.clientX - rect.left) / Math.max(1, rect.width)
      pointerY = (event.clientY - rect.top) / Math.max(1, rect.height)
    }

    const onMove = (event: PointerEvent) => {
      const rect = lensCanvas.getBoundingClientRect()
      const x = (event.clientX - rect.left) / Math.max(1, rect.width)
      const y = (event.clientY - rect.top) / Math.max(1, rect.height)
      if (event.pointerType === 'touch' && down) {
        const vy = Math.abs(y - pointerY)
        const vx = Math.abs(x - pointerX)
        if (presence < 0.18 && vy > vx + 0.014) return
      }
      pointerX = x
      pointerY = y
      inside = true
    }

    const onDown = (event: PointerEvent) => {
      down = true
      local(event)
      if (event.pointerType !== 'touch') lensCanvas.setPointerCapture(event.pointerId)
    }
    const onUp = () => {
      down = false
    }
    const onEnter = (event: PointerEvent) => {
      inside = true
      local(event)
    }
    const onLeave = () => {
      inside = false
      down = false
    }
    const onKey = (event: KeyboardEvent) => {
      const step = 0.06
      if (event.key === 'ArrowLeft') pointerX = Math.max(0, pointerX - step)
      if (event.key === 'ArrowRight') pointerX = Math.min(1, pointerX + step)
      if (event.key === 'ArrowUp') pointerY = Math.max(0, pointerY - step)
      if (event.key === 'ArrowDown') pointerY = Math.min(1, pointerY + step)
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        const { w, h } = fitFx()
        beginEnter(w, h)
      }
    }
    const onScroll = () => {
      scrolling = 0.16
    }
    const onOrient = (event: DeviceOrientationEvent) => {
      if (!mobile || !visible) return
      const gx = ((event.gamma ?? 0) / 35) * 0.08
      const gy = (((event.beta ?? 45) - 45) / 35) * 0.06
      if (!inside && !down) {
        pointerX = Math.max(0.2, Math.min(0.8, 0.5 + gx))
        pointerY = Math.max(0.25, Math.min(0.75, 0.5 + gy))
      }
    }

    lensCanvas.addEventListener('pointerenter', onEnter)
    lensCanvas.addEventListener('pointerleave', onLeave)
    lensCanvas.addEventListener('pointerdown', onDown)
    lensCanvas.addEventListener('pointerup', onUp)
    lensCanvas.addEventListener('pointercancel', onUp)
    lensCanvas.addEventListener('pointermove', onMove, { passive: true })
    lensCanvas.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('deviceorientation', onOrient)

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
      },
      { threshold: [0.08, 0.25, 0.5, 0.8] },
    )
    io.observe(root)
    raf = requestAnimationFrame(tick)
    const ro = new ResizeObserver(() => fitFx())
    ro.observe(lensCanvas)

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      lensCanvas.removeEventListener('pointerenter', onEnter)
      lensCanvas.removeEventListener('pointerleave', onLeave)
      lensCanvas.removeEventListener('pointerdown', onDown)
      lensCanvas.removeEventListener('pointerup', onUp)
      lensCanvas.removeEventListener('pointercancel', onUp)
      lensCanvas.removeEventListener('pointermove', onMove)
      lensCanvas.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('deviceorientation', onOrient)
    }
  }, [photos, reducedMotion])

  if (!photos.length) return null

  return (
    <section className="chapter portrait" id="ahead" data-chapter="ahead" ref={rootRef}>
      <div className="shot is-contain is-stage-dark portrait-photo" ref={underlayRef}>
        <div className="shot-atmosphere" aria-hidden="true" />
        <div className="shot-frame" ref={frameRef}>
          <img className="shot-photo" ref={photoRef} src={photos[0].src} alt="" draggable={false} />
        </div>
      </div>
      <canvas
        ref={lensRef}
        className="portrait-lens"
        tabIndex={0}
        aria-label={gift.firstName}
      />
      <canvas ref={fxRef} className="portrait-fx" aria-hidden="true" />
      {gift.ahead.line ? (
        <p className="portrait-line" ref={lineRef}>
          {gift.ahead.line}
        </p>
      ) : (
        <p className="portrait-line" ref={lineRef} hidden />
      )}
      <p className="portrait-sig" ref={nameRef} aria-hidden="true">
        {gift.firstName}
      </p>
    </section>
  )
}
