import './game-2048.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import { SIZE, canMove, emptyBoard, move, spawn } from './logic.ts'
import type { Direction } from './logic.ts'

/** 2048：方向鍵（或 WASD）滑動，相同數字相撞就合併 */

const WIN_VALUE = 2048
const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

let cleanup: (() => void) | null = null

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'g2048__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'g2048__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

/** 數字越大，主色越濃 */
function tileMix(value: number): number {
  return Math.min(100, 12 + Math.log2(value) * 8)
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let board = emptyBoard()
  let score = 0
  let over = false
  let reached = false
  let paused = false
  let freshIndex = -1
  let mergedIndexes: number[] = []
  let dialog: DialogHandle | null = null

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'g2048'

  const stats = document.createElement('div')
  stats.className = 'g2048__stats'
  const scoreStat = createStat('分數')
  const bestStat = createStat('最大')
  stats.append(scoreStat.card, bestStat.card)

  const status = document.createElement('p')
  status.className = 'g2048__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'g2048__board'
  const cells = Array.from({ length: SIZE * SIZE }, () => {
    const cell = document.createElement('div')
    cell.className = 'g2048__cell'
    boardEl.append(cell)
    return cell
  })

  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const actions = document.createElement('div')
  actions.className = 'g2048__actions'
  actions.append(pauseButton, againButton)

  root.append(stats, status, boardEl, actions)
  container.append(root)

  // --- 流程 ---
  const render = (): void => {
    cells.forEach((cell, i) => {
      const value = board[i] ?? 0
      cell.textContent = value === 0 ? '' : String(value)
      cell.classList.toggle('has-tile', value !== 0)
      cell.classList.toggle('is-new', i === freshIndex)
      cell.classList.toggle('is-merged', mergedIndexes.includes(i))
      cell.dataset.digits = String(String(value).length)
      cell.style.setProperty('--mix', value === 0 ? '0%' : `${tileMix(value)}%`)
    })
    scoreStat.value.textContent = String(score)
    bestStat.value.textContent = String(Math.max(0, ...board))
    if (over) status.textContent = '無法再移動了'
    else if (reached) status.textContent = `達成 ${WIN_VALUE}！可以繼續挑戰`
    else status.textContent = '用方向鍵滑動方塊'
    againButton.hidden = !over
    pauseButton.hidden = over
  }

  const slide = (dir: Direction): void => {
    if (paused || over) return
    const result = move(board, dir)
    if (!result.moved) return
    const before = board
    board = result.board
    score += result.gained
    // 合併出來的格子：移動後數字比移動前同位置大，且本次有得分時標記
    mergedIndexes =
      result.gained > 0
        ? board.map((v, i) => (v !== 0 && v > (before[i] ?? 0) ? i : -1)).filter((i) => i >= 0)
        : []
    freshIndex = spawn(board, rng)
    if (result.gained > 0) ctx.audio.play('score')
    else ctx.audio.play('click')
    if (!reached && board.some((v) => v >= WIN_VALUE)) {
      reached = true
      ctx.audio.play('success')
    }
    if (!canMove(board)) {
      over = true
      ctx.audio.play('fail')
    }
    render()
  }

  const restart = (): void => {
    board = emptyBoard()
    score = 0
    over = false
    reached = false
    mergedIndexes = []
    freshIndex = spawn(board, rng)
    spawn(board, rng)
    render()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused || over) return
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
            restart()
          },
        }),
        Button({ label: '繼續', onClick: () => closeDialog() }),
      ],
    })
    dialog.open()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (paused) closeDialog()
      else pause()
      return
    }
    const dir = KEYS[e.code]
    if (!dir) return
    e.preventDefault()
    slide(dir)
  }
  window.addEventListener('keydown', onKeyDown)

  cleanup = () => {
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
