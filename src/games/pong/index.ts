import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  BALL_R,
  HEIGHT,
  LEVELS,
  PADDLE_H,
  PADDLE_MARGIN,
  PADDLE_W,
  WIDTH,
  WIN_SCORE,
  createState,
  update as step,
} from './logic.ts'
import type { Level, State } from './logic.ts'

/** 乒乓：W / S 或上下鍵移動球拍，對戰電腦，先得 7 分獲勝 */

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

  let level: Level = LEVELS[0] as Level
  let state: State = createState(rng)
  let phase: Phase = 'menu'

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (next: Level): void => {
    closeDialog()
    level = next
    state = createState(rng, rng.next() < 0.5 ? 'player' : 'cpu')
    phase = 'playing'
    loop?.resume()
  }

  const levelButtons = (): HTMLElement[] =>
    LEVELS.map((l) =>
      Button({
        label: l.label,
        variant: l === level ? 'primary' : 'secondary',
        onClick: () => start(l),
      }),
    )

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: '乒乓',
      content: [
        `W / S 或上下鍵移動球拍，先得 ${WIN_SCORE} 分獲勝，Esc 暫停。`,
        '選擇電腦的強度開始：',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        ...levelButtons(),
      ],
    })
    dialog.open()
    redraw?.()
  }

  const finish = (): void => {
    phase = 'over'
    const won = state.winner === 'player'
    ctx.audio.play(won ? 'success' : 'fail')
    dialog = Dialog({
      title: won ? '你贏了！' : '電腦贏了',
      content: [`比數 ${state.score.player} : ${state.score.cpu}`, '再打一次，或換個強度：'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        ...levelButtons(),
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
    if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) e.preventDefault()
  }
  window.addEventListener('keydown', onKeyDown)
  removeKeys = () => window.removeEventListener('keydown', onKeyDown)

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    const up = ctx.input.isDown('KeyW') || ctx.input.isDown('ArrowUp')
    const down = ctx.input.isDown('KeyS') || ctx.input.isDown('ArrowDown')
    const events = step(state, dt, (down ? 1 : 0) - (up ? 1 : 0), level, rng)
    for (const ev of events) {
      if (ev === 'hit') ctx.audio.play('click')
      else if (ev === 'player-score') ctx.audio.play('score')
      else if (ev === 'cpu-score') ctx.audio.play('explosion')
    }
    if (state.winner) finish()
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

  const drawPaddle = (x: number, y: number, fill: string): void => {
    const g = vp.ctx
    g.fillStyle = ink
    g.fillRect(x + 4, y + 4, PADDLE_W, PADDLE_H)
    g.fillStyle = fill
    g.fillRect(x, y, PADDLE_W, PADDLE_H)
    g.lineWidth = 3
    g.strokeStyle = ink
    g.strokeRect(x, y, PADDLE_W, PADDLE_H)
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 中線
    g.fillStyle = 'rgba(27, 27, 27, 0.25)'
    for (let y = 14; y < HEIGHT; y += 36) g.fillRect(WIDTH / 2 - 3, y, 6, 20)

    // 比數與強度
    drawText(String(state.score.player), WIDTH / 2 - 90, 64, 64, 'center')
    drawText(String(state.score.cpu), WIDTH / 2 + 90, 64, 64, 'center')
    drawText(`你 vs 電腦（${level.label}）`, WIDTH / 2, HEIGHT - 24, 22, 'center')

    drawPaddle(PADDLE_MARGIN, state.left, accent)
    drawPaddle(WIDTH - PADDLE_MARGIN - PADDLE_W, state.right, white)

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
    g.lineWidth = 3
    g.strokeStyle = ink
    g.stroke()

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
  removeKeys?.()
  removeKeys = null
  viewport?.destroy()
  viewport = null
}
