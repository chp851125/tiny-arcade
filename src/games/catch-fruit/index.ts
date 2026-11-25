import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  BASKET_H,
  BASKET_Y,
  HEIGHT,
  ITEM_R,
  START_LIVES,
  WIDTH,
  comboMultiplier,
  createState,
  update as step,
} from './logic.ts'
import type { CatchEvent, Item, State } from './logic.ts'

/** 接水果：左右鍵（或 A / D、滑鼠）移動籃子，接住水果，別接炸彈，漏掉水果會扣命 */

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
  let held = 0
  let flash = 0
  let elapsed = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState()
    mouseX = null
    held = 0
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState()
    phase = 'menu'
    dialog = Dialog({
      title: '接水果',
      content: [
        '左右鍵、A / D 或滑鼠移動籃子，Esc 暫停。',
        '接住水果得分，連續接到有加成；漏掉水果或接到炸彈會扣一條命，共 5 條。',
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
        `分數 ${state.score}，接到 ${state.caught} 個水果，本次最高 ${best}`,
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
    if (['ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) mouseX = null
  }
  const onMouseMove = (e: MouseEvent): void => {
    if (phase === 'playing') mouseX = vp.toLogical(e.clientX, e.clientY).x
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', onMouseMove)
  removeListeners = () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('mousemove', onMouseMove)
  }

  const play = (events: CatchEvent[]): void => {
    for (const ev of events) {
      if (ev === 'catch') ctx.audio.play('score')
      else if (ev === 'gold') ctx.audio.play('success')
      else if (ev === 'miss') ctx.audio.play('click')
      else if (ev === 'bomb' || ev === 'gameover') ctx.audio.play('explosion')
      if (ev === 'miss' || ev === 'bomb') flash = 0.25
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    elapsed += dt
    flash = Math.max(0, flash - dt)
    const left = ctx.input.isDown('ArrowLeft') || ctx.input.isDown('KeyA')
    const right = ctx.input.isDown('ArrowRight') || ctx.input.isDown('KeyD')
    held = (right ? 1 : 0) - (left ? 1 : 0)
    play(step(state, dt, { dir: held, mouseX }, rng))
    if (state.gameOver) finish()
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

  const drawItem = (it: Item): void => {
    const g = vp.ctx
    const r = ITEM_R
    g.save()
    g.translate(it.x, it.y)
    g.lineWidth = 3
    g.strokeStyle = ink
    switch (it.type) {
      case 'apple':
        g.fillStyle = '#ff4d4d'
        g.beginPath()
        g.arc(0, 2, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = '#2fb67c'
        g.beginPath()
        g.ellipse(6, -r + 1, 7, 4, -0.5, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        break
      case 'orange':
        g.fillStyle = '#ff9a3c'
        g.beginPath()
        g.arc(0, 0, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = 'rgba(255,255,255,0.5)'
        g.beginPath()
        g.arc(-6, -6, 4, 0, Math.PI * 2)
        g.fill()
        break
      case 'lemon':
        g.fillStyle = '#ffd84d'
        g.beginPath()
        g.ellipse(0, 0, r + 3, r - 4, it.spin * 0.3, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        break
      case 'cherry':
        g.strokeStyle = '#2fb67c'
        g.beginPath()
        g.moveTo(-7, 5)
        g.quadraticCurveTo(-4, -10, 4, -r)
        g.moveTo(8, 6)
        g.quadraticCurveTo(7, -8, 4, -r)
        g.stroke()
        g.strokeStyle = ink
        g.fillStyle = '#d62f4b'
        for (const x of [-8, 8]) {
          g.beginPath()
          g.arc(x, 7, 9, 0, Math.PI * 2)
          g.fill()
          g.stroke()
        }
        break
      case 'gold': {
        g.rotate(Math.sin(it.spin * 2) * 0.3)
        g.fillStyle = '#ffc933'
        g.beginPath()
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 === 0 ? r + 4 : (r + 4) * 0.45
          const a = (Math.PI / 5) * i - Math.PI / 2
          g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
        }
        g.closePath()
        g.fill()
        g.stroke()
        break
      }
      case 'bomb':
        g.fillStyle = '#2b2b2b'
        g.beginPath()
        g.arc(0, 3, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = '#777'
        g.beginPath()
        g.arc(-6, -2, 4, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#b36bff'
        g.lineWidth = 4
        g.beginPath()
        g.moveTo(5, -r + 2)
        g.quadraticCurveTo(12, -r - 8, 17, -r - 4)
        g.stroke()
        g.fillStyle = Math.floor(elapsed * 10) % 2 === 0 ? '#ff4d4d' : '#ffc933'
        g.beginPath()
        g.arc(17, -r - 4, 4, 0, Math.PI * 2)
        g.fill()
        break
    }
    g.restore()
  }

  const drawBasket = (): void => {
    const g = vp.ctx
    const x = state.basketX - state.basketW / 2
    const top = BASKET_Y
    g.fillStyle = ink
    g.beginPath()
    g.moveTo(x + 4 + 4, top + 4)
    g.lineTo(x + state.basketW + 4 - 4, top + 4)
    g.lineTo(x + state.basketW - 12 + 4, top + BASKET_H + 4)
    g.lineTo(x + 12 + 4, top + BASKET_H + 4)
    g.closePath()
    g.fill()
    g.fillStyle = flash > 0 ? '#ff6b5e' : '#c98a4a'
    g.strokeStyle = ink
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(x + 4, top)
    g.lineTo(x + state.basketW - 4, top)
    g.lineTo(x + state.basketW - 16, top + BASKET_H)
    g.lineTo(x + 16, top + BASKET_H)
    g.closePath()
    g.fill()
    g.stroke()
    g.lineWidth = 2
    for (let i = 1; i < 5; i++) {
      const lx = x + (state.basketW / 5) * i
      g.beginPath()
      g.moveTo(lx, top + 4)
      g.lineTo(lx + (state.basketW / 2 - (lx - x)) * -0.1, top + BASKET_H - 3)
      g.stroke()
    }
    g.fillStyle = accent
    g.fillRect(x + 2, top - 4, state.basketW - 4, 8)
    g.strokeRect(x + 2, top - 4, state.basketW - 4, 8)
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)
    g.fillStyle = '#b9e4a6'
    g.fillRect(0, HEIGHT - 34, WIDTH, 34)
    g.fillStyle = ink
    g.fillRect(0, HEIGHT - 38, WIDTH, 4)

    for (const it of state.items) drawItem(it)
    drawBasket()

    // 上方資訊
    drawText(`分數 ${state.score}`, 24, 34, 28, 'left')
    const mult = comboMultiplier(state.combo)
    if (state.combo >= 5)
      drawText(`連擊 ${state.combo}  ×${mult}`, WIDTH / 2, 34, 28, 'center', '#d62f2f')
    for (let i = 0; i < START_LIVES; i++) {
      g.beginPath()
      g.arc(WIDTH - 30 - i * 30, 34, 10, 0, Math.PI * 2)
      g.fillStyle = i < state.lives ? '#ff4d4d' : 'rgba(27,27,27,0.12)'
      g.fill()
      g.lineWidth = 3
      g.strokeStyle = ink
      g.stroke()
    }

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
  removeListeners?.()
  removeListeners = null
  viewport?.destroy()
  viewport = null
}
