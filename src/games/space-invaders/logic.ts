import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600

export const INV_COLS = 11
export const INV_ROWS = 5
export const CELL_W = 48
export const CELL_H = 38
/** 外星人碰撞框 */
export const INV_W = 36
export const INV_H = 24
const FORMATION_X = 76
const FORMATION_Y0 = 96
const STEP_PX = 14
const DROP_PX = 20
const EDGE = 20

export const PLAYER_Y = HEIGHT - 52
export const PLAYER_W = 39
export const PLAYER_H = 24
const PLAYER_SPEED = 330
const PLAYER_BULLET_SPEED = 660
const FIRE_COOLDOWN = 0.3
const MAX_PLAYER_BULLETS = 2
const RESPAWN_TIME = 1.2
const INVULN_TIME = 2

export const BLOCK = 4
export const BUNKER_COLS = 22
export const BUNKER_ROWS = 16
export const BUNKER_Y = PLAYER_Y - 96
export const BUNKER_COUNT = 4
const BUNKER_X0 = 80
const BUNKER_GAP = (WIDTH - BUNKER_X0 * 2 - BUNKER_COUNT * BUNKER_COLS * BLOCK) / (BUNKER_COUNT - 1)
export const bunkerX = (i: number): number => BUNKER_X0 + i * (BUNKER_COLS * BLOCK + BUNKER_GAP)

export const UFO_W = 48
export const UFO_H = 21
export const UFO_Y = 62
const UFO_SPEED = 130
const UFO_POINTS = [50, 100, 150, 300]

export const START_LIVES = 3

export interface Bullet {
  x: number
  y: number
}

export interface UfoState {
  x: number
  dir: 1 | -1
  points: number
}

export interface State {
  wave: number
  alive: boolean[][]
  /** 外星人陣列左上角（第 0 欄、第 0 排的格子位置） */
  fx: number
  fy: number
  dir: 1 | -1
  stepTimer: number
  frame: 0 | 1
  playerX: number
  lives: number
  score: number
  bullets: Bullet[]
  enemyBullets: Bullet[]
  fireCooldown: number
  enemyFireTimer: number
  bunkers: boolean[][]
  ufo: UfoState | null
  ufoTimer: number
  /** 被打中後的重生等待與無敵時間 */
  respawn: number
  invuln: number
  /** 清完一波後的等待時間 */
  waveTimer: number
  gameOver: boolean
}

export type InvadersEvent =
  'shoot' | 'step' | 'kill' | 'ufo-hit' | 'player-hit' | 'wave-clear' | 'gameover' | 'enemy-shoot'

/** 碉堡形狀：上方兩角削掉，下方中間挖一個拱門 */
function bunkerShape(): boolean[] {
  const cells: boolean[] = []
  for (let r = 0; r < BUNKER_ROWS; r++) {
    for (let c = 0; c < BUNKER_COLS; c++) {
      const corner = r < 4 && (c < 4 - r || c >= BUNKER_COLS - (4 - r))
      const arch =
        r >= 10 && c >= 7 && c < BUNKER_COLS - 7 && (r >= 12 || (c >= 8 && c < BUNKER_COLS - 8))
      cells.push(!corner && !arch)
    }
  }
  return cells
}

const formationY = (wave: number): number => FORMATION_Y0 + Math.min(wave - 1, 5) * 18

function fillWave(state: State): void {
  state.alive = Array.from({ length: INV_ROWS }, () => Array<boolean>(INV_COLS).fill(true))
  state.fx = FORMATION_X
  state.fy = formationY(state.wave)
  state.dir = 1
  state.stepTimer = 0
  state.frame = 0
  state.bullets = []
  state.enemyBullets = []
  state.waveTimer = 0
  state.enemyFireTimer = 1
}

export function createState(rng: Random): State {
  const state: State = {
    wave: 1,
    alive: [],
    fx: 0,
    fy: 0,
    dir: 1,
    stepTimer: 0,
    frame: 0,
    playerX: WIDTH / 2,
    lives: START_LIVES,
    score: 0,
    bullets: [],
    enemyBullets: [],
    fireCooldown: 0,
    enemyFireTimer: 1,
    bunkers: Array.from({ length: BUNKER_COUNT }, () => bunkerShape()),
    ufo: null,
    ufoTimer: 12 + rng.next() * 10,
    respawn: 0,
    invuln: 0,
    waveTimer: 0,
    gameOver: false,
  }
  fillWave(state)
  return state
}

export const aliveCount = (s: State): number =>
  s.alive.reduce((n, r) => n + r.filter(Boolean).length, 0)

export const invaderPos = (s: State, row: number, col: number): { x: number; y: number } => ({
  x: s.fx + col * CELL_W,
  y: s.fy + row * CELL_H,
})

/** 每排的分數：上面的外星人比較值錢 */
export const rowScore = (row: number): number => (row === 0 ? 30 : row < 3 ? 20 : 10)

