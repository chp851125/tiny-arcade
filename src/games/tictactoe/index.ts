import './tictactoe.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import { chooseCpuMove, findWin, isFull } from './logic.ts'
import type { Cell, Mark, Win } from './logic.ts'

/** 井字棋：玩家（X）對電腦（O），雙方輪流先手 */

const HUMAN: Mark = 'X'
const CPU: Mark = 'O'
const CPU_DELAY_MS = 500
const SVG_NS = 'http://www.w3.org/2000/svg'

type Result = { win: Win } | { draw: true }

let cleanup: (() => void) | null = null

function createMark(mark: Mark): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', mark === 'X' ? 'ttt__mark' : 'ttt__mark ttt__mark--o')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    mark === 'X' ? '<path d="M20 20L80 80M80 20L20 80"/>' : '<circle cx="50" cy="50" r="30"/>'
  return svg
}

function createScoreCard(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'ttt__score-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'ttt__score-value'
  value.textContent = '0'
  return { card: Card({ children: [name, value] }), value }
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let board: Cell[] = Array<Cell>(9).fill(null)
  let round = 0
  let turn: Mark = HUMAN
  let result: Result | null = null
  const score = { win: 0, lose: 0, draw: 0 }
  let cpuTimer = 0
  let paused = false
  let dialog: DialogHandle | null = null

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'ttt'

  const scoreRow = document.createElement('div')
  scoreRow.className = 'ttt__score'
  const youScore = createScoreCard('你（X）')
  const drawScore = createScoreCard('平手')
  const cpuScore = createScoreCard('電腦（O）')
  scoreRow.append(youScore.card, drawScore.card, cpuScore.card)

  const status = document.createElement('p')
  status.className = 'ttt__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'ttt__board'
  const cells = Array.from({ length: 9 }, (_, i) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'ttt__cell'
    cell.setAttribute('aria-label', `第 ${i + 1} 格`)
    cell.addEventListener('click', () => onCellClick(i))
    boardEl.append(cell)
    return cell
  })

  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => nextRound() })
  againButton.hidden = true
  const actions = document.createElement('div')
  actions.className = 'ttt__actions'
  actions.append(pauseButton, againButton)

  root.append(scoreRow, status, boardEl, actions)
  container.append(root)

  // --- 流程 ---
  const render = (): void => {
    const winLine = result && 'win' in result ? result.win.line : []
    cells.forEach((cell, i) => {
      const mark = board[i] ?? null
      cell.replaceChildren(...(mark ? [createMark(mark)] : []))
      cell.classList.toggle('is-open', mark === null && result === null && turn === HUMAN)
      cell.classList.toggle('is-win', winLine.includes(i))
    })
    youScore.value.textContent = String(score.win)
    drawScore.value.textContent = String(score.draw)
    cpuScore.value.textContent = String(score.lose)
    againButton.hidden = result === null
    if (result === null) {
      status.textContent = turn === HUMAN ? '輪到你了（X）' : '電腦思考中…'
    } else if ('draw' in result) {
      status.textContent = '平手！'
    } else {
      status.textContent = result.win.mark === HUMAN ? '你贏了！' : '電腦贏了'
    }
  }

  const scheduleCpu = (): void => {
    cpuTimer = window.setTimeout(() => {
      cpuTimer = 0
      place(chooseCpuMove(board, CPU, rng), CPU)
    }, CPU_DELAY_MS)
  }

  const place = (index: number, mark: Mark): void => {
    board[index] = mark
    const win = findWin(board)
    if (win) {
      result = { win }
      if (win.mark === HUMAN) {
        score.win += 1
        ctx.audio.play('success')
      } else {
        score.lose += 1
        ctx.audio.play('fail')
      }
    } else if (isFull(board)) {
      result = { draw: true }
      score.draw += 1
      ctx.audio.play('score')
    } else {
      ctx.audio.play('click')
      turn = mark === HUMAN ? CPU : HUMAN
    }
    render()
    if (result === null && turn === CPU) scheduleCpu()
  }

  const onCellClick = (index: number): void => {
    if (paused || result !== null || turn !== HUMAN || board[index] !== null) return
    place(index, HUMAN)
  }

  /** 開新的一局；先手每局輪流 */
  const startRound = (): void => {
    window.clearTimeout(cpuTimer)
    cpuTimer = 0
    board = Array<Cell>(9).fill(null)
    result = null
    turn = round % 2 === 0 ? HUMAN : CPU
    render()
    if (turn === CPU) scheduleCpu()
  }
  const nextRound = (): void => {
    round += 1
    startRound()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused) return
    paused = true
    window.clearTimeout(cpuTimer)
    cpuTimer = 0
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '重新開始這局',
          variant: 'secondary',
          onClick: () => {
            closeDialog()
            startRound()
          },
        }),
        Button({ label: '繼續', onClick: () => resume() }),
      ],
    })
    dialog.open()
  }

  const resume = (): void => {
    if (!paused) return
    closeDialog()
    if (result === null && turn === CPU) scheduleCpu()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || e.repeat) return
    if (paused) resume()
    else pause()
  }
  window.addEventListener('keydown', onKeyDown)

  cleanup = () => {
    window.clearTimeout(cpuTimer)
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  startRound()
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
