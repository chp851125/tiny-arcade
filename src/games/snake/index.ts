import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import { COLS, DELTAS, OPPOSITE, ROWS, advance, createState } from './logic.ts'
import type { Direction, State } from './logic.ts'

/** 貪食蛇：方向鍵（或 WASD）控制，吃食物變長，撞牆或撞到自己就結束 */

const WIDTH = 800
const HEIGHT = 600
const CELL = 30
const BOARD_X = (WIDTH - COLS * CELL) / 2
const BOARD_Y = 96
/** 起始速度（格／秒）；每吃一個食物加快一點，最快 20 格／秒 */
const START_SPEED = 7
const SPEED_GAIN = 0.3
const MAX_SPEED = 20
const FOOD_SCORE = 10

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
  const accent = style.getPropertyValue('--accent').trim() || '#ff6b4a'
  const white = style.getPropertyValue('--white').trim() || '#ffffff'

  let state: State = createState(rng)
  let phase: Phase = 'menu'
  let best = 0
  let acc = 0
  const queue: Direction[] = []

  const speed = (): number => Math.min(MAX_SPEED, START_SPEED + state.eaten * SPEED_GAIN)
  const interval = (): number => 1 / speed()

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState(rng)
    queue.length = 0
    acc = 0
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: '貪食蛇',
      content: ['方向鍵或 WASD 控制方向，Esc 暫停。', '吃得越多，速度越快。'],
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
    ctx.audio.play(state.won ? 'success' : 'explosion')
    dialog = Dialog({
      title: state.won ? '填滿整個畫面！' : '遊戲結束',
      content: [
        `分數 ${state.score}，長度 ${state.snake.length}，本次最高 ${best}`,
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
    const dir = KEYS[e.code]
    if (!dir) return
    e.preventDefault()
    if (phase !== 'playing') return
    // 最多預存 2 個方向，讓快速連按轉彎不會漏掉；不能直接掉頭
    const last = queue[queue.length - 1] ?? state.dir
    if (queue.length < 2 && dir !== last && dir !== OPPOSITE[last]) queue.push(dir)
  }
  window.addEventListener('keydown', onKeyDown)
  removeKeys = () => window.removeEventListener('keydown', onKeyDown)

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    acc += dt
    while (acc >= interval() && phase === 'playing') {
      acc -= interval()
      const dir = queue.shift() ?? state.dir
      const { ate } = advance(state, dir, rng)
      if (ate) {
        state.score += FOOD_SCORE
        ctx.audio.play('score')
      }
      if (!state.alive) {
        finish()
        break
      }
    }
  }

  const drawText = (text: string, x: number, y: number, align: CanvasTextAlign): void => {
    const g = vp.ctx
    g.fillStyle = ink
    g.font = '30px "Lilita One", "Noto Sans TC", sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = align
    g.fillText(text, x, y)
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 上方資訊
    drawText(`分數 ${state.score}`, BOARD_X, 48, 'left')
    drawText(`速度 ${Math.round(speed())}`, WIDTH / 2, 48, 'center')
    drawText(`最高 ${Math.max(best, state.score)}`, WIDTH - BOARD_X, 48, 'right')

    // 棋盤
    g.fillStyle = ink
    g.fillRect(BOARD_X - 4 + 6, BOARD_Y - 4 + 6, COLS * CELL + 8, ROWS * CELL + 8)
    g.fillStyle = white
    g.fillRect(BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8)
    g.fillStyle = 'rgba(27, 27, 27, 0.05)'
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) g.fillRect(BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, CELL)
      }
    }
    g.strokeStyle = ink
    g.lineWidth = 4
    g.strokeRect(BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8)

    // 食物
    if (state.food) {
      const cx = BOARD_X + state.food.x * CELL + CELL / 2
      const cy = BOARD_Y + state.food.y * CELL + CELL / 2
      g.fillStyle = '#ff4d4d'
      g.beginPath()
      g.arc(cx, cy + 1, CELL * 0.36, 0, Math.PI * 2)
      g.fill()
      g.lineWidth = 3
      g.stroke()
      g.fillStyle = '#2fb67c'
      g.fillRect(cx - 2, cy - CELL * 0.5 + 2, 4, 8)
    }

    // 蛇：由尾畫到頭，頭最後畫
    g.lineWidth = 3
    for (let i = state.snake.length - 1; i >= 0; i--) {
      const c = state.snake[i] as { x: number; y: number }
      const x = BOARD_X + c.x * CELL + 2
      const y = BOARD_Y + c.y * CELL + 2
      g.fillStyle = i === 0 ? (state.alive ? accent : '#ff4d4d') : accent
      g.fillRect(x, y, CELL - 4, CELL - 4)
      g.strokeRect(x, y, CELL - 4, CELL - 4)
      if (i === 0) {
        const { dx, dy } = DELTAS[state.dir]
        const cx = x + (CELL - 4) / 2
        const cy = y + (CELL - 4) / 2
        // 眼睛放在前進方向的兩側
        const px = -dy
        const py = dx
        g.fillStyle = ink
        for (const side of [-1, 1]) {
          g.beginPath()
          g.arc(cx + dx * 5 + px * side * 6, cy + dy * 5 + py * side * 6, 3, 0, Math.PI * 2)
          g.fill()
        }
      }
    }
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