/** 還剩越少越快；波數越高整體越快 */
function stepInterval(s: State): number {
  const total = INV_COLS * INV_ROWS
  const f = aliveCount(s) / total
  const speed = (40 + 240 * (1 - f) * (1 - f)) * (1 + 0.12 * (s.wave - 1))
  return STEP_PX / speed
}

function eraseBlocks(
  s: State,
  b: number,
  cx: number,
  cy: number,
  radius: number,
  rng: Random,
): void {
  const cells = s.bunkers[b] as boolean[]
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= BUNKER_COLS || y >= BUNKER_ROWS) continue
      // 中心一定打掉，外圍隨機，讓缺口看起來不規則
      if ((dx === 0 && dy === 0) || rng.next() < 0.6) cells[y * BUNKER_COLS + x] = false
    }
  }
}

/** 子彈（點）是否打到某個碉堡；打到就削掉並回傳 true */
function hitBunker(s: State, bx: number, by: number, radius: number, rng: Random): boolean {
  for (let i = 0; i < BUNKER_COUNT; i++) {
    const cx = Math.floor((bx - bunkerX(i)) / BLOCK)
    const cy = Math.floor((by - BUNKER_Y) / BLOCK)
    if (cx < 0 || cy < 0 || cx >= BUNKER_COLS || cy >= BUNKER_ROWS) continue
    if ((s.bunkers[i] as boolean[])[cy * BUNKER_COLS + cx]) {
      eraseBlocks(s, i, cx, cy, radius, rng)
      return true
    }
  }
  return false
}

/** 外星人陣列掃過碉堡時，把碰到的部分壓掉 */
function crushBunkers(s: State): void {
  for (let r = 0; r < INV_ROWS; r++) {
    for (let c = 0; c < INV_COLS; c++) {
      if (!(s.alive[r] as boolean[])[c]) continue
      const p = invaderPos(s, r, c)
      if (p.y + INV_H < BUNKER_Y || p.y > BUNKER_Y + BUNKER_ROWS * BLOCK) continue
      for (let i = 0; i < BUNKER_COUNT; i++) {
        const cells = s.bunkers[i] as boolean[]
        for (let y = 0; y < BUNKER_ROWS; y++) {
          for (let x = 0; x < BUNKER_COLS; x++) {
            const px = bunkerX(i) + x * BLOCK
            const py = BUNKER_Y + y * BLOCK
            if (px + BLOCK > p.x && px < p.x + INV_W && py + BLOCK > p.y && py < p.y + INV_H) {
              cells[y * BUNKER_COLS + x] = false
            }
          }
        }
      }
    }
  }
}

export interface Controls {
  /** -1 左、0 不動、1 右 */
  dir: number
  fire: boolean
}

export function update(s: State, dt: number, controls: Controls, rng: Random): InvadersEvent[] {
  const events: InvadersEvent[] = []
  if (s.gameOver) return events

  // 玩家
  if (s.respawn > 0) {
    s.respawn -= dt
  } else {
    s.playerX = Math.max(
      PLAYER_W / 2 + 8,
      Math.min(WIDTH - PLAYER_W / 2 - 8, s.playerX + controls.dir * PLAYER_SPEED * dt),
    )
    s.fireCooldown -= dt
    if (
      controls.fire &&
      s.fireCooldown <= 0 &&
      s.bullets.length < MAX_PLAYER_BULLETS &&
      s.waveTimer <= 0
    ) {
      s.bullets.push({ x: s.playerX, y: PLAYER_Y - 6 })
      s.fireCooldown = FIRE_COOLDOWN
      events.push('shoot')
    }
  }
  if (s.invuln > 0) s.invuln -= dt

  // 清完一波，稍等再開始下一波
  if (s.waveTimer > 0) {
    s.waveTimer -= dt
    if (s.waveTimer <= 0) {
      s.wave += 1
      fillWave(s)
    }
    moveBullets(s, dt, events, rng)
    return events
  }

  // 外星人陣列移動
  s.stepTimer -= dt
  if (s.stepTimer <= 0) {
    s.stepTimer += stepInterval(s)
    if (s.stepTimer < 0) s.stepTimer = 0
    stepFormation(s)
    events.push('step')
    crushBunkers(s)
    // 外星人降到玩家那排就輸了
    for (let r = INV_ROWS - 1; r >= 0; r--) {
      if ((s.alive[r] as boolean[]).some(Boolean) && s.fy + r * CELL_H + INV_H >= PLAYER_Y - 4) {
        s.lives = 0
        s.gameOver = true
        events.push('gameover')
        return events
      }
    }
  }

  // 外星人開火
  s.enemyFireTimer -= dt
  const maxEnemyBullets = Math.min(5, 3 + Math.floor(s.wave / 2))
  if (s.enemyFireTimer <= 0 && s.enemyBullets.length < maxEnemyBullets) {
    s.enemyFireTimer = Math.max(0.35, 1.4 - 0.1 * (s.wave - 1)) * (0.6 + rng.next() * 0.8)
    const cols = Array.from({ length: INV_COLS }, (_, c) => c).filter((c) =>
      s.alive.some((row) => row[c]),
    )
    if (cols.length > 0) {
      const col = rng.pick(cols)
      let row = INV_ROWS - 1
      while (row > 0 && !(s.alive[row] as boolean[])[col]) row--
      const p = invaderPos(s, row, col)
      s.enemyBullets.push({ x: p.x + INV_W / 2, y: p.y + INV_H })
      events.push('enemy-shoot')
    }
  }

  moveBullets(s, dt, events, rng)

  // 飛碟
  s.ufoTimer -= dt
  if (s.ufo === null && s.ufoTimer <= 0) {
    const dir = rng.next() < 0.5 ? 1 : -1
    s.ufo = { x: dir === 1 ? -UFO_W : WIDTH, dir, points: rng.pick(UFO_POINTS) }
    s.ufoTimer = 15 + rng.next() * 10
  }
  if (s.ufo) {
    s.ufo.x += s.ufo.dir * UFO_SPEED * dt
    if (s.ufo.x < -UFO_W - 4 || s.ufo.x > WIDTH + 4) s.ufo = null
  }

  if (aliveCount(s) === 0 && !s.gameOver) {
    s.waveTimer = 2
    s.enemyBullets = []
    events.push('wave-clear')
  }
  return events
}

