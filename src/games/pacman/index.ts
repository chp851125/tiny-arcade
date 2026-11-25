import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  COLS,
  DX,
  DY,
  GHOST_COLORS,
  MAZE,
  ROWS,
  createState,
  posOf,
  update as step,
} from './logic.ts'
import type { Dir, Ghost, PacEvent, State } from './logic.ts'

/** 小精靈：方向鍵（或 WASD）轉向，吃光豆子，躲開鬼；吃大力丸後可以反過來吃鬼 */

const WIDTH = 800
const HEIGHT = 600
const CELL = 24
const MAZE_X = (WIDTH - COLS * CELL) / 2
const MAZE_Y = 84
const START_LIVES = 3

const KEYS: Record<string, Dir> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowLeft: 1,
  KeyA: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowRight: 3,
  KeyD: 3,
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

  let state: State = createState()
  let phase: Phase = 'menu'
  let best = 0
  let want: Dir | -1 = -1
  let elapsed = 0
  /** 小精靈最後面向的方向（停下來時畫面還朝著那邊） */
  let facing: Dir = 1

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState()
    want = -1
    facing = 1
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState()
    phase = 'menu'
    dialog = Dialog({
      title: '小精靈',
      content: [
        '方向鍵或 WASD 控制方向，Esc 暫停。',
        '吃光所有豆子過關；吃大力丸後，可以趁鬼變藍時反過來吃掉牠們。',
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
      content: [`到第 ${state.level} 關，分數 ${state.score}，本次最高 ${best}`, '再玩一次嗎？'],
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
    const d = KEYS[e.code]
    if (d === undefined) return
    e.preventDefault()
    want = d
  }
  window.addEventListener('keydown', onKeyDown)
  removeKeys = () => window.removeEventListener('keydown', onKeyDown)

  const play = (events: PacEvent[]): void => {
    for (const ev of events) {
      if (ev === 'pellet') ctx.audio.play('score')
      else if (ev === 'ghost' || ev === 'clear') ctx.audio.play('success')
      else if (ev === 'death' || ev === 'gameover') ctx.audio.play('explosion')
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    elapsed += dt
    play(step(state, dt, want, rng))
    if (state.pac.dir !== -1) facing = state.pac.dir
    if (state.gameOver) finish()
  }

  const px = (x: number): number => MAZE_X + x * CELL + CELL / 2
  const py = (y: number): number => MAZE_Y + y * CELL + CELL / 2

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign,
    color = ink,
  ): void => {
    const g = vp.ctx
    g.fillStyle = color
    g.font = `${size}px "Lilita One", "Noto Sans TC", sans-serif`
    g.textBaseline = 'middle'
    g.textAlign = align
    g.fillText(text, x, y)
  }

  /** 小精靈：嘴巴開合；死亡時嘴越張越大直到消失 */
  const drawPac = (cx: number, cy: number, dir: Dir, mouth: number, radius: number): void => {
    const g = vp.ctx
    const angle = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][dir] as number
    g.fillStyle = '#ffc933'
    g.strokeStyle = ink
    g.lineWidth = 2.5
    g.beginPath()
    if (mouth >= 1) {
      return
    }
    g.moveTo(cx, cy)
    g.arc(cx, cy, radius, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI)
    g.closePath()
    g.fill()
    g.stroke()
  }

  const drawGhost = (gh: Ghost): void => {
    const g = vp.ctx
    const p = posOf(gh)
    const cx = px(p.x)
    const cy = py(p.y)
    const r = CELL * 0.46
    const flicker =
      state.frightened > 0 && state.frightened < 2 && Math.floor(elapsed * 6) % 2 === 0
    if (gh.mode !== 'eaten') {
      const body = gh.frightened ? (flicker ? white : '#4a6bff') : (GHOST_COLORS[gh.id] as string)
      g.fillStyle = body
      g.strokeStyle = ink
      g.lineWidth = 2.5
      g.beginPath()
      g.arc(cx, cy - 1, r, Math.PI, 0)
      g.lineTo(cx + r, cy + r)
      const wave = Math.floor(elapsed * 8) % 2 === 0 ? 1 : -1
      for (let i = 0; i < 3; i++) {
        const x0 = cx + r - (i * 2 * r) / 3
        g.lineTo(x0 - r / 3, cy + r - 4 * wave)
        g.lineTo(x0 - (2 * r) / 3, cy + r)
      }
      g.closePath()
      g.fill()
      g.stroke()
    }
    if (gh.frightened && gh.mode !== 'eaten') {
      g.fillStyle = flicker ? '#ff4d4d' : white
      g.fillRect(cx - 5, cy - 3, 3, 3)
      g.fillRect(cx + 2, cy - 3, 3, 3)
      g.fillRect(cx - 6, cy + 4, 12, 2)
      return
    }
    // 眼睛朝前進方向看
    const dir = gh.dir === -1 ? 1 : gh.dir
    for (const sx of [-4.5, 4.5]) {
      g.fillStyle = white
      g.beginPath()
      g.arc(cx + sx, cy - 3, 3.6, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = ink
      g.beginPath()
      g.arc(cx + sx + DX[dir] * 1.6, cy - 3 + DY[dir] * 1.6, 1.8, 0, Math.PI * 2)
      g.fill()
    }
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 上方資訊
    drawText(`分數 ${state.score}`, MAZE_X, 40, 28, 'left')
    drawText(`第 ${state.level} 關`, WIDTH / 2, 40, 28, 'center')
    for (let i = 0; i < START_LIVES - 1; i++) {
      if (i < state.lives - 1) drawPac(WIDTH - MAZE_X - 16 - i * 36, 40, 1, 0.2, 13)
    }

    // 迷宮
    const flash = state.clearing > 0 && Math.floor(elapsed * 8) % 2 === 0
    g.fillStyle = white
    g.fillRect(MAZE_X, MAZE_Y, COLS * CELL, ROWS * CELL)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = MAZE[y]?.[x]
        const cx = MAZE_X + x * CELL
        const cy = MAZE_Y + y * CELL
        if (c === '#') {
          g.fillStyle = flash ? white : accent
          g.fillRect(cx, cy, CELL, CELL)
          g.strokeStyle = ink
          g.lineWidth = 2
          g.strokeRect(cx + 1, cy + 1, CELL - 2, CELL - 2)
        } else if (c === '-') {
          g.fillStyle = '#ff7ab8'
          g.fillRect(cx, cy + CELL / 2 - 2, CELL, 4)
        } else {
          const f = state.food[y * COLS + x]
          if (f === 1) {
            g.fillStyle = ink
            g.beginPath()
            g.arc(cx + CELL / 2, cy + CELL / 2, 2.5, 0, Math.PI * 2)
            g.fill()
          } else if (f === 2 && Math.floor(elapsed * 4) % 2 === 0) {
            g.fillStyle = ink
            g.beginPath()
            g.arc(cx + CELL / 2, cy + CELL / 2, 7, 0, Math.PI * 2)
            g.fill()
          }
        }
      }
    }

    // 角色
    for (const gh of state.ghosts) if (state.dying <= 0 || gh.mode === 'house') drawGhost(gh)
    const pp = posOf(state.pac)
    if (state.dying > 0) {
      const t = 1 - state.dying / 1.6
      drawPac(px(pp.x), py(pp.y), 0, Math.min(1, 0.15 + t * 0.9), CELL * 0.46)
    } else {
      const open = state.pac.dir === -1 ? 0.12 : 0.05 + 0.2 * Math.abs(Math.sin(elapsed * 14))
      drawPac(px(pp.x), py(pp.y), state.pac.dir === -1 ? facing : state.pac.dir, open, CELL * 0.46)
    }

    if (state.ready > 0 && phase === 'playing')
      drawText('準備！', px(10), py(11), 26, 'center', '#d62f2f')
    if (state.clearing > 0) drawText('過關！', WIDTH / 2, MAZE_Y + (ROWS * CELL) / 2, 44, 'center')

    g.lineWidth = 6
    g.strokeStyle = ink
    g.strokeRect(0, 0, WIDTH, HEIGHT)
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
