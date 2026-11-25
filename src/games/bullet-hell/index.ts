import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createLoop } from '../../shared/loop.ts'
import type { Loop } from '../../shared/loop.ts'
import { createRandom } from '../../shared/random.ts'
import type { Viewport } from '../../shared/viewport.ts'
import type { GameContext } from '../types.ts'
import { HEIGHT, PLAYER_R, STAGES, WIDTH, createState, update as step } from './logic.ts'
import type { BulletEvent, Enemy, State } from './logic.ts'

/** 彈幕射擊：方向鍵（或 WASD）移動，按住 Shift 慢速精準移動，會自動射擊，Space 或 X 放炸彈 */

type Phase = 'menu' | 'playing' | 'paused' | 'over'

const BULLET_COLORS = ['#ff6b8a', '#ffc933', '#4aa3ff']

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

  let state: State = createState(rng)
  let phase: Phase = 'menu'
  let best = 0
  let elapsed = 0
  let slowHeld = false
  let bombRequested = false
  let winDelay = 0

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const start = (): void => {
    closeDialog()
    state = createState(rng)
    bombRequested = false
    winDelay = 0
    phase = 'playing'
    loop?.resume()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: '彈幕射擊',
      content: [
        '方向鍵或 WASD 移動，會自動射擊。按住 Shift 慢速精準移動，這時能看到你真正的受擊點（很小）。',
        '空白鍵或 X 放炸彈：清掉全部彈幕並傷害敵人。接住掉落的 P 增加火力、B 補充炸彈。',
        `共 ${STAGES} 關，每關最後有首領。被打中會損失一條命，Esc 暫停。`,
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
    const won = state.won
    dialog = Dialog({
      title: won ? '全部通關！' : '遊戲結束',
      content: [
        won
          ? `你擊敗了全部 ${STAGES} 關的首領！分數 ${state.score}，本次最高 ${best}。`
          : `在第 ${state.stage} 關倒下。分數 ${state.score}，本次最高 ${best}。`,
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
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code))
      e.preventDefault()
    if ((e.code === 'Space' || e.code === 'KeyX') && !e.repeat && phase === 'playing')
      bombRequested = true
  }
  window.addEventListener('keydown', onKeyDown)
  removeKeys = () => window.removeEventListener('keydown', onKeyDown)

  const play = (events: BulletEvent[]): void => {
    for (const ev of events) {
      if (ev === 'kill') ctx.audio.play('click')
      else if (ev === 'hit' || ev === 'gameover') ctx.audio.play('explosion')
      else if (ev === 'bomb' || ev === 'powerup' || ev === 'stage-clear' || ev === 'win')
        ctx.audio.play('success')
      else if (ev === 'boss-phase') ctx.audio.play('fail')
    }
  }

  const update = (dt: number): void => {
    ctx.input.endFrame()
    if (phase !== 'playing') return
    elapsed += dt
    const i = ctx.input
    const dx =
      (i.isDown('ArrowRight') || i.isDown('KeyD') ? 1 : 0) -
      (i.isDown('ArrowLeft') || i.isDown('KeyA') ? 1 : 0)
    const dy =
      (i.isDown('ArrowDown') || i.isDown('KeyS') ? 1 : 0) -
      (i.isDown('ArrowUp') || i.isDown('KeyW') ? 1 : 0)
    slowHeld = i.isDown('ShiftLeft') || i.isDown('ShiftRight')
    play(step(state, dt, { dx, dy, slow: slowHeld, bomb: bombRequested }, rng))
    bombRequested = false
    if (state.gameOver) finish()
    else if (state.won) {
      // 打倒最後的首領後，讓畫面停一下再跳出結果
      winDelay += dt
      if (winDelay > 1.6) finish()
    }
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

  const drawEnemy = (e: Enemy): void => {
    const g = vp.ctx
    g.lineWidth = 3
    g.strokeStyle = ink
    g.save()
    g.translate(e.x, e.y)
    if (e.type === 'drone') {
      g.fillStyle = '#4aa3ff'
      g.beginPath()
      g.moveTo(-e.r, -e.r * 0.6)
      g.lineTo(e.r, -e.r * 0.6)
      g.lineTo(0, e.r)
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = white
      g.beginPath()
      g.arc(0, -3, 4, 0, Math.PI * 2)
      g.fill()
    } else if (e.type === 'swooper') {
      g.fillStyle = '#ffc933'
      g.beginPath()
      g.moveTo(0, -e.r)
      g.lineTo(e.r + 4, 0)
      g.lineTo(0, e.r)
      g.lineTo(-e.r - 4, 0)
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = ink
      g.fillRect(-4, -3, 8, 6)
    } else if (e.type === 'turret') {
      g.fillStyle = '#ff9a3c'
      g.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + e.age
        g.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r)
      }
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = white
      g.beginPath()
      g.arc(0, 0, 5, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    } else {
      g.fillStyle = e.hp / e.maxHp < 0.5 ? '#b0304a' : '#b36bff'
      g.beginPath()
      g.arc(0, 0, e.r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = white
      for (const sx of [-12, 12]) {
        g.beginPath()
        g.arc(sx, -6, 8, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = ink
        g.beginPath()
        g.arc(sx, -4, 3.2, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = white
      }
      g.beginPath()
      g.moveTo(-14, 12)
      g.quadraticCurveTo(0, 22, 14, 12)
      g.stroke()
    }
    g.restore()
  }

  const render = (): void => {
    const g = vp.ctx
    vp.clear()
    g.fillStyle = paper
    g.fillRect(0, 0, WIDTH, HEIGHT)

    // 背景：往下捲動的小點
    g.fillStyle = 'rgba(27,27,27,0.1)'
    const off = (elapsed * 60) % 80
    for (let y = -80; y < HEIGHT + 80; y += 80) {
      for (let x = 20; x < WIDTH; x += 80) g.fillRect(x + ((y / 80) % 2) * 40, y + off, 4, 4)
    }

    for (const p of state.pickups) {
      g.fillStyle = p.kind === 'power' ? '#ff6b5e' : '#4aa3ff'
      g.beginPath()
      g.arc(p.x, p.y, 12, 0, Math.PI * 2)
      g.fill()
      g.lineWidth = 3
      g.strokeStyle = ink
      g.stroke()
      drawText(p.kind === 'power' ? 'P' : 'B', p.x, p.y + 1, 15, 'center', white)
    }

    for (const e of state.enemies) drawEnemy(e)

    // 玩家子彈
    g.fillStyle = ink
    for (const b of state.shots) g.fillRect(b.x - 2, b.y - 7, 4, 14)

    // 敵彈
    for (const b of state.bullets) {
      g.fillStyle = BULLET_COLORS[b.c] ?? '#ff6b8a'
      g.beginPath()
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      g.fill()
      g.lineWidth = 2
      g.strokeStyle = ink
      g.stroke()
    }

    // 玩家
    const blink = state.invuln > 0 && Math.floor(elapsed * 14) % 2 === 0
    if (!blink) {
      g.save()
      g.translate(state.px, state.py)
      g.fillStyle = ink
      g.beginPath()
      g.moveTo(3, -17)
      g.lineTo(15, 15)
      g.lineTo(-9, 15)
      g.closePath()
      g.fill()
      g.fillStyle = accent
      g.lineWidth = 3
      g.strokeStyle = ink
      g.beginPath()
      g.moveTo(0, -18)
      g.lineTo(12, 12)
      g.lineTo(-12, 12)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
    // 受擊點：慢速時畫大一點的圈
    if (slowHeld) {
      g.strokeStyle = ink
      g.lineWidth = 2
      g.beginPath()
      g.arc(state.px, state.py, 14, 0, Math.PI * 2)
      g.stroke()
    }
    g.fillStyle = white
    g.beginPath()
    g.arc(state.px, state.py, PLAYER_R + 1.5, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#d62f2f'
    g.beginPath()
    g.arc(state.px, state.py, PLAYER_R, 0, Math.PI * 2)
    g.fill()

    if (state.bombFlash > 0) {
      g.fillStyle = `rgba(255,255,255,${state.bombFlash})`
      g.fillRect(0, 0, WIDTH, HEIGHT)
    }

    // 上方資訊
    drawText(`分數 ${state.score}`, 18, 24, 24)
    for (let i = 0; i < state.lives; i++) {
      g.fillStyle = '#ff4d4d'
      g.beginPath()
      g.arc(WIDTH - 24 - i * 26, 22, 9, 0, Math.PI * 2)
      g.fill()
      g.lineWidth = 2.5
      g.strokeStyle = ink
      g.stroke()
    }
    drawText(`炸彈 ${state.bombs}   火力 ${state.power}`, WIDTH - 18, 52, 17, 'right')
    drawText(`第 ${state.stage} / ${STAGES} 關`, WIDTH / 2, 24, 22, 'center')

    const boss = state.enemies.find((e) => e.type === 'boss')
    if (boss) {
      const w = 420
      const x = (WIDTH - w) / 2
      g.fillStyle = ink
      g.fillRect(x - 3, 40, w + 6, 16)
      g.fillStyle = '#ffd6d6'
      g.fillRect(x, 43, w, 10)
      g.fillStyle = '#ff6b5e'
      g.fillRect(x, 43, (w * Math.max(0, boss.hp)) / boss.maxHp, 10)
    }

    if (state.banner > 0) drawText(`第 ${state.stage} 關`, WIDTH / 2, HEIGHT / 2 - 60, 52, 'center')
    if (state.clearTimer > 0 && !state.won)
      drawText(`第 ${state.stage} 關完成！`, WIDTH / 2, HEIGHT / 2 - 20, 46, 'center')

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