function stepFormation(s: State): void {
  s.frame = s.frame === 0 ? 1 : 0
  let minCol = INV_COLS
  let maxCol = -1
  for (let c = 0; c < INV_COLS; c++) {
    if (s.alive.some((row) => row[c])) {
      minCol = Math.min(minCol, c)
      maxCol = Math.max(maxCol, c)
    }
  }
  if (maxCol < 0) return
  const left = s.fx + minCol * CELL_W
  const right = s.fx + maxCol * CELL_W + INV_W
  if ((s.dir === 1 && right + STEP_PX > WIDTH - EDGE) || (s.dir === -1 && left - STEP_PX < EDGE)) {
    s.fy += DROP_PX
    s.dir = s.dir === 1 ? -1 : 1
  } else {
    s.fx += s.dir * STEP_PX
  }
}

function moveBullets(s: State, dt: number, events: InvadersEvent[], rng: Random): void {
  // 玩家子彈：分成小段前進，避免穿過碉堡
  s.bullets = s.bullets.filter((b) => {
    const steps = Math.ceil((PLAYER_BULLET_SPEED * dt) / 3)
    for (let i = 0; i < steps; i++) {
      b.y -= (PLAYER_BULLET_SPEED * dt) / steps
      if (b.y < 30) return false
      if (hitBunker(s, b.x, b.y, 1, rng)) return false
      // 外星人
      for (let r = 0; r < INV_ROWS; r++) {
        for (let c = 0; c < INV_COLS; c++) {
          if (!(s.alive[r] as boolean[])[c]) continue
          const p = invaderPos(s, r, c)
          if (b.x >= p.x && b.x <= p.x + INV_W && b.y >= p.y && b.y <= p.y + INV_H) {
            ;(s.alive[r] as boolean[])[c] = false
            s.score += rowScore(r)
            events.push('kill')
            return false
          }
        }
      }
      if (
        s.ufo &&
        b.x >= s.ufo.x &&
        b.x <= s.ufo.x + UFO_W &&
        b.y <= UFO_Y + UFO_H &&
        b.y >= UFO_Y
      ) {
        s.score += s.ufo.points
        s.ufo = null
        events.push('ufo-hit')
        return false
      }
    }
    return true
  })

  // 敵方子彈
  const speed = 230 + 15 * s.wave
  s.enemyBullets = s.enemyBullets.filter((b) => {
    const steps = Math.ceil((speed * dt) / 3)
    for (let i = 0; i < steps; i++) {
      b.y += (speed * dt) / steps
      if (b.y > HEIGHT) return false
      if (hitBunker(s, b.x, b.y, 1, rng)) return false
      if (
        s.respawn <= 0 &&
        s.invuln <= 0 &&
        b.y >= PLAYER_Y &&
        b.y <= PLAYER_Y + PLAYER_H &&
        Math.abs(b.x - s.playerX) <= PLAYER_W / 2
      ) {
        s.lives -= 1
        events.push('player-hit')
        if (s.lives <= 0) {
          s.gameOver = true
          events.push('gameover')
        } else {
          s.respawn = RESPAWN_TIME
          s.invuln = RESPAWN_TIME + INVULN_TIME
          s.bullets = []
          s.playerX = WIDTH / 2
        }
        return false
      }
    }
    return true
  })
}
