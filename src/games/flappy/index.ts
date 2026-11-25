import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  BIRD_R,
  BIRD_X,
  GROUND_Y,
  HEIGHT,
  PIPE_W,
  WIDTH,
  createState,
  update as step,
} from './logic.ts'
import type { FlappyEvent, State } from './logic.ts'

/** Flappy：空白鍵（或 ↑、滑鼠點擊）拍翅膀，穿過水管之間的縫隙 */

type Phase = 'playing' | 'paused' | 'over'

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
  const white = style.getPropertyValue('--white').trim() || '#ffffff'

  let state: State = createState()
  let phase: Phase = 'playing'
  let best = 0
  let flapRequested = false
  let deadTimer = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const restart = (): void => {
    closeDialog()
    state = createState()
    flapRequested = false
    deadTimer = 0
    phase = 'playing'
    loop?.resume()
  }

  const finish = (): void => {
    phase = 'over'
    best = Math.max(best, state.score)
    dialog = Dialog({
      title: '撞到了！',
      content: [`你穿過了 ${state.score} 根水管，本次最高 ${best}`, '再試一次嗎？'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '再玩一次', onClick: () => restart() }),
      ],
    })
    dialog.open()
  }

  const pause = (): void => {
    if (phase !== 'playing' || state.dead) return
    phase = 'paused'
    loop?.pause()
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '重新開始', variant: 'secondary', onClick: () => restart() }),
        Button({ label: '繼續', onClick: () => resume() }),
      ],
    })
    dialog.open()
  }

  const resume = (): void => {
    if (phase !== 'paused') return
    closeDialog()
    phase = 'playing'
    flapRequested = false
    loop?.resume()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (phase === 'paused') resume()
      else pause()
      return
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault()
      if (!e.repeat && phase === 'playing') flapRequested = true
    }
  }
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && phase === 'playing') flapRequested = true
  }
  window.addEventListener('keydown', onKeyDown)
  vp.canvas.addEventListener('mousedown', onMouseDown)
  removeListeners = () => {
    window.removeEventListener('keydown', onKeyDown)
    vp.canvas.removeEventListener('mousedown', onMouseDown)
  }

  const play = (events: FlappyEvent[]): void => {
    for (const ev of events) {
      if (ev === 'flap') ctx.audio.play('jump')
      else if (ev === 'score') ctx.audio.play('score')
      else if (ev === 'hit') ctx.audio.play('explosion')
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    const flap = flapRequested && !state.dead
    flapRequested = false
    play(step(state, dt, flap, rng))
    if (state.dead) {
      deadTimer += dt
      // 讓小鳥先掉到地上，再跳出結果
      if (deadTimer > 0.8) finish()
    }
  }

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = 'center',
    color = ink,
  ): void => {
    const g = vp.ctx
    g.font = `${size}px "Lilita One", "Noto Sans TC", sans-serif`
    g.textBaseline = 'middle'
    g.textAlign = align
    g.lineJoin = 'round'
    g.lineWidth = 6
    g.strokeStyle = ink
    g.strokeText(text, x, y)
    g.fillStyle = color
    g.fillText(text, x, y)
  }

  const drawCloud = (x: number, y: number, s: number): void => {
    const g = vp.ctx
    g.fillStyle = white
    g.strokeStyle = ink
    g.lineWidth = 3
    g.beginPath()
    g.arc(x, y, 22 * s, Math.PI * 0.5, Math.PI * 1.5)
    g.arc(x + 26 * s, y - 14 * s, 26 * s, Math.PI, Math.PI * 2)
    g.arc(x + 56 * s, y, 22 * s, Math.PI * 1.5, Math.PI * 0.5)
    g.closePath()
    g.fill()
    g.stroke()
  }

  const drawPipe = (x: number, y: number, h: number, capAtBottom: boolean): void => {
    const g = vp.ctx
    g.fillStyle = '#2fb67c'
    g.strokeStyle = ink
    g.lineWidth = 4
    g.fillRect(x, y, PIPE_W, h)
    g.strokeRect(x, y, PIPE_W, h)
    const capH = 30
    const capY = capAtBottom ? y + h - capH : y
    g.fillRect(x - 6, capY, PIPE_W + 12, capH)
    g.strokeRect(x - 6, capY, PIPE_W + 12, capH)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(x + 10, y, 8, h)
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 雲（慢速視差）
    const span = WIDTH + 200
    for (let i = 0; i < 4; i++) {
      const cx = ((((i * 260 - state.scroll * 0.2) % span) + span) % span) - 100
      drawCloud(cx, 90 + (i % 2) * 60 + i * 12, 1)
    }

    for (const p of state.pipes) {
      const top = p.gapY - p.gap / 2
      const bottom = p.gapY + p.gap / 2
      drawPipe(p.x, -4, top + 4, true)
      drawPipe(p.x, bottom, GROUND_Y - bottom + 4, false)
    }

    // 地面
    g.fillStyle = '#e0b46b'
    g.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y)
    g.fillStyle = '#c99a4f'
    const off = state.scroll % 48
    for (let x = -off; x < WIDTH; x += 48) g.fillRect(x, GROUND_Y + 14, 24, 10)
    g.strokeStyle = ink
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(0, GROUND_Y)
    g.lineTo(WIDTH, GROUND_Y)
    g.stroke()

    // 小鳥
    g.save()
    g.translate(BIRD_X, state.birdY)
    g.rotate(Math.max(-0.5, Math.min(1.1, state.birdVy / 600)))
    g.fillStyle = ink
    g.beginPath()
    g.arc(3, 3, BIRD_R, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffc933'
    g.strokeStyle = ink
    g.lineWidth = 3
    g.beginPath()
    g.arc(0, 0, BIRD_R, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    // 翅膀
    const wing = state.started && state.flapTimer < 0.15 ? -6 : 3
    g.fillStyle = accent
    g.beginPath()
    g.ellipse(-4, wing, 8, 5, 0, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    // 眼睛與嘴
    g.fillStyle = white
    g.beginPath()
    g.arc(6, -5, 5, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.fillStyle = ink
    g.beginPath()
    g.arc(8, -5, 2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ff9a3c'
    g.beginPath()
    g.moveTo(11, 0)
    g.lineTo(21, 3)
    g.lineTo(11, 7)
    g.closePath()
    g.fill()
    g.stroke()
    g.restore()

    drawText(String(state.score), WIDTH / 2, 70, 64, 'center', white)
    if (!state.started && phase === 'playing') {
      drawText('按空白鍵或點擊開始', WIDTH / 2, HEIGHT / 2 + 70, 32, 'center', white)
    }

    g.lineWidth = 6
    g.strokeStyle = ink
    g.strokeRect(0, 0, WIDTH, HEIGHT)
  }

  redraw = render
  loop = createLoop({ update, render })
  loop.start()
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
