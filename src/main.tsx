import { createRoot } from 'react-dom/client'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App.tsx'
import { getGiftMedia } from './lib/media'

const cake = getGiftMedia().photos[0]?.src
if (cake) {
  const image = new Image()
  image.fetchPriority = 'high'
  image.decoding = 'async'
  image.src = cake
  void image.decode?.()
}

createRoot(document.getElementById('root')!).render(<App />)
