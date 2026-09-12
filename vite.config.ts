import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

const VIRTUAL = 'virtual:gift-media'
const RESOLVED = `\0${VIRTUAL}`

function mediaKey(file: string): [number, number, string] {
  const base = file.replace(/\.[^.]+$/, '')
  const match = base.match(/^(\d+)(?:\.(\d+))?(.*)$/)
  if (!match) return [Number.POSITIVE_INFINITY, 0, base.toLowerCase()]
  return [Number(match[1]), Number(match[2] || 0), match[3].toLowerCase()]
}

function isDemoFile(file: string) {
  return (
    file.startsWith('_') ||
    file.startsWith('.') ||
    /(?:^|[._-])(demo|sample|placeholder|stock)(?:[._-]|$)/i.test(file)
  )
}

function listMedia(dir: string, pattern: RegExp, publicPath: string) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((file) => pattern.test(file) && !isDemoFile(file))
    .sort((a, b) => {
      const ka = mediaKey(a)
      const kb = mediaKey(b)
      if (ka[0] !== kb[0]) return ka[0] - kb[0]
      if (ka[1] !== kb[1]) return ka[1] - kb[1]
      return ka[2].localeCompare(kb[2], undefined, { numeric: true })
    })
    .map((file) => `${publicPath}/${file}`)
}

function readArtHints(root: string) {
  const file = path.join(root, 'public/media/art.json')
  if (!fs.existsSync(file)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readGiftMedia(root: string) {
  return {
    photos: listMedia(
      path.join(root, 'public/media/photos'),
      /\.(webp|jpe?g|png|gif|avif)$/i,
      '/media/photos',
    ),
    videos: listMedia(
      path.join(root, 'public/media/videos'),
      /\.(mp4|webm|mov)$/i,
      '/media/videos',
    ),
    audio: listMedia(
      path.join(root, 'public/media/audio'),
      /\.(mp3|wav|m4a|ogg)$/i,
      '/media/audio',
    ),
    art: readArtHints(root),
  }
}

function giftMediaPlugin(): Plugin {
  let root = process.cwd()

  const invalidate = (server: ViteDevServer) => {
    const mod = server.moduleGraph.getModuleById(RESOLVED)
    if (mod) void server.reloadModule(mod)
  }

  return {
    name: 'gift-media',
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED
      return undefined
    },
    load(id) {
      if (id !== RESOLVED) return undefined
      const media = readGiftMedia(root)
      return `export const giftMedia = ${JSON.stringify({ photos: media.photos, videos: media.videos, audio: media.audio })}; export const giftArt = ${JSON.stringify(media.art)}`
    },
    transformIndexHtml() {
      const first = readGiftMedia(root).photos[0]
      if (!first) return []
      return [
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'image',
            href: first,
            fetchpriority: 'high',
          },
          injectTo: 'head-prepend',
        },
      ]
    },
    configureServer(server) {
      const folders = ['photos', 'videos', 'audio'].map((name) =>
        path.join(root, 'public/media', name),
      )
      folders.forEach((folder) => {
        if (fs.existsSync(folder)) server.watcher.add(folder)
      })
      server.watcher.on('all', (_event, file) => {
        if (file.replaceAll('\\', '/').includes('/public/media/')) invalidate(server)
      })
    },
  }
}

export default defineConfig({
  plugins: [giftMediaPlugin(), react()],
})
