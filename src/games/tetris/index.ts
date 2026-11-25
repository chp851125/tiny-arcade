import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  COLORS,
  COLS,
  PIECE_TYPES,
  ROWS,
  cellsOf,
  createState,
  ghostOf,
  hardDrop,
  holdPiece,
  moveHorizontal,
  rotate,
  shapeOf,
  tick,
} from './logic.ts'
import type { PieceType, State, TetrisEvent } from './logic.ts'

/** 俄羅斯方塊：方向鍵移動／旋轉，空白鍵直落，C 暫存，Z 反向旋轉 */

const WIDTH = 800
const HEIGHT = 600
const CELL = 26
const BOARD_X = (WIDTH - COLS * CELL) / 2
const BOARD_Y = (HEIGHT - ROWS * CELL) / 2 + 6
/** 按住左右鍵：先等 DAS，之後每 ARR 秒移動一格 */
const DAS = 0.17
const ARR = 0.04

type Phase = 'menu' | 'playing' | 'paused' | 'over'

let loop: Loop | null = null
let viewport: Viewport | null = null
let dialog: DialogHandle | null = null
let removeKeys: (() => void) | null = null

export function mount(_container: HTMLElement, ctx: GameContext): void {
  let redraw: (() => void) | null = null
  const vp = ctx.createViewport({ width: WIDTH, height: HEIGHT, onResize: () => redraw?.() })
  viewport = vp
  const rng = createRandom(Date.now())

  const style = getComputedStyle(vp.canvas.parentElement ?? document.body)
  const paper = style.getPropertyValue('--paper').trim() || '#fff7d6'
  const ink = style.getPropertyValue('--ink').trim() || '#1b1b1b'
  const white = style.getPropertyValue('--white').trim() || '#ffffff'

  let state: State = createState(rng)
  let phase: Phase = 'menu'
  let best = 0
  let heldDir = 0
  let dasTimer = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState(rng)
    heldDir = 0
    dasTimer = 0
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: '俄羅斯方塊',
      content: [
        '← → 移動，↑ 或 X 順時針旋轉，Z 逆時針旋轉，↓ 加速下落。',
        '空白鍵直接落到底，C 或 Shift 暫存方塊，Esc 暫停。',
        '每消 10 行升一級，方塊會越掉越快。',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '開始', onClick: () => start() }),
      ],
    })
    dialog.open()
    redraw?.()
  }

  const finish = (): void => {
    phase = 'over'
    best = Math.max(best, state.score)
    dialog = Dialog({
      title: '遊戲結束',
      content: [
        `分數 ${state.score}，消了 ${state.lines} 行，等級 ${state.level}，本次最高 ${best}`,
        '再玩一次嗎？',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '再玩一次', onClick: () => start() }),
      ],
    })
    dialog.open()
  }

  const pause = (): void => {
    if (phase !== 'playing') return
    phase = 'paused'
    loop?.pause()
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '重新開始', variant: 'secondary', onClick: () => showMenu() }),
        Button({ label: '繼續', onClick: () => resume() }),
      ],
    })
    dialog.open()
  }

  const resume = (): void => {
    if (phase !== 'paused') return
    closeDialog()
    phase = 'playing'
    loop?.resume()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (phase === 'paused') resume()
      else pause()
      return
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
      e.preventDefault()
    }
  }
  window.addEventListener('keydown', onKeyDown)
  removeKeys = () => window.removeEventListener('keydown', onKeyDown)

  const play = (events: TetrisEvent[]): void => {
    for (const ev of events) {
      if (ev === 'lock' || ev === 'hold') ctx.audio.play('click')
      else if (ev === 'clear') ctx.audio.play('score')
      else if (ev === 'tetris' || ev === 'levelup') ctx.audio.play('success')
      else if (ev === 'gameover') ctx.audio.play('explosion')
    }
  }

  const update = (dt: number): void => {
    const input = ctx.input
    if (phase === 'playing') {
      // 左右移動（含按住連續移動）
      if (input.wasPressed('ArrowLeft')) {
        heldDir = -1
        dasTimer = DAS
        moveHorizontal(state, -1)
      }
      if (input.wasPressed('ArrowRight')) {
        heldDir = 1
        dasTimer = DAS
        moveHorizontal(state, 1)
      }
      const leftDown = input.isDown('ArrowLeft')
      const rightDown = input.isDown('ArrowRight')
      if (heldDir === -1 && !leftDown) heldDir = rightDown ? 1 : 0
      if (heldDir === 1 && !rightDown) heldDir = leftDown ? -1 : 0
      if (heldDir !== 0) {
        dasTimer -= dt
        while (dasTimer <= 0) {
          dasTimer += ARR
          if (!moveHorizontal(state, heldDir)) {
            dasTimer = ARR
            break
          }
        }
      }

      if (input.wasPressed('ArrowUp') || input.wasPressed('KeyX')) {
        if (rotate(state, 1)) ctx.audio.play('click')
      }
      if (input.wasPressed('KeyZ') && rotate(state, -1)) ctx.audio.play('click')
      if (
        input.wasPressed('KeyC') ||
        input.wasPressed('ShiftLeft') ||
        input.wasPressed('ShiftRight')
      ) {
        play(holdPiece(state, rng))
      }
      if (input.wasPressed('Space')) play(hardDrop(state, rng))
      play(tick(state, dt, input.isDown('ArrowDown'), rng))
      if (state.gameOver) finish()
    }
    input.endFrame()
  }

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = 'left',
  ): void => {
    const g = vp.ctx
    g.fillStyle = ink
    g.font = `${size}px "Lilita One", "Noto Sans TC", sans-serif`
    g.textBaseline = 'middle'
    g.textAlign = align
    g.fillText(text, x, y)
  }

  const drawCell = (px: number, py: number, size: number, color: string): void => {
    const g = vp.ctx
    g.fillStyle = color
    g.fillRect(px, py, size, size)
    g.lineWidth = 2
    g.strokeStyle = ink
    g.strokeRect(px + 1, py + 1, size - 2, size - 2)
  }

  /** 在一個小框裡畫出某種方塊（暫存與預告用） */
  const drawMini = (type: PieceType, cx: number, cy: number, size: number, dim = false): void => {
    const m = shapeOf(type, 0)
    const rows = m.filter((r) => r.some((v) => v)).length
    const first = m.findIndex((r) => r.some((v) => v))
    const cols = Math.max(...m.map((r) => r.lastIndexOf(1) + 1))
    const left = Math.min(...m.map((r) => (r.indexOf(1) < 0 ? 99 : r.indexOf(1))))
    const w = (cols - left) * size
    const h = rows * size
    vp.ctx.globalAlpha = dim ? 0.35 : 1
    m.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v)
          drawCell(
            cx - w / 2 + (c - left) * size,
            cy - h / 2 + (r - first) * size,
            size,
            COLORS[type],
          )
      }),
    )
    vp.ctx.globalAlpha = 1
  }

  const drawPanel = (x: number, y: number, w: number, h: number, title: string): void => {
    const g = vp.ctx
    g.fillStyle = ink
    g.fillRect(x + 4, y + 4, w, h)
    g.fillStyle = white
    g.fillRect(x, y, w, h)
    g.lineWidth = 3
    g.strokeStyle = ink
    g.strokeRect(x, y, w, h)
    drawText(title, x + w / 2, y + 20, 20, 'center')
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 棋盤
    const bw = COLS * CELL
    const bh = ROWS * CELL
    g.fillStyle = ink
    g.fillRect(BOARD_X + 5, BOARD_Y + 5, bw, bh)
    g.fillStyle = white
    g.fillRect(BOARD_X, BOARD_Y, bw, bh)
    g.fillStyle = 'rgba(27, 27, 27, 0.07)'
    for (let x = 1; x < COLS; x++) g.fillRect(BOARD_X + x * CELL - 1, BOARD_Y, 2, bh)
    for (let y = 1; y < ROWS; y++) g.fillRect(BOARD_X, BOARD_Y + y * CELL - 1, bw, 2)

    const flashing = new Set(state.clearing?.rows ?? [])
    state.board.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v === 0) return
        const color = flashing.has(y)
          ? '#ffffff'
          : (COLORS[PIECE_TYPES[v - 1] as PieceType] ?? '#999')
        drawCell(BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, color)
      }),
    )

    if (!state.gameOver && !state.clearing) {
      // 鬼影
      g.globalAlpha = 0.3
      for (const { x, y } of cellsOf(ghostOf(state))) {
        if (y >= 0) drawCell(BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, COLORS[state.piece.type])
      }
      g.globalAlpha = 1
      for (const { x, y } of cellsOf(state.piece)) {
        if (y >= 0) drawCell(BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, COLORS[state.piece.type])
      }
    }
    g.lineWidth = 4
    g.strokeStyle = ink
    g.strokeRect(BOARD_X, BOARD_Y, bw, bh)

    // 暫存
    drawPanel(70, BOARD_Y, 150, 110, '暫存')
    if (state.hold) drawMini(state.hold, 145, BOARD_Y + 68, 20, state.holdUsed)

    // 下一個
    drawPanel(580, BOARD_Y, 150, 250, '下一個')
    state.queue.slice(0, 3).forEach((t, i) => drawMini(t, 655, BOARD_Y + 68 + i * 66, 20))

    // 分數等資訊
    drawPanel(580, BOARD_Y + 280, 150, 150, '')
    drawText('分數', 595, BOARD_Y + 302, 18)
    drawText(String(state.score), 715, BOARD_Y + 328, 28, 'right')
    drawText('行數', 595, BOARD_Y + 360, 18)
    drawText(String(state.lines), 715, BOARD_Y + 360, 22, 'right')
    drawText('等級', 595, BOARD_Y + 396, 18)
    drawText(String(state.level), 715, BOARD_Y + 396, 22, 'right')
  }

  redraw = render
  loop = createLoop({ update, render })
  loop.start()
  showMenu()
}

export function destroy(): void {
  loop?.stop()
  loop = null
  dialog?.close()
  dialog = null
  removeKeys?.()
  removeKeys = null
  viewport?.destroy()
  viewport = null
}
