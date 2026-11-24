import './stars.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
const STAR_PATH = 'M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z'

/** 建立難度星星（1~5），超出範圍會被限制 */
export function Stars(level: number): HTMLSpanElement {
  const value = Math.min(5, Math.max(1, Math.round(level)))
  const el = document.createElement('span')
  el.className = 'ui-stars'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `難度 ${value} / 5`)
  for (let i = 1; i <= 5; i++) {
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', i <= value ? 'is-on' : 'is-off')
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', STAR_PATH)
    svg.append(path)
    el.append(svg)
  }
  return el
}
