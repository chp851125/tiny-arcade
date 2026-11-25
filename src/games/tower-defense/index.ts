import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import {
  CELL,
  COLS,
  ENEMIES,
  FINAL_WAVE,
  GRID_Y,
  HEIGHT,
  MAPS,
  MAX_LEVEL,
  ROWS,
  START_LIVES,
  TOWERS,
  TOWER_TYPES,
  WIDTH,
  canPlace,
  createState,
  placeTower,
  posAt,
  sellTower,
  sellValue,
  startWave,
  statsOf,
  towerAt,
  towerCenter,
  update as step,
  upgradeCost,
  upgradeTower,
} from './logic.ts'
import type { GameMap, State, TdEvent, Tower, TowerType } from './logic.ts'

/** 塔防：用滑鼠蓋塔、升級、出售，擋住 20 波敵人，別讓牠們走到終點 */

type Phase = 'menu' | 'playing' | 'paused' | 'over'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const SHOP_Y = GRID_Y + ROWS * CELL + 6
const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

let loop: Loop | null = null
let viewport: Viewport | null = null
let dialog: DialogHandle | null = null
let removeListeners: (() => void) | null = null

export function mount(_container: HTMLElement, ctx: GameContext): void {
  let redraw: (() => void) | null = null
  const vp = ctx.createViewport({ width: WIDTH, height: HEIGHT, onResize: () => redraw?.() })
  viewport = vp

  const style = getComputedStyle(vp.canvas.parentElement ?? document.body)
  const paper = style.getPropertyValue('--paper').trim() || '#fff7d6'
  const ink = style.getPropertyValue('--ink').trim() || '#1b1b1b'
  const accent = style.getPropertyValue('--accent').trim() || '#ff6b4a'
  const white = style.getPropertyValue('--white').trim() || '#ffffff'

  let map: GameMap = MAPS[0] as GameMap
  let state: State = createState(map)
  let phase: Phase = 'menu'
  let placing: TowerType | null = null
  let selected: Tower | null = null
  let hover: { col: number; row: number } | null = null
  let fast = false
  let best = 0

  // 畫面上的按鈕區塊
  const shopRects = TOWER_TYPES.map((_, i): Rect => ({ x: 10 + i * 134, y: SHOP_Y, w: 128, h: 68 }))
  const waveRect: Rect = { x: 560, y: SHOP_Y, w: 110, h: 31 }
  const speedRect: Rect = { x: 560, y: SHOP_Y + 37, w: 110, h: 31 }
  const upgradeRect: Rect = { x: 560, y: SHOP_Y, w: 110, h: 31 }
  const sellRect: Rect = { x: 560, y: SHOP_Y + 37, w: 110, h: 31 }
  const nextWaveRect: Rect = { x: 680, y: SHOP_Y, w: 110, h: 68 }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (m: GameMap): void => {
    closeDialog()
    map = m
    state = createState(map)
    placing = null
    selected = null
    fast = false
    phase = 'playing'
    loop?.resume()
  }

  const mapButtons = (): HTMLElement[] =>
    MAPS.map((m) =>
      Button({
        label: m.name,
        variant: m === map ? 'primary' : 'secondary',
        onClick: () => start(m),
      }),
    )

  const showMenu = (): void => {
    closeDialog()
    state = createState(map)
    phase = 'menu'
    placing = null
    selected = null
    dialog = Dialog({
      title: '塔防',
      content: [
        `擋住 ${FINAL_WAVE} 波敵人，不要讓牠們走到終點（共 ${START_LIVES} 條命）。`,
        '點下方的塔再點空地蓋塔，點已蓋的塔可升級或出售。數字鍵 1~4 快速選塔，Esc 取消／暫停。',
        '選一張地圖開始：',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        ...mapButtons(),
      ],
    })
    dialog.open()
    redraw?.()
  }

  const finish = (won: boolean): void => {
    phase = 'over'
    best = Math.max(best, state.wave)
    dialog = Dialog({
      title: won ? '守住了！' : '防線被突破了',
      content: [
        won
          ? `你撐過了全部 ${FINAL_WAVE} 波，還剩 ${state.lives} 條命。`
          : `撐到第 ${state.wave} 波，本次最遠第 ${best} 波。`,
        '再玩一次，或換一張地圖：',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        ...mapButtons(),
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

  const cellOf = (x: number, y: number): { col: number; row: number } | null => {
    const col = Math.floor(x / CELL)
    const row = Math.floor((y - GRID_Y) / CELL)
    return col >= 0 && col < COLS && row >= 0 && row < ROWS ? { col, row } : null
  }

  const choose = (type: TowerType): void => {
    placing = type
    selected = null
  }

  const onMouseMove = (e: MouseEvent): void => {
    const p = vp.toLogical(e.clientX, e.clientY)
    hover = cellOf(p.x, p.y)
  }

  const onMouseDown = (e: MouseEvent): void => {
    if (phase !== 'playing') return
    if (e.button === 2) {
      placing = null
      selected = null
      return
    }
    if (e.button !== 0) return
    const p = vp.toLogical(e.clientX, e.clientY)

    // 下方面板
    if (p.y >= SHOP_Y) {
      TOWER_TYPES.forEach((type, i) => {
        if (inRect(shopRects[i] as Rect, p.x, p.y)) choose(type)
      })
      if (selected) {
        if (inRect(upgradeRect, p.x, p.y) && upgradeTower(state, selected)) ctx.audio.play('score')
        else if (inRect(sellRect, p.x, p.y)) {
          sellTower(state, selected)
          selected = null
          ctx.audio.play('click')
        }
      } else {
        if (inRect(speedRect, p.x, p.y)) fast = !fast
        if (inRect(waveRect, p.x, p.y) && startWave(state)) ctx.audio.play('click')
      }
      if (inRect(nextWaveRect, p.x, p.y) && startWave(state)) ctx.audio.play('click')
      return
    }

    const cell = cellOf(p.x, p.y)
    if (!cell) return
    const existing = towerAt(state, cell.col, cell.row)
    if (existing) {
      selected = existing
      placing = null
      return
    }
    if (placing) {
      if (placeTower(state, placing, cell.col, cell.row)) ctx.audio.play('click')
      else ctx.audio.play('fail')
      return
    }
    selected = null
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (phase === 'paused') resume()
      else if (placing || selected) {
        placing = null
        selected = null
      } else pause()
      return
    }
    if (phase !== 'playing' || e.repeat) return
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code)
    if (idx >= 0) choose(TOWER_TYPES[idx] as TowerType)
    else if (e.code === 'Space') {
      e.preventDefault()
      if (startWave(state)) ctx.audio.play('click')
    } else if (e.code === 'KeyU' && selected && upgradeTower(state, selected))
      ctx.audio.play('score')
    else if (e.code === 'KeyF') fast = !fast
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', onMouseMove)
  vp.canvas.addEventListener('mousedown', onMouseDown)
  vp.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  removeListeners = () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('mousemove', onMouseMove)
    vp.canvas.removeEventListener('mousedown', onMouseDown)
  }

  const play = (events: TdEvent[]): void => {
    for (const ev of events) {
      if (ev === 'kill') ctx.audio.play('score')
      else if (ev === 'leak') ctx.audio.play('explosion')
      else if (ev === 'wave-clear' || ev === 'win') ctx.audio.play('success')
      else if (ev === 'boss') ctx.audio.play('fail')
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    const times = fast ? 2 : 1
    for (let i = 0; i < times; i++) {
      play(step(state, dt))
      if (state.gameOver || state.won) break
    }
    if (selected && !state.towers.includes(selected)) selected = null
    if (state.gameOver) finish(false)
    else if (state.won) finish(true)
  }

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

  const drawButton = (r: Rect, label: string, fill: string, enabled = true): void => {
    const g = vp.ctx
    g.fillStyle = ink
    g.fillRect(r.x + 3, r.y + 3, r.w, r.h)
    g.fillStyle = enabled ? fill : '#dddddd'
    g.fillRect(r.x, r.y, r.w, r.h)
    g.lineWidth = 3
    g.strokeStyle = ink
    g.strokeRect(r.x, r.y, r.w, r.h)
    drawText(label, r.x + r.w / 2, r.y + r.h / 2, 18, 'center', enabled ? ink : '#888888')
  }

  const circle = (x: number, y: number, r: number, fill: string, stroke = true): void => {
    const g = vp.ctx
    g.fillStyle = fill
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    if (stroke) {
      g.lineWidth = 3
      g.strokeStyle = ink
      g.stroke()
    }
  }

  const drawTower = (type: TowerType, x: number, y: number, level: number, angle: number): void => {
    const g = vp.ctx
    const color = TOWERS[type].color
    g.fillStyle = ink
    g.fillRect(x - 19, y - 17, 40, 40)
    g.fillStyle = white
    g.fillRect(x - 22, y - 22, 44, 44)
    g.lineWidth = 3
    g.strokeStyle = ink
    g.strokeRect(x - 22, y - 22, 44, 44)
    g.save()
    g.translate(x, y)
    g.rotate(angle)
    g.fillStyle = color
    if (type === 'cannon') g.fillRect(0, -6, 22, 12)
    else if (type === 'sniper') g.fillRect(0, -3, 26, 6)
    else if (type === 'arrow') g.fillRect(0, -2.5, 20, 5)
    g.strokeRect(
      type === 'cannon' ? 0 : 0,
      type === 'cannon' ? -6 : type === 'sniper' ? -3 : -2.5,
      type === 'sniper' ? 26 : type === 'cannon' ? 22 : 20,
      type === 'cannon' ? 12 : type === 'sniper' ? 6 : 5,
    )
    g.restore()
    circle(x, y, type === 'ice' ? 13 : 10, color)
    for (let i = 0; i < level; i++) {
      g.fillStyle = '#ffc933'
      g.fillRect(x - 17 + i * 11, y + 14, 9, 6)
      g.lineWidth = 2
      g.strokeRect(x - 17 + i * 11, y + 14, 9, 6)
    }
  }

  const drawRange = (x: number, y: number, range: number, ok: boolean): void => {
    const g = vp.ctx
    g.fillStyle = ok ? 'rgba(74,163,255,0.16)' : 'rgba(255,77,77,0.18)'
    g.strokeStyle = ok ? 'rgba(27,27,27,0.55)' : 'rgba(214,47,47,0.7)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(x, y, range, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 草地
    g.fillStyle = '#c9ecb4'
    g.fillRect(0, GRID_Y, WIDTH, ROWS * CELL)
    g.fillStyle = 'rgba(27,27,27,0.05)'
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++)
        if ((r + c) % 2 === 0) g.fillRect(c * CELL, GRID_Y + r * CELL, CELL, CELL)
    }
    // 路線
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    state.pathPoints.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)))
    g.strokeStyle = ink
    g.lineWidth = CELL - 2
    g.stroke()
    g.strokeStyle = '#e8c98a'
    g.lineWidth = CELL - 10
    g.stroke()
    g.lineCap = 'butt'
    g.lineJoin = 'miter'
    g.lineWidth = 4
    g.strokeStyle = ink
    g.strokeRect(0, GRID_Y, WIDTH, ROWS * CELL)

    // 範圍提示
    if (selected) {
      const c = towerCenter(selected)
      drawRange(c.x, c.y, statsOf(selected).range, true)
    } else if (placing && hover) {
      const cx = hover.col * CELL + CELL / 2
      const cy = GRID_Y + hover.row * CELL + CELL / 2
      const ok = canPlace(state, placing, hover.col, hover.row)
      drawRange(cx, cy, TOWERS[placing].range, ok)
      g.globalAlpha = 0.6
      drawTower(placing, cx, cy, 1, 0)
      g.globalAlpha = 1
    } else if (hover) {
      const t = towerAt(state, hover.col, hover.row)
      if (t) {
        const c = towerCenter(t)
        drawRange(c.x, c.y, statsOf(t).range, true)
      }
    }

    for (const t of state.towers) {
      const c = towerCenter(t)
      drawTower(t.type, c.x, c.y, t.level, t.angle)
      if (selected === t) {
        g.lineWidth = 3
        g.strokeStyle = accent
        g.strokeRect(c.x - 25, c.y - 25, 50, 50)
      }
    }

    // 效果
    for (const f of state.effects) {
      const k = f.age / f.life
      if (f.kind === 'boom') {
        circle(f.x, f.y, f.r * (0.4 + 0.6 * k), `rgba(255,154,60,${0.55 * (1 - k)})`, false)
      } else if (f.kind === 'frost') {
        g.strokeStyle = `rgba(63,208,208,${0.9 * (1 - k)})`
        g.lineWidth = 5
        g.beginPath()
        g.arc(f.x, f.y, f.r * (0.5 + 0.5 * k), 0, Math.PI * 2)
        g.stroke()
      } else {
        g.strokeStyle = f.color
        g.lineWidth = 6 * (1 - k) + 1
        g.beginPath()
        g.moveTo(f.x, f.y)
        g.lineTo(f.x2, f.y2)
        g.stroke()
      }
    }

    // 敵人
    for (const e of state.enemies) {
      const spec = ENEMIES[e.type]
      const p = posAt(state, e.dist)
      circle(p.x + 2, p.y + 3, spec.r, ink, false)
      circle(p.x, p.y, spec.r, e.slow < 1 ? '#8fe3e3' : spec.color)
      g.fillStyle = white
      g.fillRect(p.x - 5, p.y - 4, 4, 5)
      g.fillRect(p.x + 1, p.y - 4, 4, 5)
      g.fillStyle = ink
      g.fillRect(p.x - 4, p.y - 2, 2, 3)
      g.fillRect(p.x + 2, p.y - 2, 2, 3)
      const w = spec.r * 2 + 4
      g.fillStyle = ink
      g.fillRect(p.x - w / 2 - 1, p.y - spec.r - 10, w + 2, 6)
      g.fillStyle = '#ff4d4d'
      g.fillRect(p.x - w / 2, p.y - spec.r - 9, w, 4)
      g.fillStyle = '#4ade80'
      g.fillRect(p.x - w / 2, p.y - spec.r - 9, (w * Math.max(0, e.hp)) / e.maxHp, 4)
    }

    // 子彈
    for (const b of state.shots) {
      if (b.kind === 'arrow') circle(b.x, b.y, 4, ink, false)
      else circle(b.x, b.y, 7, TOWERS.cannon.color)
    }

    // 上方資訊
    drawText(`金幣 ${state.gold}`, 16, 32, 26)
    drawText(`第 ${Math.max(state.wave, 1)} / ${FINAL_WAVE} 波`, WIDTH / 2, 32, 26, 'center')
    circle(WIDTH - 118, 32, 11, '#ff4d4d')
    drawText(`× ${state.lives}`, WIDTH - 98, 32, 26)

    // 下方面板
    TOWER_TYPES.forEach((type, i) => {
      const r = shopRects[i] as Rect
      const spec = TOWERS[type]
      const affordable = state.gold >= spec.cost
      g.fillStyle = ink
      g.fillRect(r.x + 3, r.y + 3, r.w, r.h)
      g.fillStyle = placing === type ? '#fff3b0' : white
      g.fillRect(r.x, r.y, r.w, r.h)
      g.lineWidth = placing === type ? 5 : 3
      g.strokeStyle = ink
      g.strokeRect(r.x, r.y, r.w, r.h)
      circle(r.x + 24, r.y + 28, 14, spec.color)
      drawText(`${i + 1}`, r.x + 14, r.y + 10, 14)
      drawText(spec.name, r.x + 44, r.y + 20, 18)
      drawText(
        `${spec.cost} 金`,
        r.x + 44,
        r.y + 40,
        18,
        'left',
        affordable ? '#1a8f4a' : '#d62f2f',
      )
      drawText(spec.desc, r.x + r.w / 2, r.y + 58, 12, 'center', '#555555')
    })

    if (selected) {
      const cost = upgradeCost(selected)
      drawButton(
        upgradeRect,
        selected.level >= MAX_LEVEL ? '已滿級' : `升級 ${cost}`,
        '#ffd84d',
        selected.level < MAX_LEVEL && state.gold >= cost,
      )
      drawButton(sellRect, `出售 +${sellValue(selected)}`, '#ffb3b3')
    } else {
      drawButton(
        waveRect,
        state.waveActive ? '進行中…' : `第 ${state.wave + 1} 波`,
        '#bfe9b0',
        !state.waveActive,
      )
      drawButton(speedRect, fast ? '加速 ×2' : '加速 ×1', '#cfe3ff')
    }
    drawButton(
      nextWaveRect,
      state.waveActive ? `剩 ${state.enemies.length + state.spawning.length}` : '開始下一波',
      '#bfe9b0',
      !state.waveActive,
    )

    if (selected) {
      const st = statsOf(selected)
      drawText(
        `${TOWERS[selected.type].name} Lv${selected.level}  傷害 ${Math.round(st.damage)}  射程 ${Math.round(st.range)}`,
        WIDTH - 12,
        48,
        16,
        'right',
        '#333333',
      )
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
