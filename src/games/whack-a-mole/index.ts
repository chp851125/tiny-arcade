import './whack-a-mole.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'

/** 打地鼠：60 秒內用滑鼠打地鼠，金色加分、炸彈扣分，越後面冒得越快 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const GAME_SECONDS = 60
const TICK_MS = 50
const GRID = 9

type Kind = 'mole' | 'gold' | 'bomb'

const POINTS: Record<Kind, number> = { mole: 1, gold: 3, bomb: -3 }

interface Hole {
  kind: Kind | null
  /** 還能待多久（秒） */
  life: number
  /** 被打中後的動畫剩餘秒數 */
  hit: number
}

let cleanup: (() => void) | null = null

const FACES: Record<Kind, string> = {
  mole: '<circle cx="50" cy="55" r="34" fill="#a0673a"/><ellipse cx="50" cy="68" rx="16" ry="12" fill="#e8c39a"/><circle cx="50" cy="62" r="6" fill="#1b1b1b"/><circle cx="37" cy="48" r="5" fill="#1b1b1b"/><circle cx="63" cy="48" r="5" fill="#1b1b1b"/><rect x="45" y="72" width="4" height="8" fill="#fff"/><rect x="51" y="72" width="4" height="8" fill="#fff"/>',
  gold: '<circle cx="50" cy="55" r="34" fill="#ffc933"/><ellipse cx="50" cy="68" rx="16" ry="12" fill="#fff3b0"/><circle cx="50" cy="62" r="6" fill="#1b1b1b"/><circle cx="37" cy="48" r="5" fill="#1b1b1b"/><circle cx="63" cy="48" r="5" fill="#1b1b1b"/><path d="M30 28L36 14L44 24L50 10L56 24L64 14L70 28Z" fill="#ff6b5e"/>',
  bomb: '<circle cx="50" cy="58" r="32" fill="#2b2b2b"/><circle cx="40" cy="48" r="8" fill="#555"/><path d="M58 28Q66 16 74 20" fill="none" stroke="#b36bff" stroke-width="5"/><circle cx="76" cy="19" r="6" fill="#ff9a3c"/><circle cx="42" cy="60" r="4" fill="#fff"/><circle cx="58" cy="60" r="4" fill="#fff"/>',
}

