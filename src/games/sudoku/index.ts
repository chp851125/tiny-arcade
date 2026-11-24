import './sudoku.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import { CELLS, LEVELS, PEERS, SIZE, findConflicts, generate } from './logic.ts'
import type { Level } from './logic.ts'

/**
 * 數獨：點格子選取，數字鍵或右側數字鍵填入。
 * 右鍵點數字鍵（或按住 Shift 再按數字、或開啟筆記模式）可寫入不確定的小字。
 */

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

let cleanup: (() => void) | null = null

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'sd__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'sd__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

function formatTime(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let level: Level = LEVELS[0] as Level
  let givens: boolean[] = []
  let values: number[] = []
  /** 每格的筆記，第 d 位（1~9）代表有寫 d */
  let notes: number[] = []
  let selected = -1
  let noteMode = false
  let won = false
  let seconds = 0
  let timer = 0
  let paused = false
  let dialog: DialogHandle | null = null

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'sd'

  const levelRow = document.createElement('div')
  levelRow.className = 'sd__levels'
  const levelButtons = LEVELS.map((l) => {
    const b = Button({ label: l.label, variant: 'secondary', onClick: () => setLevel(l) })
    b.title = `提示 ${l.clues} 格`
    levelRow.append(b)
    return b
  })
  const timeStat = createStat('時間')
  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '新的一題', onClick: () => restart() })
  const top = document.createElement('div')
  top.className = 'sd__top'
  top.append(levelRow, timeStat.card, pauseButton, againButton)

  const status = document.createElement('p')
  status.className = 'sd__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'sd__board'
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault())
  const cellEls = Array.from({ length: CELLS }, (_, i) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'sd__cell'
    cell.setAttribute('aria-label', `第 ${Math.floor(i / SIZE) + 1} 列第 ${(i % SIZE) + 1} 欄`)
    const value = document.createElement('span')
    value.className = 'sd__value'
    const noteGrid = document.createElement('span')
    noteGrid.className = 'sd__notes'
    for (let d = 1; d <= SIZE; d++) noteGrid.append(document.createElement('span'))
    cell.append(value, noteGrid)
    cell.addEventListener('click', () => select(i))
    boardEl.append(cell)
    return { cell, value, noteGrid }
  })

  const side = document.createElement('div')
  side.className = 'sd__side'
  const pad = document.createElement('div')
  pad.className = 'sd__pad'
  const padButtons = Array.from({ length: SIZE }, (_, k) => {
    const d = k + 1
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'sd__key'
    b.textContent = String(d)
    b.addEventListener('click', () => input(d, noteMode))
    // 右鍵：寫不確定的小字
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      input(d, true)
    })
    pad.append(b)
    return b
  })
  const noteButton = Button({
    label: '筆記模式：關',
    variant: 'secondary',
    onClick: () => toggleNoteMode(),
  })
  const eraseButton = Button({ label: '清除', variant: 'secondary', onClick: () => erase() })
  const hint = document.createElement('p')
  hint.className = 'sd__hint'
  hint.textContent = '右鍵點數字＝寫小字\n鍵盤：Shift＋數字＝小字\nN 切換筆記模式'
  side.append(pad, noteButton, eraseButton, hint)

  const play = document.createElement('div')
  play.className = 'sd__play'
  play.append(boardEl, side)

  root.append(top, status, play)
  container.append(root)

  // --- 畫面更新 ---
  const render = (): void => {
    const conflicts = findConflicts(values)
    const selValue = selected >= 0 ? (values[selected] ?? 0) : 0
    const selPeers = selected >= 0 ? new Set(PEERS[selected]) : new Set<number>()
    const counts = Array<number>(SIZE + 1).fill(0)
    values.forEach((v) => {
      counts[v] = (counts[v] ?? 0) + 1
    })

    cellEls.forEach(({ cell, value, noteGrid }, i) => {
      const v = values[i] ?? 0
      cell.classList.toggle('is-given', givens[i] === true)
      cell.classList.toggle('is-selected', i === selected)
      cell.classList.toggle('is-peer', selPeers.has(i))
      cell.classList.toggle('is-same', selValue !== 0 && v === selValue && i !== selected)
      cell.classList.toggle('is-conflict', conflicts.has(i))
      value.textContent = v === 0 ? '' : String(v)
      const mask = notes[i] ?? 0
      noteGrid.hidden = v !== 0 || mask === 0
      Array.from(noteGrid.children).forEach((n, k) => {
        n.textContent = (mask >> (k + 1)) & 1 ? String(k + 1) : ''
        n.classList.toggle('is-same', selValue === k + 1)
      })
    })

    padButtons.forEach((b, k) => {
      const d = k + 1
      const done = (counts[d] ?? 0) >= SIZE && ![...conflicts].some((c) => values[c] === d)
      b.classList.toggle('is-done', done)
      b.title = done ? `${d} 已經填完` : `還差 ${SIZE - (counts[d] ?? 0)} 個 ${d}`
    })

    levelButtons.forEach((b, i) => {
      b.className = `ui-button ui-button--${LEVELS[i] === level ? 'primary' : 'secondary'}`
    })
    noteButton.textContent = noteMode ? '筆記模式：開' : '筆記模式：關'
    noteButton.className = `ui-button ui-button--${noteMode ? 'primary' : 'secondary'}`
    timeStat.value.textContent = formatTime(seconds)
    if (won) status.textContent = `完成！用了 ${formatTime(seconds)}`
    else if (conflicts.size > 0) status.textContent = '紅色的數字在同列、同欄或同九宮格重複了'
    else status.textContent = `${level.label}（提示 ${level.clues} 格）`
    againButton.hidden = !won
    pauseButton.hidden = won
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

  const restart = (): void => {
    const { puzzle } = generate(level, rng)
    givens = puzzle.map((v) => v !== 0)
    values = [...puzzle]
    notes = Array<number>(CELLS).fill(0)
    selected = -1
    won = false
    seconds = 0
    startTimer()
    render()
  }

  const setLevel = (next: Level): void => {
    if (paused) return
    level = next
    restart()
  }

  const select = (i: number): void => {
    if (paused) return
    selected = i
    render()
  }

  const toggleNoteMode = (): void => {
    if (paused) return
    noteMode = !noteMode
    render()
  }

  const checkWin = (): void => {
    if (values.some((v) => v === 0) || findConflicts(values).size > 0) return
    won = true
    stopTimer()
    ctx.audio.play('success')
  }

  /** 填入數字，或在筆記模式下切換小字 */
  const input = (d: number, asNote: boolean): void => {
    if (paused || won || selected < 0 || givens[selected]) return
    const current = values[selected] ?? 0
    if (asNote) {
      if (current !== 0) return
      notes[selected] = (notes[selected] ?? 0) ^ (1 << d)
      ctx.audio.play('click')
    } else if (current === d) {
      values[selected] = 0
      ctx.audio.play('click')
    } else {
      values[selected] = d
      notes[selected] = 0
      // 同列、同欄、同九宮格的小字裡不再需要這個數字
      for (const p of PEERS[selected] ?? []) notes[p] = (notes[p] ?? 0) & ~(1 << d)
      ctx.audio.play('score')
      checkWin()
    }
    render()
  }

  const erase = (): void => {
    if (paused || won || selected < 0 || givens[selected]) return
    values[selected] = 0
    notes[selected] = 0
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
          label: '換一題',
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
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (paused) closeDialog()
      else pause()
      return
    }
    if (paused) return
    const arrow = ARROWS[e.code]
    if (arrow) {
      e.preventDefault()
      const from = selected < 0 ? 0 : selected
      const x = Math.min(SIZE - 1, Math.max(0, (from % SIZE) + arrow[0]))
      const y = Math.min(SIZE - 1, Math.max(0, Math.floor(from / SIZE) + arrow[1]))
      selected = selected < 0 ? 0 : y * SIZE + x
      render()
      return
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1]
    if (digit) input(Number(digit), noteMode || e.shiftKey)
    else if (e.code === 'Backspace' || e.code === 'Delete') erase()
    else if (e.code === 'KeyN' && !e.repeat) toggleNoteMode()
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
