import './link-up.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import { createSymbolSvg } from '../../shared/symbols.ts'
import type { GameContext } from '../types.ts'
import { LEVELS, createBoard, findMove, findPath, pointOf, remaining, reshuffle } from './logic.ts'
import type { Board, Level, Point } from './logic.ts'

/** 連連看：選兩張相同的牌，中間用不超過兩個轉彎的線連得起來就消除 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const PATH_SHOW_MS = 260
const HINT_SHOW_MS = 1500

let cleanup: (() => void) | null = null

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'lu__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'lu__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

function formatTime(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let level: Level = LEVELS[0] as Level
  let board: Board = { width: 0, height: 0, cells: [] }
  let selected = -1
  let busy = false
  let won = false
  let notice = ''
  let seconds = 0
  let timer = 0
  let effectTimer = 0
  let paused = false
  let dialog: DialogHandle | null = null
  let cellEls: HTMLButtonElement[] = []

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'lu'

  const levelRow = document.createElement('div')
  levelRow.className = 'lu__levels'
  const levelButtons = LEVELS.map((l) => {
    const b = Button({ label: l.label, variant: 'secondary', onClick: () => setLevel(l) })
    b.title = `${l.cols}×${l.rows}，${l.types} 種圖案`
    levelRow.append(b)
    return b
  })
  const leftStat = createStat('剩餘牌')
  const timeStat = createStat('時間')
  const hintButton = Button({ label: '提示', variant: 'secondary', onClick: () => hint() })
  const shuffleButton = Button({ label: '洗牌', variant: 'secondary', onClick: () => shuffle() })
  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const top = document.createElement('div')
  top.className = 'lu__top'
  top.append(
    levelRow,
    leftStat.card,
    timeStat.card,
    hintButton,
    shuffleButton,
    pauseButton,
    againButton,
  )

  const status = document.createElement('p')
  status.className = 'lu__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'lu__board'
  const lineSvg = document.createElementNS(SVG_NS, 'svg')
  lineSvg.setAttribute('class', 'lu__line')
  lineSvg.setAttribute('aria-hidden', 'true')

  root.append(top, status, boardEl)
  container.append(root)

  // --- 畫面更新 ---
  const render = (): void => {
    cellEls.forEach((el, i) => {
      const type = board.cells[i] ?? 0
      const shown = el.dataset.type === String(type)
      if (!shown) {
        el.dataset.type = String(type)
        el.replaceChildren(...(type > 0 ? [createSymbolSvg(type - 1, 'lu__symbol')] : []))
      }
      el.classList.toggle('is-empty', type === 0)
      el.classList.toggle('is-selected', i === selected)
      el.tabIndex = type === 0 ? -1 : 0
    })
    leftStat.value.textContent = String(remaining(board))
    timeStat.value.textContent = formatTime(seconds)
    levelButtons.forEach((b, i) => {
      b.className = `ui-button ui-button--${LEVELS[i] === level ? 'primary' : 'secondary'}`
    })
    if (won) status.textContent = `全部消除！用了 ${formatTime(seconds)}`
    else status.textContent = notice || '選兩張相同的牌，線最多轉兩次彎就能消除'
    againButton.hidden = !won
    pauseButton.hidden = won
    hintButton.hidden = won
    shuffleButton.hidden = won
  }

  const buildBoard = (): void => {
    boardEl.style.setProperty('--cols', String(board.width))
    boardEl.style.setProperty('--rows', String(board.height))
    lineSvg.setAttribute('viewBox', `0 0 ${board.width} ${board.height}`)
    cellEls = board.cells.map((_, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'lu__cell'
      el.addEventListener('click', () => onCell(i))
      return el
    })
    boardEl.replaceChildren(...cellEls, lineSvg)
  }

  // --- 流程 ---
  const stopTimer = (): void => {
    window.clearInterval(timer)
    timer = 0
  }
  const startTimer = (): void => {
    stopTimer()
    timer = window.setInterval(() => {
      seconds += 1
      timeStat.value.textContent = formatTime(seconds)
    }, 1000)
  }

  const clearEffect = (): void => {
    window.clearTimeout(effectTimer)
    effectTimer = 0
    lineSvg.replaceChildren()
    cellEls.forEach((el) => el.classList.remove('is-hint'))
  }

  const drawPath = (path: Point[]): void => {
    const line = document.createElementNS(SVG_NS, 'polyline')
    line.setAttribute('points', path.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' '))
    lineSvg.replaceChildren(line)
  }

  const restart = (): void => {
    clearEffect()
    board = createBoard(level, rng)
    if (!findMove(board)) reshuffle(board, rng)
    selected = -1
    busy = false
    won = false
    notice = ''
    seconds = 0
    buildBoard()
    startTimer()
    render()
  }

  const setLevel = (next: Level): void => {
    if (paused) return
    level = next
    restart()
  }

  const ensureMoves = (): void => {
    if (remaining(board) === 0 || findMove(board)) return
    reshuffle(board, rng)
    notice = '沒有能連的牌了，已自動重新洗牌'
  }

  const onCell = (i: number): void => {
    if (paused || busy || won || (board.cells[i] ?? 0) === 0) return
    notice = ''
    clearEffect()
    if (selected === -1) {
      selected = i
      ctx.audio.play('click')
      render()
      return
    }
    if (selected === i) {
      selected = -1
      render()
      return
    }
    const first = selected
    if (board.cells[first] !== board.cells[i]) {
      selected = i
      ctx.audio.play('click')
      render()
      return
    }
    const path = findPath(board, pointOf(board, first), pointOf(board, i))
    if (!path) {
      selected = i
      notice = '這兩張連不起來'
      ctx.audio.play('fail')
      render()
      return
    }
    // 消除：先畫出連線，短暫停留後移除
    busy = true
    selected = i
    drawPath(path)
    ctx.audio.play('score')
    render()
    effectTimer = window.setTimeout(() => {
      effectTimer = 0
      lineSvg.replaceChildren()
      board.cells[first] = 0
      board.cells[i] = 0
      selected = -1
      busy = false
      if (remaining(board) === 0) {
        won = true
        stopTimer()
        ctx.audio.play('success')
      } else {
        ensureMoves()
      }
      render()
    }, PATH_SHOW_MS)
  }

  const hint = (): void => {
    if (paused || busy || won) return
    const move = findMove(board)
    if (!move) return
    clearEffect()
    cellEls[move.a]?.classList.add('is-hint')
    cellEls[move.b]?.classList.add('is-hint')
    effectTimer = window.setTimeout(clearEffect, HINT_SHOW_MS)
  }

  const shuffle = (): void => {
    if (paused || busy || won) return
    clearEffect()
    reshuffle(board, rng)
    selected = -1
    notice = '已重新洗牌'
    ctx.audio.play('click')
    render()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
    if (!won) startTimer()
  }

  const pause = (): void => {
    if (paused || won) return
    paused = true
    stopTimer()
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
    stopTimer()
    window.clearTimeout(effectTimer)
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