function createFace(kind: Kind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'wm__face')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = FACES[kind]
  return svg
}

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'wm__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'wm__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let holes: Hole[] = []
  let score = 0
  let timeLeft = GAME_SECONDS
  let elapsed = 0
  let spawnTimer = 0
  let hits = 0
  let clicks = 0
  let best = 0
  let running = false
  let paused = false
  let timer = 0
  let dialog: DialogHandle | null = null
  const popups = new Set<number>()

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'wm'

  const stats = document.createElement('div')
  stats.className = 'wm__stats'
  const scoreStat = createStat('分數')
  const timeStat = createStat('剩餘時間')
  const accStat = createStat('命中率')
  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  stats.append(scoreStat.card, timeStat.card, accStat.card, pauseButton)

  const hint = document.createElement('p')
  hint.className = 'wm__hint'
  hint.textContent = '棕色 +1、金色 +3，別打炸彈（−3）'

  const board = document.createElement('div')
  board.className = 'wm__board'
  board.addEventListener('contextmenu', (e) => e.preventDefault())
  const cells = Array.from({ length: GRID }, (_, i) => {
    const cell = document.createElement('div')
    cell.className = 'wm__cell'
    const mole = document.createElement('div')
    mole.className = 'wm__mole'
    const mound = document.createElement('div')
    mound.className = 'wm__mound'
    cell.append(mole, mound)
    cell.addEventListener('mousedown', (e) => {
      if (e.button === 0) onWhack(i, e)
    })
    board.append(cell)
    return { cell, mole }
  })

  root.append(stats, hint, board)
  container.append(root)

  // --- 畫面更新 ---
  const render = (): void => {
    holes.forEach((h, i) => {
      const c = cells[i]
      if (!c) return
      const shown = h.kind !== null
      const key = h.kind ?? ''
      if (c.mole.dataset.kind !== key) {
        c.mole.dataset.kind = key
        c.mole.replaceChildren(...(h.kind ? [createFace(h.kind)] : []))
      }
      c.cell.classList.toggle('is-up', shown)
      c.cell.classList.toggle('is-hit', h.hit > 0)
    })
    scoreStat.value.textContent = String(score)
    timeStat.value.textContent = String(Math.ceil(timeLeft))
    accStat.value.textContent = clicks === 0 ? '—' : `${Math.round((hits / clicks) * 100)}%`
  }

  const floatText = (i: number, text: string, bad: boolean): void => {
    const c = cells[i]
    if (!c) return
    const el = document.createElement('span')
    el.className = bad ? 'wm__pop is-bad' : 'wm__pop'
    el.textContent = text
    c.cell.append(el)
    const id = window.setTimeout(() => {
      el.remove()
      popups.delete(id)
    }, 700)
    popups.add(id)
  }

  // --- 流程 ---
  const spawn = (): void => {
    const free = holes.map((h, i) => (h.kind === null && h.hit <= 0 ? i : -1)).filter((i) => i >= 0)
    if (free.length === 0) return
    const i = rng.pick(free)
    const r = rng.next()
    const kind: Kind = elapsed > 8 && r < 0.12 ? 'bomb' : r > 0.9 ? 'gold' : 'mole'
    const base = Math.max(0.55, 1.15 - elapsed * 0.01)
    const hole = holes[i] as Hole
    hole.kind = kind
    hole.life = kind === 'gold' ? base * 0.7 : kind === 'bomb' ? base * 1.1 : base
  }

  const finish = (): void => {
    running = false
    best = Math.max(best, score)
    ctx.audio.play('success')
    const acc = clicks === 0 ? 0 : Math.round((hits / clicks) * 100)
    dialog = Dialog({
      title: '時間到！',
      content: [`分數 ${score}，打中 ${hits} 次，命中率 ${acc}%，本次最高 ${best}`, '再玩一次嗎？'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '再玩一次', onClick: () => start() }),
      ],
    })
    dialog.open()
  }

  const tick = (): void => {
    if (!running || paused) return
    const dt = TICK_MS / 1000
    timeLeft -= dt
    elapsed += dt
    holes.forEach((h) => {
      if (h.hit > 0) {
        // 被打中：演完動畫就消失
        h.hit -= dt
        if (h.hit <= 0) {
          h.hit = 0
          h.kind = null
        }
      } else if (h.kind !== null) {
        h.life -= dt
        if (h.life <= 0) h.kind = null
      }
    })
    spawnTimer -= dt
    const maxUp = Math.min(4, 1 + Math.floor(elapsed / 18))
    const up = holes.filter((h) => h.kind !== null).length
    if (spawnTimer <= 0 && up < maxUp) {
      spawn()
      spawnTimer = Math.max(0.3, 0.85 - elapsed * 0.008) * (0.7 + rng.next() * 0.6)
    }
    if (timeLeft <= 0) {
      timeLeft = 0
      render()
      finish()
      return
    }
    render()
  }

  const onWhack = (i: number, e: MouseEvent): void => {
    if (!running || paused) return
    e.preventDefault()
    clicks += 1
    const hole = holes[i] as Hole
    if (hole.kind === null || hole.hit > 0) {
      ctx.audio.play('click')
      render()
      return
    }
    const kind = hole.kind
    const pts = POINTS[kind]
    score = Math.max(0, score + pts)
    if (kind === 'bomb') {
      ctx.audio.play('explosion')
    } else {
      hits += 1
      ctx.audio.play('score')
    }
    floatText(i, pts > 0 ? `+${pts}` : String(pts), pts < 0)
    // 被打中的地鼠保留在畫面上演出被打扁的動畫，再縮回去
    hole.hit = 0.3
    render()
  }

  const start = (): void => {
    dialog?.close()
    dialog = null
    holes = Array.from({ length: GRID }, () => ({ kind: null, life: 0, hit: 0 }))
    score = 0
    timeLeft = GAME_SECONDS
    elapsed = 0
    spawnTimer = 0.6
    hits = 0
    clicks = 0
    paused = false
    running = true
    render()
  }

  const showMenu = (): void => {
    holes = Array.from({ length: GRID }, () => ({ kind: null, life: 0, hit: 0 }))
    running = false
    render()
    dialog = Dialog({
      title: '打地鼠',
      content: [
        `${GAME_SECONDS} 秒內用滑鼠點擊冒出來的地鼠。`,
        '棕色 +1、金色 +3，炸彈打到扣 3 分。越到後面冒得越快。',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '開始', onClick: () => start() }),
      ],
    })
    dialog.open()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (!running || paused) return
    paused = true
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '重新開始',
          variant: 'secondary',
          onClick: () => {
            closeDialog()
            showMenu()
          },
        }),
        Button({ label: '繼續', onClick: () => closeDialog() }),
      ],
    })
    dialog.open()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || e.repeat) return
    if (paused) closeDialog()
    else pause()
  }
  window.addEventListener('keydown', onKeyDown)
  timer = window.setInterval(tick, TICK_MS)

  cleanup = () => {
    window.clearInterval(timer)
    popups.forEach((id) => window.clearTimeout(id))
    popups.clear()
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  showMenu()
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
