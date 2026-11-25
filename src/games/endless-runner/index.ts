import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  DUCK_H,
  GROUND_Y,
  HEIGHT,
  RUNNER_H,
  RUNNER_W,
  RUNNER_X,
  WIDTH,
  createState,
  metersOf,
  update as step,
} from './logic.ts'
import type { Obstacle, RunnerEvent, State } from './logic.ts'

/** 無盡跑酷：空白鍵（或 ↑、點擊）跳，按住跳得高，↓ 蹲下；越跑越快 */

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
  let jumpPressed = false
  let jumpHeld = false
  let deadTimer = 0
  let elapsed = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const restart = (): void => {
    closeDialog()
    state = createState()
    jumpPressed = false
    jumpHeld = false
    deadTimer = 0
    phase = 'playing'
    loop?.resume()
  }

  const finish = (): void => {
    phase = 'over'
    const m = metersOf(state)
    best = Math.max(best, m)
    dialog = Dialog({
      title: '撞到了！',
      content: [`你跑了 ${m} 公尺，本次最遠 ${best} 公尺`, '再跑一次嗎？'],
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
    jumpHeld = false
    loop?.resume()
  }

  const isJumpKey = (code: string): boolean =>
    code === 'Space' || code === 'ArrowUp' || code === 'KeyW'

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (phase === 'paused') resume()
      else pause()
      return
    }
    if (isJumpKey(e.code) || e.code === 'ArrowDown') e.preventDefault()
    if (isJumpKey(e.code) && !e.repeat && phase === 'playing') {
      jumpPressed = true
      jumpHeld = true
    }
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    if (isJumpKey(e.code)) jumpHeld = false
  }
  const onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && phase === 'playing') {
      jumpPressed = true
      jumpHeld = true
    }
  }
  const onMouseUp = (): void => {
    jumpHeld = false
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  vp.canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  removeListeners = () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    vp.canvas.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
  }

  const play = (events: RunnerEvent[]): void => {
    for (const ev of events) {
      if (ev === 'jump') ctx.audio.play('jump')
      else if (ev === 'milestone') ctx.audio.play('success')
      else if (ev === 'hit') ctx.audio.play('explosion')
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    elapsed += dt
    const duck = ctx.input.isDown('ArrowDown') || ctx.input.isDown('KeyS')
    play(step(state, dt, { jumpPressed, jumpHeld, duck }, rng))
    jumpPressed = false
    if (state.dead) {
      deadTimer += dt
      if (deadTimer > 0.7) finish()
    }
  }

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

  const drawCloud = (x: number, y: number): void => {
    const g = vp.ctx
    g.fillStyle = white
    g.strokeStyle = ink
    g.lineWidth = 3
    g.beginPath()
    g.arc(x, y, 18, Math.PI * 0.5, Math.PI * 1.5)
    g.arc(x + 22, y - 12, 22, Math.PI, Math.PI * 2)
    g.arc(x + 46, y, 18, Math.PI * 1.5, Math.PI * 0.5)
    g.closePath()
    g.fill()
    g.stroke()
  }

  const drawObstacle = (o: Obstacle): void => {
    const g = vp.ctx
    const top = GROUND_Y - o.lift - o.h
    g.lineWidth = 3
    g.strokeStyle = ink
    switch (o.type) {
      case 'crate':
      case 'pair': {
        const n = o.type === 'pair' ? 2 : 1
        const w = o.w / n
        for (let i = 0; i < n; i++) {
          const x = o.x + i * w
          g.fillStyle = ink
          g.fillRect(x + 3, top + 3, w - 2, o.h)
          g.fillStyle = '#c98a4a'
          g.fillRect(x, top, w - 2, o.h)
          g.strokeRect(x, top, w - 2, o.h)
          g.beginPath()
          g.moveTo(x, top)
          g.lineTo(x + w - 2, top + o.h)
          g.moveTo(x + w - 2, top)
          g.lineTo(x, top + o.h)
          g.stroke()
        }
        break
      }
      case 'tall': {
        g.fillStyle = '#2fb67c'
        g.fillRect(o.x + 10, top, o.w - 20, o.h)
        g.strokeRect(o.x + 10, top, o.w - 20, o.h)
        g.fillRect(o.x, top + 22, 14, 10)
        g.strokeRect(o.x, top + 22, 14, 10)
        g.fillRect(o.x + o.w - 14, top + 38, 14, 10)
        g.strokeRect(o.x + o.w - 14, top + 38, 14, 10)
        break
      }
      case 'bird': {
        const flap = Math.floor(elapsed * 10) % 2 === 0 ? -10 : 8
        g.fillStyle = '#b36bff'
        g.beginPath()
        g.ellipse(o.x + 26, top + 16, 20, 12, 0, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.beginPath()
        g.moveTo(o.x + 18, top + 10)
        g.lineTo(o.x + 30, top + flap + 4)
        g.lineTo(o.x + 38, top + 10)
        g.closePath()
        g.fill()
        g.stroke()
        g.fillStyle = '#ff9a3c'
        g.beginPath()
        g.moveTo(o.x + 4, top + 14)
        g.lineTo(o.x - 8, top + 18)
        g.lineTo(o.x + 4, top + 22)
        g.closePath()
        g.fill()
        g.stroke()
        g.fillStyle = white
        g.beginPath()
        g.arc(o.x + 12, top + 12, 4, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = ink
        g.fillRect(o.x + 10, top + 11, 3, 3)
        break
      }
    }
  }

  const drawRunner = (): void => {
    const g = vp.ctx
    const h = state.ducking ? DUCK_H : RUNNER_H
    const bottom = GROUND_Y - state.y
    const top = bottom - h
    const x = RUNNER_X
    const w = RUNNER_W
    const grounded = state.y <= 0
    const stride = grounded && state.started && !state.dead ? Math.sin(state.run * 0.06) : 0.6

    g.lineWidth = 3
    g.strokeStyle = ink
    // 腿
    g.beginPath()
    g.moveTo(x + w * 0.35, bottom - 14)
    g.lineTo(x + w * 0.35 + stride * 12, bottom)
    g.moveTo(x + w * 0.65, bottom - 14)
    g.lineTo(x + w * 0.65 - stride * 12, bottom)
    g.stroke()
    // 身體
    g.fillStyle = ink
    g.fillRect(x + 3, top + 3, w, h - 14)
    g.fillStyle = accent
    g.fillRect(x, top, w, h - 14)
    g.strokeRect(x, top, w, h - 14)
    // 臉
    g.fillStyle = white
    g.beginPath()
    g.arc(x + w - 11, top + (h - 14) * 0.3, 6, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.fillStyle = ink
    g.beginPath()
    g.arc(x + w - 9, top + (h - 14) * 0.3, 2.4, 0, Math.PI * 2)
    g.fill()
    // 圍巾
    g.fillStyle = '#ffc933'
    const flutter = Math.sin(elapsed * 14) * 3
    g.beginPath()
    g.moveTo(x + 2, top + 12)
    g.lineTo(x - 18, top + 14 + flutter)
    g.lineTo(x - 14, top + 22 + flutter)
    g.lineTo(x + 2, top + 22)
    g.closePath()
    g.fill()
    g.stroke()
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 遠景雲與山（慢速視差）
    const span = WIDTH + 200
    for (let i = 0; i < 4; i++) {
      const cx = ((((i * 270 - state.distance * 0.1) % span) + span) % span) - 100
      drawCloud(cx, 90 + (i % 2) * 70)
    }
    g.fillStyle = '#d6efc7'
    g.strokeStyle = ink
    g.lineWidth = 3
    for (let i = 0; i < 4; i++) {
      const hx = ((((i * 300 - state.distance * 0.3) % span) + span) % span) - 150
      g.beginPath()
      g.moveTo(hx, GROUND_Y)
      g.quadraticCurveTo(hx + 90, GROUND_Y - 130, hx + 180, GROUND_Y)
      g.closePath()
      g.fill()
      g.stroke()
    }

    // 地面
    g.fillStyle = '#e0b46b'
    g.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y)
    g.fillStyle = '#c99a4f'
    const off = state.distance % 64
    for (let x = -off; x < WIDTH; x += 64) g.fillRect(x, GROUND_Y + 22, 30, 8)
    g.beginPath()
    g.moveTo(0, GROUND_Y)
    g.lineTo(WIDTH, GROUND_Y)
    g.lineWidth = 4
    g.strokeStyle = ink
    g.stroke()

    for (const o of state.obstacles) drawObstacle(o)
    drawRunner()

    drawText(`${metersOf(state)} m`, 28, 40, 34, 'left')
    if (best > 0) drawText(`本次最遠 ${best} m`, WIDTH - 28, 40, 24, 'right')
    if (!state.started && phase === 'playing') {
      drawText('按空白鍵或點擊開始跑', WIDTH / 2, HEIGHT / 2 - 40, 32, 'center')
      drawText('按住跳得高，↓ 蹲下躲鳥', WIDTH / 2, HEIGHT / 2, 22, 'center')
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
