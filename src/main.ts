import './design/index.ts'
import { mountShowcase } from './design/showcase.ts'
import { enterGame } from './games/shell.ts'
import { getGameMeta } from './games/registry.ts'
import { mountLobby } from './lobby/lobby.ts'
import { initAudio } from './shared/audio.ts'

const app = document.querySelector<HTMLDivElement>('#app')

type Route = { kind: 'lobby' } | { kind: 'design' } | { kind: 'game'; id: string }

/** 解析 hash：#/ 大廳、#/g/{id} 遊戲、#/design 展示頁；其餘回大廳 */
function parseRoute(hash: string): Route {
  if (hash === '#/design') return { kind: 'design' }
  const match = /^#\/g\/([\w-]+)$/.exec(hash)
  if (match?.[1]) {
    const meta = getGameMeta(match[1])
    if (meta?.status === 'ready') return { kind: 'game', id: meta.id }
  }
  return { kind: 'lobby' }
}

let cleanup: (() => void) | null = null

function render(): void {
  if (!app) return
  // 離開上一個畫面：遊戲一定會在這裡 destroy
  cleanup?.()
  cleanup = null

  const route = parseRoute(location.hash)
  if (route.kind === 'design') {
    cleanup = mountShowcase(app)
  } else if (route.kind === 'game') {
    const meta = getGameMeta(route.id)
    if (meta) cleanup = enterGame(app, meta)
  } else {
    // 未知路徑統一整理成 #/
    if (location.hash !== '' && location.hash !== '#/') history.replaceState(null, '', '#/')
    cleanup = mountLobby(app)
  }
}

initAudio()
window.addEventListener('hashchange', render)
render()
