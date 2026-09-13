import { gift } from '../data/saleemarh'

export function Datti() {
  return (
    <footer className="datti">
      <p className="datti-word">
        <span className="datti-ink">{gift.sign}</span>
        <i className="datti-mark" aria-hidden="true" />
      </p>
    </footer>
  )
}
