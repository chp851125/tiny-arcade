import './design/index.ts'
import { mountShowcase } from './design/showcase.ts'

const app = document.querySelector<HTMLDivElement>('#app')

let cleanup: (() => void) | null = null

/** 依 hash 切換畫面；目前只有開發用 #/design，大廳之後再做 */
function route(): void {
  if (!app) return
  cleanup?.()
  cleanup = null
  if (location.hash === '#/design') {
    cleanup = mountShowcase(app)
    return
  }
  const title = document.createElement('h1')
  title.textContent = 'TINYARCADE'
  app.replaceChildren(title)
}

window.addEventListener('hashchange', route)
route()
