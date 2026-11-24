import './minesweeper.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import { LEVELS, countAround, floodReveal, neighbors, placeMines } from './logic.ts'
import type { Level } from './logic.ts'

/** 踩地雷：左鍵翻開、右鍵插旗，點已翻開的數字可一次翻開周圍（旗數要吻合） */

const SVG_NS = 'http://www.w3.org/2000/svg'
const FLAG_SVG =
  '<path d="M30 14V88" /><path d="M30 16L76 34L30 54Z" class="ms__flag-fill"/><path d="M16 88H46"/>'
const MINE_SVG =
  '<circle cx="50" cy="50" r="22" class="ms__mine-fill"/><path d="M50 14V30M50 70V86M14 50H30M70 50H86M24 24L36 36M64 64L76 76M76 24L64 36M36 64L24 76"/>'

type Phase = 'ready' | 'playing' | 'won' | 'lost'

let cleanup: (() => void) | null = null

function icon(inner: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'ms__icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = inner
  return svg
}

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'ms__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'ms__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let level: Level = LEVELS[0] as Level
  let mines: boolean[] | null = null
  let counts: number[] = []
  let revealed: boolean[] = []
  let flagged: boolean[] = []
  let phase: Phase = 'ready'
  let hit = -1
  let seconds = 0
  let timer = 0
  let paused = false
  let dialog: DialogHandle | null = null
  let cells: HTMLButtonElement[] = []

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'ms'

  const levelRow = document.createElement('div')
  levelRow.className = 'ms__levels'
  const levelButtons = LEVELS.map((l) => {
    const b = Button({ label: l.label, variant: 'secondary', onClick: () => setLevel(l) })
    b.title = `${l.cols}×${l.rows}，${l.mines} 顆地雷`
    levelRow.append(b)
    return b
  })

  const stats = document.createElement('div')
  stats.className = 'ms__stats'
  const minesStat = createStat('剩餘地雷')
  const timeStat = createStat('時間')
  stats.append(minesStat.card, timeStat.card)

  const status = document.createElement('p')
  status.className = 'ms__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'ms__board'
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault())

  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const actions = document.createElement('div')
  actions.className = 'ms__actions'
  actions.append(pauseButton, againButton)

  const top = document.createElement('div')
  top.className = 'ms__top'
  top.append(levelRow, stats, actions)

  root.append(top, status, boardEl)
  container.append(root)

  // --- 畫面更新 ---
  const paintCell = (i: number): void => {
    const cell = cells[i]
    if (!cell) return
    const isMine = mines?.[i] === true
    let state: string
    if (revealed[i]) state = `n${counts[i] ?? 0}`
    else if (phase === 'lost' && isMine) state = i === hit ? 'hit' : 'mine'
    else if (phase === 'lost' && flagged[i]) state = 'wrong'
    else if (flagged[i]) state = 'flag'
    else state = 'hidden'
    if (cell.dataset.state === state) return
    cell.dataset.state = state
    cell.className = `ms__cell is-${state.startsWith('n') ? 'open' : state}`
    cell.replaceChildren()
    if (state.startsWith('n')) {
      const n = counts[i] ?? 0
      if (n > 0) {
        cell.textContent = String(n)
        cell.dataset.n = String(n)
      }
    } else if (state === 'flag' || state === 'wrong') {
      cell.append(icon(FLAG_SVG))
    } else if (state === 'mine' || state === 'hit') {
      cell.append(icon(MINE_SVG))
    }
  }

  const render = (): void => {
    cells.forEach((_, i) => paintCell(i))
    const flags = flagged.filter(Boolean).length
    minesStat.value.textContent = String(level.mines - flags)
    timeStat.value.textContent = String(seconds)
    levelButtons.forEach((b, i) => {
      const active = LEVELS[i] === level
      b.className = `ui-button ui-button--${active ? 'primary' : 'secondary'}`
    })
    if (phase === 'won') status.textContent = `成功！用了 ${seconds} 秒`
    else if (phase === 'lost') status.textContent = '踩到地雷了'
    else status.textContent = `${level.cols}×${level.rows}，${level.mines} 顆地雷`
    againButton.hidden = phase !== 'won' && phase !== 'lost'
    pauseButton.hidden = !againButton.hidden
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
      timeStat.value.textContent = String(seconds)
    }, 1000)
  }

  const buildBoard = (): void => {
    boardEl.style.setProperty('--cols', String(level.cols))
    boardEl.style.setProperty('--rows', String(level.rows))
    cells = Array.from({ length: level.cols * level.rows }, (_, i) => {
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'ms__cell is-hidden'
      cell.dataset.state = 'hidden'
      cell.addEventListener('click', () => onReveal(i))
      cell.addEventListener('contextmenu', () => onFlag(i))
      return cell
    })
    boardEl.replaceChildren(...cells)
  }

  const restart = (): void => {
    stopTimer()
    mines = null
    counts = []
    const total = level.cols * level.rows
    revealed = Array<boolean>(total).fill(false)
    flagged = Array<boolean>(total).fill(false)
    phase = 'ready'
    hit = -1
    seconds = 0
    buildBoard()
    render()
  }

  const setLevel = (next: Level): void => {
    if (next === level && phase === 'ready') return
    level = next
    restart()
  }

  const lose = (index: number): void => {
    phase = 'lost'
    hit = index
    stopTimer()
    ctx.audio.play('explosion')
  }

  const checkWin = (): void => {
    if (phase !== 'playing') return
    if (revealed.filter(Boolean).length < level.cols * level.rows - level.mines) return
    phase = 'won'
    stopTimer()
    flagged = (mines ?? []).map((m) => m)
    ctx.audio.play('success')
  }

  /** 翻開一格（可能是地雷）；回傳是否踩雷 */
  const openCell = (i: number): boolean => {
    if (revealed[i] || flagged[i]) return false
    if (mines?.[i]) {
      lose(i)
      return true
    }
    for (const n of floodReveal(i, counts, revealed, flagged, level.cols, level.rows)) {
      revealed[n] = true
    }
    return false
  }

  const onReveal = (i: number): void => {
    if (paused || phase === 'won' || phase === 'lost' || flagged[i]) return
    if (mines === null) {
      mines = placeMines(level, i, rng)
      counts = countAround(mines, level.cols, level.rows)
      phase = 'playing'
      startTimer()
    }
    if (revealed[i]) {
      // 快速翻開：周圍旗數等於數字時，翻開其餘鄰格
      const around = neighbors(i, level.cols, level.rows)
      if (around.filter((n) => flagged[n]).length !== counts[i]) return
      for (const n of around) {
        if (openCell(n)) break
      }
    } else {
      openCell(i)
    }
    if (phase === 'playing') {
      ctx.audio.play('click')
      checkWin()
    }
    render()
  }

  const onFlag = (i: number): void => {
    if (paused || phase === 'won' || phase === 'lost' || revealed[i]) return
    flagged[i] = !flagged[i]
    ctx.audio.play('click')
    render()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
    if (phase === 'playing') startTimer()
  }

  const pause = (): void => {
    if (paused || phase === 'won' || phase === 'lost') return
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
