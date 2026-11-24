import './match-three.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import {
  LEVELS,
  SIZE,
  areAdjacent,
  collapse,
  createBoard,
  findMatches,
  findMove,
  reshuffle,
  swapCells,
} from './logic.ts'
import type { Board, Level, Tile } from './logic.ts'

/** 三消：拖曳（或先後點選）相鄰的寶石交換，湊成三顆以上就消除，限時 90 秒比分數 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const GAME_SECONDS = 90
const SWAP_MS = 170
const CLEAR_MS = 220
const FALL_MS = 320

const SHAPES: readonly string[] = [
  '<circle cx="50" cy="50" r="32"/>',
  '<rect x="22" y="22" width="56" height="56" rx="8"/>',
  '<path d="M50 16L86 80H14Z"/>',
  '<path d="M50 12L86 50L50 88L14 50Z"/>',
  '<path d="M50 14L60 40L88 42L66 60L74 86L50 70L26 86L34 60L12 42L40 40Z"/>',
  '<path d="M50 84C10 54 18 22 38 22C46 22 50 30 50 34C50 30 54 22 62 22C82 22 90 54 50 84Z"/>',
  '<path d="M30 16H70L90 50L70 84H30L10 50Z"/>',
]
const COLORS = ['#ff6b5e', '#4aa3ff', '#ffc933', '#2fb67c', '#b36bff', '#ff7ab8', '#ff9a3c']

let cleanup: (() => void) | null = null

function createGem(type: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'm3__gem')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.fill = COLORS[type] ?? '#000'
  svg.innerHTML = SHAPES[type] ?? ''
  return svg
}

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'm3__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'm3__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let level: Level = LEVELS[0] as Level
  let board: Board = []
  const tileEls = new Map<number, HTMLElement>()
  let score = 0
  let timeLeft = GAME_SECONDS
  let timer = 0
  let selected = -1
  let busy = false
  let over = false
  let timeUp = false
  let paused = false
  let notice = ''
  let dialog: DialogHandle | null = null
  let generation = 0
  const pending = new Set<number>()

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'm3'

  const levelRow = document.createElement('div')
  levelRow.className = 'm3__levels'
  const levelButtons = LEVELS.map((l) => {
    const b = Button({ label: l.label, variant: 'secondary', onClick: () => setLevel(l) })
    b.title = `${l.types} 種寶石`
    levelRow.append(b)
    return b
  })
  const scoreStat = createStat('分數')
  const timeStat = createStat('剩餘時間')
  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const top = document.createElement('div')
  top.className = 'm3__top'
  top.append(levelRow, scoreStat.card, timeStat.card, pauseButton, againButton)

  const status = document.createElement('p')
  status.className = 'm3__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'm3__board'

  root.append(top, status, boardEl)
  container.append(root)

  // --- 畫面更新 ---
  const setPos = (el: HTMLElement, x: number, y: number): void => {
    el.style.setProperty('--x', String(x))
    el.style.setProperty('--y', String(y))
  }

  const addTileEl = (tile: Tile, x: number, y: number): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'm3__tile'
    el.append(createGem(tile.type))
    setPos(el, x, y)
    tileEls.set(tile.id, el)
    boardEl.append(el)
    return el
  }

  const syncPositions = (): void => {
    board.forEach((tile, i) => {
      if (tile) {
        const el = tileEls.get(tile.id)
        if (el) setPos(el, i % SIZE, Math.floor(i / SIZE))
      }
    })
  }

  const render = (): void => {
    board.forEach((tile, i) => {
      if (tile) tileEls.get(tile.id)?.classList.toggle('is-selected', i === selected)
    })
    scoreStat.value.textContent = String(score)
    timeStat.value.textContent = String(timeLeft)
    levelButtons.forEach((b, i) => {
      b.className = `ui-button ui-button--${LEVELS[i] === level ? 'primary' : 'secondary'}`
    })
    if (over) status.textContent = `時間到！得分 ${score}`
    else status.textContent = notice || '拖曳寶石和旁邊的交換，湊成三顆以上'
    againButton.hidden = !over
    pauseButton.hidden = over
  }

  // --- 流程 ---
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const id = window.setTimeout(() => {
        pending.delete(id)
        resolve()
      }, ms)
      pending.add(id)
    })

  const stopTimer = (): void => {
    window.clearInterval(timer)
    timer = 0
  }
  const startTimer = (): void => {
    stopTimer()
    timer = window.setInterval(() => {
      timeLeft = Math.max(0, timeLeft - 1)
      timeStat.value.textContent = String(timeLeft)
      if (timeLeft === 0) {
        stopTimer()
        if (busy) timeUp = true
        else finish()
      }
    }, 1000)
  }

  const finish = (): void => {
    over = true
    selected = -1
    stopTimer()
    ctx.audio.play('success')
    render()
  }

  const restart = (): void => {
    generation += 1
    pending.forEach((id) => window.clearTimeout(id))
    pending.clear()
    board = createBoard(level, rng)
    tileEls.clear()
    boardEl.replaceChildren()
    board.forEach((tile, i) => {
      if (tile) addTileEl(tile, i % SIZE, Math.floor(i / SIZE))
    })
    score = 0
    timeLeft = GAME_SECONDS
    selected = -1
    busy = false
    over = false
    timeUp = false
    notice = ''
    startTimer()
    render()
  }

  const setLevel = (next: Level): void => {
    if (paused) return
    level = next
    restart()
  }

  /** 反覆消除、掉落，直到盤面穩定 */
  const resolve = async (gen: number): Promise<void> => {
    let chain = 1
    for (;;) {
      const matches = findMatches(board)
      if (matches.size === 0) break
      score += matches.size * 10 * chain
      notice = chain > 1 ? `連鎖 ×${chain}！` : ''
      ctx.audio.play(chain > 1 ? 'success' : 'score')
      matches.forEach((i) => {
        const tile = board[i]
        if (tile) tileEls.get(tile.id)?.classList.add('is-clearing')
        board[i] = null
      })
      render()
      await wait(CLEAR_MS)
      if (gen !== generation) return
      boardEl.querySelectorAll('.is-clearing').forEach((el) => el.remove())
      const falls = collapse(board, level, rng)
      const fresh: HTMLElement[] = []
      for (const f of falls) {
        if (f.isNew) fresh.push(addTileEl(f.tile, f.toX, f.fromY))
      }
      void boardEl.offsetHeight // 讓新寶石先停在上方，再開始往下掉
      for (const f of falls) {
        const el = tileEls.get(f.tile.id)
        if (el) setPos(el, f.toX, f.toY)
      }
      render()
      await wait(FALL_MS)
      if (gen !== generation) return
      chain += 1
    }
    if (!findMove(board)) {
      reshuffle(board, rng)
      syncPositions()
      notice = '沒有能交換的寶石了，已自動洗牌'
      await wait(FALL_MS)
      if (gen !== generation) return
    }
  }

  const trySwap = async (i: number, j: number): Promise<void> => {
    if (paused || busy || over) return
    const gen = generation
    busy = true
    selected = -1
    notice = ''
    swapCells(board, i, j)
    syncPositions()
    render()
    await wait(SWAP_MS)
    if (gen !== generation) return
    if (findMatches(board).size === 0) {
      // 沒有湊成，換回去
      swapCells(board, i, j)
      syncPositions()
      ctx.audio.play('fail')
      await wait(SWAP_MS)
      if (gen !== generation) return
    } else {
      await resolve(gen)
      if (gen !== generation) return
    }
    busy = false
    if (timeUp) finish()
    else render()
  }

  const onSelect = (i: number): void => {
    if (paused || busy || over || !board[i]) return
    if (selected === -1) {
      selected = i
      ctx.audio.play('click')
    } else if (selected === i) {
      selected = -1
    } else if (areAdjacent(selected, i)) {
      void trySwap(selected, i)
      return
    } else {
      selected = i
      ctx.audio.play('click')
    }
    render()
  }

  // --- 滑鼠：拖曳或點選 ---
  const cellAt = (e: PointerEvent): number => {
    const rect = boardEl.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * SIZE)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * SIZE)
    return x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : y * SIZE + x
  }

  let drag: { index: number; x: number; y: number; moved: boolean } | null = null

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    const index = cellAt(e)
    if (index < 0) return
    drag = { index, x: e.clientX, y: e.clientY, moved: false }
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (!drag || drag.moved) return
    const cell = boardEl.getBoundingClientRect().width / SIZE
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * 0.35) return
    drag.moved = true
    const from = drag.index
    const col = from % SIZE
    const row = Math.floor(from / SIZE)
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const tx = col + (horizontal ? Math.sign(dx) : 0)
    const ty = row + (horizontal ? 0 : Math.sign(dy))
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return
    if (paused || busy || over) return
    void trySwap(from, ty * SIZE + tx)
  }

  const onPointerUp = (): void => {
    if (drag && !drag.moved) onSelect(drag.index)
    drag = null
  }

  boardEl.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
    if (!over) startTimer()
  }

  const pause = (): void => {
    if (paused || over) return
    paused = true
    stopTimer()
    drag = null
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '重新開始',
          variant: 'secondary',
          onClick: () => {
            dialog?.close()
            dialog = null
            paused = false
            restart()
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

  cleanup = () => {
    generation += 1
    stopTimer()
    pending.forEach((id) => window.clearTimeout(id))
    pending.clear()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  restart()
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
