import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'

/** 範例遊戲：只用來驗證框架（mount / destroy、音效、輸入、縮放） */

const WIDTH = 800
const HEIGHT = 600
const DURATION = 30
const LIFE = 1.3
const SIZE = 80

let loop: Loop | null = null
let viewport: Viewport | null = null
let dialog: DialogHandle | null = null
let removeClick: (() => void) | null = null

export function mount(container: HTMLElement, ctx: GameContext): void {
  // 縮放會清空畫布，暫停時要靠 onResize 重畫
  let redraw: (() => void) | null = null
  const vp = ctx.createViewport({ width: WIDTH, height: HEIGHT, onResize: () => redraw?.() })
  viewport = vp
  const rng = createRandom(Date.now())

  // 顏色吃設計系統的 CSS 變數
  const style = getComputedStyle(container)
  const paper = style.getPropertyValue('--paper').trim()
  const ink = style.getPropertyValue('--ink').trim()
  const accent = style.getPropertyValue('--accent').trim()

  let score = 0
  let timeLeft = DURATION
  let over = false
  const target = { x: 0, y: 0, age: 0 }

  const spawn = (): void => {
    target.x = rng.int(SIZE, WIDTH - SIZE)
    target.y = rng.int(SIZE + 60, HEIGHT - SIZE)
    target.age = 0
  }
  const currentSize = (): number => SIZE * (1 - 0.4 * (target.age / LIFE))

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const pause = (): void => {
    if (dialog || over) return
    loop?.pause()
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '繼續',
          onClick: () => {
            closeDialog()
            loop?.resume()
          },
        }),
      ],
    })
    dialog.open()
  }

  const restart = (): void => {
    closeDialog()
    score = 0
    timeLeft = DURATION
    over = false
    spawn()
    loop?.resume()
  }

  const finish = (): void => {
    over = true
    ctx.audio.play(score > 0 ? 'success' : 'fail')
    dialog = Dialog({
      title: '時間到',
      content: [`你的分數：${score}`],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '再玩一次', onClick: restart }),
      ],
    })
    dialog.open()
  }

  const onMouseDown = (e: MouseEvent): void => {
    if (over || dialog) return
    const p = vp.toLogical(e.clientX, e.clientY)
    const half = currentSize() / 2
    if (Math.abs(p.x - target.x) <= half && Math.abs(p.y - target.y) <= half) {
      score += 1
      ctx.audio.play('score')
      spawn()
    } else {
      ctx.audio.play('click')
    }
  }
  vp.canvas.addEventListener('mousedown', onMouseDown)
  removeClick = () => vp.canvas.removeEventListener('mousedown', onMouseDown)

  const update = (dt: number): void => {
    if (ctx.input.wasPressed('Escape')) pause()
    ctx.input.endFrame()
    if (over || dialog) return
    timeLeft -= dt
    target.age += dt
    if (target.age > LIFE) spawn()
    if (timeLeft <= 0) {
      timeLeft = 0
      finish()
    }
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)
    g.strokeStyle = ink
    g.lineWidth = 6
    g.strokeRect(0, 0, WIDTH, HEIGHT)

    g.fillStyle = ink
    g.font = '32px "Lilita One", "Noto Sans TC", sans-serif'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.fillText(`分數 ${score}`, 28, 40)
    g.textAlign = 'right'
    g.fillText(`時間 ${Math.ceil(timeLeft)}`, WIDTH - 28, 40)

    if (!over) {
      const size = currentSize()
      const x = target.x - size / 2
      const y = target.y - size / 2
      g.fillStyle = ink
      g.fillRect(x + 6, y + 6, size, size)
      g.fillStyle = accent
      g.fillRect(x, y, size, size)
      g.lineWidth = 4
      g.strokeStyle = ink
      g.strokeRect(x, y, size, size)
    }
  }

  redraw = render
  spawn()
  loop = createLoop({ update, render })
  loop.start()
}

export function destroy(): void {
  loop?.stop()
  loop = null
  dialog?.close()
  dialog = null
  removeClick?.()
  removeClick = null
  viewport?.destroy()
  viewport = null
}
