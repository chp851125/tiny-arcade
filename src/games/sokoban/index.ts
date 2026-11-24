import './sokoban.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import type { GameContext } from '../types.ts'
import { LEVELS } from './levels.ts'
import { cloneState, isSolved, parseLevel, step } from './logic.ts'
import type { Direction, State } from './logic.ts'

/** 推箱子：方向鍵（或 WASD）移動並推箱子，把所有箱子推到目標上 */

const SVG_NS = 'http://www.w3.org/2000/svg'
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

function createPlayer(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'sk__player')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<circle cx="50" cy="50" r="34"/><circle cx="39" cy="45" r="4" class="sk__eye"/><circle cx="61" cy="45" r="4" class="sk__eye"/><path d="M38 62Q50 72 62 62" class="sk__mouth"/>'
  return svg
}

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'sk__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'sk__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  let levelIndex = 0
  let state: State = parseLevel(LEVELS[0] ?? { name: '', rows: ['#@#'] })
  let history: State[] = []
  let solved = false
  let paused = false
  let dialog: DialogHandle | null = null
  let cellEls: HTMLElement[] = []

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'sk'

  const levelRow = document.createElement('div')
  levelRow.className = 'sk__levels'
  const levelButtons = LEVELS.map((_, i) => {
    const b = Button({ label: String(i + 1), variant: 'secondary', onClick: () => load(i) })
    levelRow.append(b)
    return b
  })

  const movesStat = createStat('步數')
  const pushesStat = createStat('推箱')
  const undoButton = Button({ label: '復原', variant: 'secondary', onClick: () => undo() })
  const resetButton = Button({
    label: '重來',
    variant: 'secondary',
    onClick: () => load(levelIndex),
  })
  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const nextButton = Button({ label: '下一關', onClick: () => load(levelIndex + 1) })
  const top = document.createElement('div')
  top.className = 'sk__top'
  top.append(movesStat.card, pushesStat.card, undoButton, resetButton, pauseButton, nextButton)

  const status = document.createElement('p')
  status.className = 'sk__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'sk__board'

  root.append(levelRow, top, status, boardEl)
  container.append(root)

  // --- 畫面更新 ---
  const buildBoard = (): void => {
    boardEl.style.setProperty('--cols', String(state.width))
    boardEl.style.setProperty('--rows', String(state.height))
    cellEls = state.walls.map((wall, i) => {
      const el = document.createElement('div')
      el.className = wall ? 'sk__cell is-wall' : state.floor[i] ? 'sk__cell is-floor' : 'sk__cell'
      if (state.goals[i]) el.classList.add('is-goal')
      return el
    })
    boardEl.replaceChildren(...cellEls)
  }

  const render = (): void => {
    cellEls.forEach((el, i) => {
      const hasBox = state.boxes.includes(i)
      const isPlayer = state.player === i
      el.classList.toggle('has-box', hasBox)
      el.classList.toggle('is-done', hasBox && state.goals[i] === true)
      const hasPlayerEl = el.querySelector('.sk__player') !== null
      if (isPlayer && !hasPlayerEl) el.append(createPlayer())
      else if (!isPlayer && hasPlayerEl) el.querySelector('.sk__player')?.remove()
    })
    movesStat.value.textContent = String(state.moves)
    pushesStat.value.textContent = String(state.pushes)
    levelButtons.forEach((b, i) => {
      b.className = `ui-button ui-button--${i === levelIndex ? 'primary' : 'secondary'}`
    })
    const last = levelIndex === LEVELS.length - 1
    if (solved) {
      status.textContent = last
        ? `全部通關！這關用了 ${state.moves} 步`
        : `過關！用了 ${state.moves} 步、推了 ${state.pushes} 次`
    } else {
      status.textContent = `第 ${levelIndex + 1} / ${LEVELS.length} 關`
    }
    nextButton.hidden = !solved || last
    undoButton.disabled = history.length === 0 || solved
  }

  // --- 流程 ---
  const load = (index: number): void => {
    if (paused) return
    levelIndex = Math.min(Math.max(index, 0), LEVELS.length - 1)
    state = parseLevel(LEVELS[levelIndex] ?? { name: '', rows: ['#@#'] })
    history = []
    solved = false
    buildBoard()
    render()
  }

  const move = (dir: Direction): void => {
    if (paused || solved) return
    const before = cloneState(state)
    const result = step(state, dir)
    if (!result.moved) return
    history.push(before)
    if (result.pushed) ctx.audio.play('click')
    if (isSolved(state)) {
      solved = true
      ctx.audio.play('success')
    }
    render()
  }

  const undo = (): void => {
    if (paused || solved) return
    const prev = history.pop()
    if (!prev) return
    state = prev
    render()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused) return
    paused = true
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '重來這關',
          variant: 'secondary',
          onClick: () => {
            closeDialog()
            load(levelIndex)
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
    if (paused) return
    const dir = KEYS[e.code]
    if (dir) {
      e.preventDefault()
      move(dir)
    } else if (e.code === 'KeyZ' || e.code === 'Backspace') undo()
    else if (e.code === 'KeyR' && !e.repeat) load(levelIndex)
    else if (
      (e.code === 'Enter' || e.code === 'Space') &&
      solved &&
      levelIndex < LEVELS.length - 1
    ) {
      if (!(e.target instanceof HTMLButtonElement)) load(levelIndex + 1)
    }
  }
  window.addEventListener('keydown', onKeyDown)

  cleanup = () => {
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  load(0)
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
