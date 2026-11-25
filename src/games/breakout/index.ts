import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  BALL_R,
  BRICK_H,
  BRICK_W,
  HEIGHT,
  PADDLE_H,
  PADDLE_Y,
  ROW_COLORS,
  START_LIVES,
  WIDTH,
  createState,
  launch,
  update as step,
} from './logic.ts'
import type { State } from './logic.ts'

/** 打磚塊：左右鍵（或 A / D、滑鼠）移動球拍，空白鍵或點擊發球，打光所有磚塊過關 */

type Phase = 'menu' | 'playing' | 'paused' | 'over'

let loop: Loop | null = null
let viewport: Viewport | null = null
let dialog: DialogHandle | null = null
let removeListeners: (() => void) | null = null

export function mount(_container: HTMLElement, ctx: GameContext): void {
  let redraw: (() => void) | null = null
  const vp = ctx.createViewport({ width: WIDTH, height: HEIGHT, onResize: () => redraw?.() })
  viewport = vp
  const rng = createRandom(Date.now())

  const style = getComputedStyle(vp.canvas.parentElement ?? document.body)
  const paper = style.getPropertyValue('--paper').trim() || '#fff7d6'
  const ink = style.getPropertyValue('--ink').trim() || '#1b1b1b'
  const accent = style.getPropertyValue('--accent').trim() || '#ff6b4a'

  let state: State = createState()
  let phase: Phase = 'menu'
  let best = 0
  let mouseX: number | null = null
  let launchRequested = false

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState()
    mouseX = null
    launchRequested = false
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState()
    phase = 'menu'
    dialog = Dialog({
      title: '打磚塊',
      content: [
        '左右鍵、A / D 或滑鼠移動球拍，空白鍵或點擊發球，Esc 暫停。',
        '共 3 條命，打光所有磚塊就進入下一關，越往後球越快。',
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
    ctx.audio.play('fail')
    dialog = Dialog({
      title: '遊戲結束',
      content: [`到第 ${state.stage} 關，分數 ${state.score}，本次最高 ${best}`, '再玩一次嗎？'],
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
    if (e.code === 'Space' || e.code === 'ArrowUp') launchRequested = true
    // 改用鍵盤後，不再由滑鼠位置決定球拍
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) mouseX = null
  }
  const onMouseMove = (e: MouseEvent): void => {
    if (phase !== 'playing') return
    mouseX = vp.toLogical(e.clientX, e.clientY).x
  }
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && phase === 'playing') launchRequested = true
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', onMouseMove)
  vp.canvas.addEventListener('mousedown', onMouseDown)
  removeListeners = () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('mousemove', onMouseMove)
    vp.canvas.removeEventListener('mousedown', onMouseDown)
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    const left = ctx.input.isDown('ArrowLeft') || ctx.input.isDown('KeyA')
    const right = ctx.input.isDown('ArrowRight') || ctx.input.isDown('KeyD')
    const events = step(state, dt, { dir: (right ? 1 : 0) - (left ? 1 : 0), mouseX })
    if (launchRequested) {
      if (launch(state, rng)) ctx.audio.play('click')
      launchRequested = false
    }
    for (const ev of events) {
      if (ev === 'paddle' || ev === 'wall') ctx.audio.play('click')
      else if (ev === 'brick') ctx.audio.play('click')
      else if (ev === 'break') ctx.audio.play('score')
      else if (ev === 'clear') ctx.audio.play('success')
      else if (ev === 'lose-life') ctx.audio.play('explosion')
    }
    if (state.gameOver) finish()
  }

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign,
  ): void => {
    const g = vp.ctx
    g.fillStyle = ink
    g.font = `${size}px "Lilita One", "Noto Sans TC", sans-serif`
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
    drawText(`分數 ${state.score}`, 24, 30, 28, 'left')
    drawText(`第 ${state.stage} 關`, WIDTH / 2, 30, 28, 'center')
    for (let i = 0; i < START_LIVES; i++) {
      const cx = WIDTH - 36 - i * 30
      g.beginPath()
      g.arc(cx, 30, 10, 0, Math.PI * 2)
      g.fillStyle = i < state.lives ? '#ff4d4d' : 'rgba(27,27,27,0.12)'
      g.fill()
      g.lineWidth = 3
      g.strokeStyle = ink
      g.stroke()
    }

    // 磚塊
    g.lineWidth = 3
    g.strokeStyle = ink
    for (const b of state.bricks) {
      if (b.hp <= 0) continue
      g.fillStyle = ink
      g.fillRect(b.x + 3, b.y + 3, BRICK_W, BRICK_H)
      g.fillStyle = ROW_COLORS[b.row % ROW_COLORS.length] ?? accent
      g.fillRect(b.x, b.y, BRICK_W, BRICK_H)
      g.strokeRect(b.x, b.y, BRICK_W, BRICK_H)
      if (b.maxHp > 1) {
        // 要打兩下的磚：中間畫斜線，打過一次後變成一條裂痕
        g.beginPath()
        if (b.hp === b.maxHp) {
          g.moveTo(b.x + 8, b.y + BRICK_H - 6)
          g.lineTo(b.x + BRICK_W - 8, b.y + 6)
        } else {
          g.moveTo(b.x + 14, b.y + 4)
          g.lineTo(b.x + 26, b.y + 12)
          g.lineTo(b.x + 20, b.y + 18)
          g.lineTo(b.x + 34, b.y + BRICK_H - 3)
        }
        g.stroke()
      }
    }

    // 球拍
    g.fillStyle = ink
    g.fillRect(state.paddleX + 4, PADDLE_Y + 4, state.paddleW, PADDLE_H)
    g.fillStyle = accent
    g.fillRect(state.paddleX, PADDLE_Y, state.paddleW, PADDLE_H)
    g.strokeRect(state.paddleX, PADDLE_Y, state.paddleW, PADDLE_H)

    // 球
    const b = state.ball
    g.fillStyle = ink
    g.beginPath()
    g.arc(b.x + 3, b.y + 3, BALL_R, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffc933'
    g.beginPath()
    g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
    g.fill()
    g.stroke()

    if (phase === 'playing' && state.stuck && state.clearTimer <= 0) {
      drawText('按空白鍵或點擊發球', WIDTH / 2, HEIGHT / 2 + 80, 26, 'center')
    }
    if (state.clearTimer > 0)
      drawText(`第 ${state.stage} 關完成！`, WIDTH / 2, HEIGHT / 2 + 60, 40, 'center')

    g.lineWidth = 6
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
  removeListeners?.()
  removeListeners = null
  viewport?.destroy()
  viewport = null
}
