import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  BLOCK,
  BUNKER_COLS,
  BUNKER_COUNT,
  BUNKER_ROWS,
  BUNKER_Y,
  HEIGHT,
  INV_COLS,
  INV_ROWS,
  INV_W,
  PLAYER_H,
  PLAYER_Y,
  START_LIVES,
  UFO_W,
  UFO_Y,
  WIDTH,
  bunkerX,
  createState,
  invaderPos,
  update as step,
} from './logic.ts'
import type { InvadersEvent, State } from './logic.ts'
import { CRAB, OCTOPUS, SHIP, SQUID, UFO } from './sprites.ts'
import type { Sprite } from './sprites.ts'

/** 太空侵略者：左右鍵（或 A / D）移動，空白鍵射擊，擋住外星人直到打光 */

type Phase = 'menu' | 'playing' | 'paused' | 'over'

const PX = 3
const ROW_SPRITES = [SQUID, CRAB, CRAB, OCTOPUS, OCTOPUS]
const ROW_COLORS = ['#b36bff', '#4aa3ff', '#4aa3ff', '#2fb67c', '#2fb67c']

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

  let state: State = createState(rng)
  let phase: Phase = 'menu'
  let best = 0
  let elapsed = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: '太空侵略者',
      content: [
        '← → 或 A / D 移動，空白鍵射擊，Esc 暫停。',
        '躲在碉堡後面，別讓外星人降到你的高度。打下飛碟有高分。',
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
      content: [`撐到第 ${state.wave} 波，分數 ${state.score}，本次最高 ${best}`, '再玩一次嗎？'],
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

  const play = (events: InvadersEvent[]): void => {
    for (const ev of events) {
      if (ev === 'shoot') ctx.audio.play('click')
      else if (ev === 'kill') ctx.audio.play('score')
      else if (ev === 'ufo-hit' || ev === 'wave-clear') ctx.audio.play('success')
      else if (ev === 'player-hit' || ev === 'gameover') ctx.audio.play('explosion')
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    elapsed += dt
    const left = ctx.input.isDown('ArrowLeft') || ctx.input.isDown('KeyA')
    const right = ctx.input.isDown('ArrowRight') || ctx.input.isDown('KeyD')
    const fire = ctx.input.isDown('Space') || ctx.input.isDown('ArrowUp')
    play(step(state, dt, { dir: (right ? 1 : 0) - (left ? 1 : 0), fire }, rng))
    if (state.gameOver) finish()
  }

  const drawSprite = (sprite: Sprite, x: number, y: number, color: string): void => {
    const g = vp.ctx
    const w = (sprite[0]?.length ?? 0) * PX
    const left = x - w / 2
    for (const [dx, dy, fill] of [
      [2, 2, ink],
      [0, 0, color],
    ] as const) {
      g.fillStyle = fill
      sprite.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] === '#') g.fillRect(left + c * PX + dx, y + r * PX + dy, PX, PX)
        }
      })
    }
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
    drawText(`分數 ${state.score}`, 24, 28, 26, 'left')
    drawText(`第 ${state.wave} 波`, WIDTH / 2, 28, 26, 'center')
    for (let i = 0; i < START_LIVES; i++) {
      if (i < state.lives) drawSprite(SHIP, WIDTH - 40 - i * 44, 17, accent)
    }

    // 地面線
    g.fillStyle = ink
    g.fillRect(0, PLAYER_Y + PLAYER_H + 14, WIDTH, 4)

    // 飛碟
    if (state.ufo) drawSprite(UFO, state.ufo.x + UFO_W / 2, UFO_Y, '#ff4d4d')

    // 外星人
    for (let r = 0; r < INV_ROWS; r++) {
      const frames = ROW_SPRITES[r] as readonly [Sprite, Sprite]
      for (let c = 0; c < INV_COLS; c++) {
        if (!(state.alive[r] as boolean[])[c]) continue
        const p = invaderPos(state, r, c)
        drawSprite(frames[state.frame], p.x + INV_W / 2, p.y, ROW_COLORS[r] ?? accent)
      }
    }

    // 碉堡
    for (let i = 0; i < BUNKER_COUNT; i++) {
      const cells = state.bunkers[i] as boolean[]
      for (let y = 0; y < BUNKER_ROWS; y++) {
        for (let x = 0; x < BUNKER_COLS; x++) {
          if (!cells[y * BUNKER_COLS + x]) continue
          g.fillStyle = ink
          g.fillRect(bunkerX(i) + x * BLOCK + 1, BUNKER_Y + y * BLOCK + 1, BLOCK, BLOCK)
        }
      }
      for (let y = 0; y < BUNKER_ROWS; y++) {
        for (let x = 0; x < BUNKER_COLS; x++) {
          if (!cells[y * BUNKER_COLS + x]) continue
          g.fillStyle = '#2fb67c'
          g.fillRect(bunkerX(i) + x * BLOCK, BUNKER_Y + y * BLOCK, BLOCK, BLOCK)
        }
      }
    }

    // 玩家（重生期間不畫；無敵期間閃爍）
    if (state.respawn <= 0 && (state.invuln <= 0 || Math.floor(elapsed * 10) % 2 === 0)) {
      drawSprite(SHIP, state.playerX, PLAYER_Y, accent)
    }

    // 子彈
    g.fillStyle = ink
    for (const b of state.bullets) g.fillRect(b.x - 2, b.y - 8, 4, 14)
    for (const b of state.enemyBullets) {
      g.fillStyle = '#ff4d4d'
      g.fillRect(b.x - 2, b.y, 5, 14)
      g.strokeStyle = ink
      g.lineWidth = 2
      g.strokeRect(b.x - 2, b.y, 5, 14)
    }

    if (state.waveTimer > 0)
      drawText(`第 ${state.wave} 波完成！`, WIDTH / 2, HEIGHT / 2, 40, 'center')

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
