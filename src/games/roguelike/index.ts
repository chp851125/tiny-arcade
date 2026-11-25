import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  COLS,
  FINAL_FLOOR,
  FLOOR,
  MONSTERS,
  ROWS,
  STAIRS,
  WALL,
  createState,
  move,
  usePotion,
  useScroll,
  wait,
  xpNeeded,
} from './logic.ts'
import type { Item, RogueEvent, State } from './logic.ts'

/** Roguelike 地城：方向鍵（或 WASD、QEZC 斜向）移動並攻擊，1 喝藥水、2 用炸彈卷軸，找樓梯一路往下到第 8 層 */

const WIDTH = 800
const HEIGHT = 600
const TILE = 22
const MAP_X = (WIDTH - COLS * TILE) / 2
const MAP_Y = 8

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyQ: [-1, -1],
  KeyE: [1, -1],
  KeyZ: [-1, 1],
  KeyC: [1, 1],
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
}

type Phase = 'menu' | 'playing' | 'paused' | 'over'

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
  let bestFloor = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'playing'
    render()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: 'Roguelike 地城',
      content: [
        `一路往下走到第 ${FINAL_FLOOR} 層，打倒巨龍。每次進入地城的地圖都不一樣，死了就要重來。`,
        '方向鍵或 WASD 移動，撞到敵人就是攻擊；QEZC 可斜向移動；空白鍵原地等待。',
        '1 喝治療藥水、2 丟炸彈卷軸（視野內所有敵人 −10）。走上樓梯（>）就下一層，Esc 暫停。',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '開始', onClick: () => start() }),
      ],
    })
    dialog.open()
    render()
  }

  const finish = (): void => {
    phase = 'over'
    bestFloor = Math.max(bestFloor, state.floor)
    const won = state.won
    dialog = Dialog({
      title: won ? '征服地城！' : '你倒下了',
      content: [
        won
          ? `你打倒了巨龍！等級 ${state.player.level}，擊敗 ${state.kills} 隻怪物，共 ${state.turn} 回合。`
          : `在第 ${state.floor} 層被${state.killedBy}打倒。等級 ${state.player.level}，擊敗 ${state.kills} 隻怪物，本次最深第 ${bestFloor} 層。`,
        '再挑戰一次嗎？（地圖會重新產生）',
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
  }

  const play = (events: RogueEvent[]): void => {
    for (const ev of events) {
      if (ev === 'hit') ctx.audio.play('click')
      else if (ev === 'kill') ctx.audio.play('score')
      else if (ev === 'hurt') ctx.audio.play('fail')
      else if (ev === 'pickup' || ev === 'heal') ctx.audio.play('click')
      else if (ev === 'stairs' || ev === 'levelup' || ev === 'bomb') ctx.audio.play('success')
      else if (ev === 'death') ctx.audio.play('explosion')
      else if (ev === 'win') ctx.audio.play('success')
    }
  }

  const afterAction = (events: RogueEvent[]): void => {
    play(events)
    render()
    if (state.dead || state.won) finish()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (phase === 'paused') resume()
      else pause()
      return
    }
    const dir = KEYS[e.code]
    if (
      dir ||
      e.code === 'Space' ||
      e.code === 'Digit1' ||
      e.code === 'Digit2' ||
      e.code === 'Period'
    ) {
      e.preventDefault()
    }
    if (phase !== 'playing') return
    if (dir) afterAction(move(state, dir[0], dir[1], rng))
    else if (e.code === 'Space' || e.code === 'Period' || e.code === 'Numpad5')
      afterAction(wait(state, rng))
    else if (e.code === 'Digit1' && !e.repeat) afterAction(usePotion(state, rng))
    else if (e.code === 'Digit2' && !e.repeat) afterAction(useScroll(state, rng))
  }
  window.addEventListener('keydown', onKeyDown)
  removeKeys = () => window.removeEventListener('keydown', onKeyDown)

  // --- 繪圖 ---
  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = 'left',
    color = ink,
  ): void => {
    const g = vp.ctx
    g.fillStyle = color
    g.font = `${size}px "Lilita One", "Noto Sans TC", sans-serif`
    g.textBaseline = 'middle'
    g.textAlign = align
    g.fillText(text, x, y)
  }

  const circle = (x: number, y: number, r: number, fill: string): void => {
    const g = vp.ctx
    g.fillStyle = fill
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 2.5
    g.strokeStyle = ink
    g.stroke()
  }

  const drawItem = (it: Item, cx: number, cy: number): void => {
    const g = vp.ctx
    g.lineWidth = 2.5
    g.strokeStyle = ink
    switch (it.type) {
      case 'potion':
        g.fillStyle = '#ff4d4d'
        g.beginPath()
        g.arc(cx, cy + 3, 6, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = white
        g.fillRect(cx - 2.5, cy - 8, 5, 6)
        g.strokeRect(cx - 2.5, cy - 8, 5, 6)
        break
      case 'scroll':
        g.fillStyle = '#fff3b0'
        g.fillRect(cx - 7, cy - 5, 14, 10)
        g.strokeRect(cx - 7, cy - 5, 14, 10)
        g.fillStyle = '#ff9a3c'
        g.fillRect(cx - 8, cy - 6, 3, 12)
        g.fillRect(cx + 5, cy - 6, 3, 12)
        break
      case 'sword':
        g.fillStyle = '#4aa3ff'
        g.beginPath()
        g.moveTo(cx + 8, cy - 8)
        g.lineTo(cx + 2, cy + 3)
        g.lineTo(cx - 3, cy - 2)
        g.closePath()
        g.fill()
        g.stroke()
        g.fillStyle = ink
        g.fillRect(cx - 7, cy + 1, 8, 3)
        break
      case 'shield':
        g.fillStyle = '#c98a4a'
        g.beginPath()
        g.moveTo(cx - 7, cy - 7)
        g.lineTo(cx + 7, cy - 7)
        g.lineTo(cx + 7, cy + 1)
        g.quadraticCurveTo(cx + 7, cy + 8, cx, cy + 9)
        g.quadraticCurveTo(cx - 7, cy + 8, cx - 7, cy + 1)
        g.closePath()
        g.fill()
        g.stroke()
        break
      case 'heart':
        g.fillStyle = '#ff7ab8'
        g.beginPath()
        g.moveTo(cx, cy + 8)
        g.lineTo(cx - 8, cy - 1)
        g.lineTo(cx, cy - 8)
        g.lineTo(cx + 8, cy - 1)
        g.closePath()
        g.fill()
        g.stroke()
        break
    }
  }

  function render(): void {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 地圖
    g.fillStyle = ink
    g.fillRect(MAP_X - 4, MAP_Y - 4, COLS * TILE + 8, ROWS * TILE + 8)
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x
        if (!state.explored[i]) continue
        const px = MAP_X + x * TILE
        const py = MAP_Y + y * TILE
        const vis = state.visible[i]
        const t = state.tiles[i]
        if (t === WALL) {
          g.fillStyle = vis ? accent : '#a8584a'
          g.fillRect(px, py, TILE, TILE)
          g.strokeStyle = ink
          g.lineWidth = 2
          g.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2)
        } else {
          g.fillStyle = vis ? white : '#c9c4ae'
          g.fillRect(px, py, TILE, TILE)
          if (t === STAIRS) {
            g.fillStyle = ink
            for (let k = 0; k < 4; k++)
              g.fillRect(px + 3 + k * 2, py + 4 + k * 4, TILE - 6 - k * 4, 3)
          } else if (t === FLOOR && (x + y) % 2 === 0) {
            g.fillStyle = 'rgba(27,27,27,0.05)'
            g.fillRect(px, py, TILE, TILE)
          }
        }
      }
    }

    // 物品與怪物（只畫看得到的）
    for (const it of state.items) {
      if (state.visible[it.y * COLS + it.x])
        drawItem(it, MAP_X + it.x * TILE + TILE / 2, MAP_Y + it.y * TILE + TILE / 2)
    }
    for (const m of state.monsters) {
      if (!state.visible[m.y * COLS + m.x]) continue
      const spec = MONSTERS[m.type]
      const cx = MAP_X + m.x * TILE + TILE / 2
      const cy = MAP_Y + m.y * TILE + TILE / 2
      circle(cx, cy, m.type === 'boss' ? 10.5 : 9, spec.color)
      drawText(spec.glyph, cx, cy + 1, 13, 'center', m.type === 'skeleton' ? ink : white)
      if (m.hp < spec.hp) {
        g.fillStyle = ink
        g.fillRect(cx - 10, cy - 15, 20, 5)
        g.fillStyle = '#ff4d4d'
        g.fillRect(cx - 9, cy - 14, (18 * m.hp) / spec.hp, 3)
      }
    }

    // 玩家
    const ppx = MAP_X + state.player.x * TILE + TILE / 2
    const ppy = MAP_Y + state.player.y * TILE + TILE / 2
    circle(ppx, ppy, 9, '#ffc933')
    g.fillStyle = ink
    g.fillRect(ppx - 5, ppy - 3, 3, 4)
    g.fillRect(ppx + 2, ppy - 3, 3, 4)
    g.beginPath()
    g.arc(ppx, ppy + 2, 4, 0.1 * Math.PI, 0.9 * Math.PI)
    g.lineWidth = 2
    g.stroke()

    // 下方狀態
    const hudY = MAP_Y + ROWS * TILE + 14
    const p = state.player
    drawText(`第 ${state.floor} / ${FINAL_FLOOR} 層`, 16, hudY + 8, 22)
    drawText(`Lv ${p.level}`, 190, hudY + 8, 22)
    drawText(`攻 ${p.atk}  防 ${p.def}`, 280, hudY + 8, 22)
    drawText(`經驗 ${p.xp}/${xpNeeded(p.level)}`, 440, hudY + 8, 20)
    // 生命條
    g.fillStyle = ink
    g.fillRect(14, hudY + 26, 252, 22)
    g.fillStyle = '#ffd6d6'
    g.fillRect(17, hudY + 29, 246, 16)
    g.fillStyle = p.hp / p.maxHp < 0.35 ? '#ff4d4d' : '#4ade80'
    g.fillRect(17, hudY + 29, (246 * Math.max(0, p.hp)) / p.maxHp, 16)
    drawText(`${p.hp} / ${p.maxHp}`, 140, hudY + 38, 16, 'center')
    // 道具欄
    drawItem({ type: 'potion', x: 0, y: 0 }, 300, hudY + 36)
    drawText(`1 ×${state.potions}`, 316, hudY + 38, 20)
    drawItem({ type: 'scroll', x: 0, y: 0 }, 410, hudY + 36)
    drawText(`2 ×${state.scrolls}`, 426, hudY + 38, 20)
    drawText(`擊敗 ${state.kills}  回合 ${state.turn}`, WIDTH - 16, hudY + 38, 18, 'right')

    // 訊息欄：最新的在最下面，越舊越淡
    const lines = state.messages.slice(-4)
    lines.forEach((line, i) => {
      g.globalAlpha = 0.45 + 0.55 * ((i + 1) / lines.length)
      drawText(line, 16, hudY + 66 + i * 18, 16)
    })
    g.globalAlpha = 1

    g.lineWidth = 6
    g.strokeStyle = ink
    g.strokeRect(0, 0, WIDTH, HEIGHT)
  }

  redraw = render
  showMenu()
}

export function destroy(): void {
  dialog?.close()
  dialog = null
  removeKeys?.()
  removeKeys = null
  viewport?.destroy()
  viewport = null
}
