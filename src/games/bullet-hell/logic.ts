import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600
export const PLAYER_R = 3
const PLAYER_SPEED = 270
const PLAYER_SLOW = 115
const MARGIN = 14
export const STAGES = 3
const START_LIVES = 3
const START_BOMBS = 3
const INVULN = 2.4
const MAX_ENEMY_BULLETS = 700

export type EnemyType = 'drone' | 'swooper' | 'turret' | 'boss'

export interface Enemy {
  id: number
  type: EnemyType
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  age: number
  fire: number
  /** 王的螺旋彈角度 */
  angle: number
  r: number
}

export interface Bullet {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** 顏色編號，畫面用 */
  c: number
}

export interface Pickup {
  x: number
  y: number
  kind: 'power' | 'bomb'
}

export interface ScheduleItem {
  t: number
  type: EnemyType
  x: number
  dir: number
}

export interface State {
  stage: number
  stageTime: number
  schedule: ScheduleItem[]
  next: number
  px: number
  py: number
  lives: number
  bombs: number
  power: number
  score: number
  invuln: number
  shotCooldown: number
  enemies: Enemy[]
  bullets: Bullet[]
  shots: { x: number; y: number; vx: number; vy: number }[]
  pickups: Pickup[]
  /** 炸彈效果剩餘時間（畫面閃光用） */
  bombFlash: number
  bossAlive: boolean
  /** 打倒王之後到下一關的倒數 */
  clearTimer: number
  /** 剛過關或剛開始時的提示計時 */
  banner: number
  nextId: number
  gameOver: boolean
  won: boolean
  elapsed: number
}

export type BulletEvent =
  'kill' | 'hit' | 'bomb' | 'powerup' | 'boss-phase' | 'stage-clear' | 'win' | 'gameover'

export interface Controls {
  dx: number
  dy: number
  slow: boolean
  bomb: boolean
}

const BOSS_HP = [170, 240, 320]

function buildSchedule(stage: number, rng: Random): ScheduleItem[] {
  const list: ScheduleItem[] = []
  let t = 2
  const groups = 9 + stage * 2
  for (let g = 0; g < groups; g++) {
    const kind = g % 4
    if (kind === 0) {
      const cx = rng.int(160, WIDTH - 160)
      for (let k = 0; k < 4; k++)
        list.push({ t: t + k * 0.45, type: 'drone', x: cx + (k - 1.5) * 55, dir: 0 })
    } else if (kind === 1) {
      const side = rng.next() < 0.5 ? -1 : 1
      for (let k = 0; k < 3; k++)
        list.push({ t: t + k * 0.6, type: 'swooper', x: side === 1 ? -20 : WIDTH + 20, dir: side })
    } else if (kind === 2) {
      list.push({ t, type: 'turret', x: rng.int(120, WIDTH - 120), dir: 0 })
      list.push({ t: t + 0.4, type: 'drone', x: rng.int(80, WIDTH - 80), dir: 0 })
    } else {
      const cx = rng.int(200, WIDTH - 200)
      for (let k = 0; k < 5; k++)
        list.push({ t: t + k * 0.35, type: 'drone', x: cx + (k - 2) * 45, dir: 0 })
    }
    t += 3.4 - stage * 0.25
  }
  list.push({ t: t + 3, type: 'boss', x: WIDTH / 2, dir: 0 })
  return list
}

function startStage(s: State, stage: number, rng: Random): void {
  s.stage = stage
  s.stageTime = 0
  s.schedule = buildSchedule(stage, rng)
  s.next = 0
  s.enemies = []
  s.bullets = []
  s.shots = []
  s.pickups = []
  s.bossAlive = false
  s.clearTimer = 0
  s.banner = 2.2
}

export function createState(rng: Random): State {
  const s: State = {
    stage: 1,
    stageTime: 0,
    schedule: [],
    next: 0,
    px: WIDTH / 2,
    py: HEIGHT - 80,
    lives: START_LIVES,
    bombs: START_BOMBS,
    power: 1,
    score: 0,
    invuln: 1.5,
    shotCooldown: 0,
    enemies: [],
    bullets: [],
    shots: [],
    pickups: [],
    bombFlash: 0,
    bossAlive: false,
    clearTimer: 0,
    banner: 0,
    nextId: 1,
    gameOver: false,
    won: false,
    elapsed: 0,
  }
  startStage(s, 1, rng)
  return s
}

function enemySpec(type: EnemyType, stage: number): { hp: number; r: number } {
  if (type === 'drone') return { hp: 3, r: 14 }
  if (type === 'swooper') return { hp: 4, r: 14 }
  if (type === 'turret') return { hp: 9, r: 18 }
  return { hp: BOSS_HP[stage - 1] ?? 300, r: 34 }
}

function spawn(s: State, item: ScheduleItem): void {
  const spec = enemySpec(item.type, s.stage)
  const e: Enemy = {
    id: s.nextId++,
    type: item.type,
    x: item.x,
    y: item.type === 'swooper' ? 90 : -24,
    vx: 0,
    vy: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    age: 0,
    fire: item.type === 'boss' ? 1.5 : 0.8 + (item.x % 7) / 10,
    angle: 0,
    r: spec.r,
  }
  if (item.type === 'drone') e.vy = 70
  if (item.type === 'swooper') {
    e.vx = 190 * item.dir
    e.vy = 30
  }
  if (item.type === 'turret') e.vy = 60
  if (item.type === 'boss') {
    e.vy = 80
    s.bossAlive = true
  }
  s.enemies.push(e)
}

function shootAt(
  s: State,
  from: { x: number; y: number },
  angle: number,
  speed: number,
  c: number,
  r = 5,
): void {
  if (s.bullets.length >= MAX_ENEMY_BULLETS) return
  s.bullets.push({
    x: from.x,
    y: from.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r,
    c,
  })
}

const aimAt = (s: State, e: Enemy): number => Math.atan2(s.py - e.y, s.px - e.x)

function enemyLogic(s: State, e: Enemy, dt: number, events: BulletEvent[]): void {
  e.age += dt
  e.fire -= dt
  const st = s.stage
  if (e.type === 'drone') {
    e.x += Math.sin(e.age * 2.2) * 50 * dt
    e.y += e.vy * dt
    if (e.fire <= 0) {
      e.fire = 2 - st * 0.2
      const a = aimAt(s, e)
      if (st === 1) shootAt(s, e, a, 150, 0)
      else for (const d of [-0.22, 0, 0.22]) shootAt(s, e, a + d, 160, 0)
    }
  } else if (e.type === 'swooper') {
    e.x += e.vx * dt
    e.y += e.vy * dt + Math.sin(e.age * 3) * 20 * dt
    if (e.fire <= 0) {
      e.fire = 1.3
      shootAt(s, e, Math.PI / 2, 150, 1)
    }
  } else if (e.type === 'turret') {
    e.y += e.vy * dt
    if (e.y > 150) e.vy = 0
    if (e.fire <= 0 && e.vy === 0) {
      e.fire = 2.6 - st * 0.2
      const n = 6 + st * 2
      const off = e.age
      for (let k = 0; k < n; k++) shootAt(s, e, off + (k / n) * Math.PI * 2, 105, 2)
    }
    if (e.age > 14) e.vy = -70
  } else {
    bossLogic(s, e, dt, events)
  }
}

function bossLogic(s: State, e: Enemy, dt: number, events: BulletEvent[]): void {
  if (e.y < 110) {
    e.y += e.vy * dt
    return
  }
  e.x = WIDTH / 2 + Math.sin(e.age * 0.6) * 220
  const frac = e.hp / e.maxHp
  const phase2 = frac < 0.5
  if (phase2 && e.angle === 0) {
    e.angle = 0.001
    events.push('boss-phase')
    // 換階段時把場上彈幕清掉，讓玩家喘口氣
    s.bullets = []
  }
  const st = s.stage
  if (!phase2) {
    if (e.fire <= 0) {
      e.fire = 1.1 - st * 0.08
      const a = aimAt(s, e)
      for (let k = -2; k <= 2; k++) shootAt(s, e, a + k * 0.24, 160 + st * 10, 0)
      if (Math.floor(e.age / 1.1) % 3 === 0) {
        const n = 12 + st * 2
        for (let k = 0; k < n; k++) shootAt(s, e, (k / n) * Math.PI * 2 + e.age, 100, 2)
      }
    }
  } else if (e.fire <= 0) {
    e.fire = Math.max(0.09, 0.14 - st * 0.015)
    e.angle += 0.42
    const arms = st >= 3 ? 3 : 2
    for (let k = 0; k < arms; k++)
      shootAt(s, e, e.angle + (k / arms) * Math.PI * 2, 125 + st * 8, 1, 4.5)
    if (Math.floor(e.age * 10) % 12 === 0) shootAt(s, e, aimAt(s, e), 190, 0, 6)
  }
}

function dropFor(s: State, e: Enemy, rng: Random): void {
  if (e.type === 'boss') return
  const r = rng.next()
  if (r < 0.16) s.pickups.push({ x: e.x, y: e.y, kind: 'power' })
  else if (r < 0.2) s.pickups.push({ x: e.x, y: e.y, kind: 'bomb' })
}

function fireShots(s: State): void {
  const speed = 760
  const p = s.power
  const add = (dx: number, vx: number): void => {
    s.shots.push({ x: s.px + dx, y: s.py - 14, vx, vy: -speed })
  }
  add(0, 0)
  if (p >= 2) {
    s.shots.pop()
    add(-7, 0)
    add(7, 0)
  }
  if (p >= 3) {
    add(0, -120)
    add(0, 120)
  }
  if (p >= 4) {
    add(-14, -260)
    add(14, 260)
  }
}

function loseLife(s: State, events: BulletEvent[]): void {
  s.lives -= 1
  s.power = Math.max(1, s.power - 1)
  events.push('hit')
  if (s.lives <= 0) {
    s.gameOver = true
    events.push('gameover')
    return
  }
  s.invuln = INVULN
  // 被打中時清掉附近的彈幕
  s.bullets = s.bullets.filter((b) => (b.x - s.px) ** 2 + (b.y - s.py) ** 2 > 150 * 150)
  s.px = WIDTH / 2
  s.py = HEIGHT - 80
}

export function useBomb(s: State, events: BulletEvent[]): void {
  if (s.bombs <= 0 || s.gameOver || s.clearTimer > 0) return
  s.bombs -= 1
  s.bullets = []
  s.invuln = Math.max(s.invuln, 2)
  s.bombFlash = 0.6
  for (const e of s.enemies) e.hp -= e.type === 'boss' ? 14 : 12
  events.push('bomb')
}

export function update(s: State, dt: number, c: Controls, rng: Random): BulletEvent[] {
  const events: BulletEvent[] = []
  if (s.gameOver || s.won) return events
  s.elapsed += dt
  if (s.banner > 0) s.banner -= dt
  if (s.bombFlash > 0) s.bombFlash -= dt
  if (s.invuln > 0) s.invuln -= dt

  // 玩家移動
  const speed = c.slow ? PLAYER_SLOW : PLAYER_SPEED
  const len = Math.hypot(c.dx, c.dy) || 1
  s.px = Math.max(
    MARGIN,
    Math.min(WIDTH - MARGIN, s.px + (c.dx / len) * speed * dt * (c.dx || c.dy ? 1 : 0)),
  )
  s.py = Math.max(
    MARGIN + 30,
    Math.min(HEIGHT - MARGIN, s.py + (c.dy / len) * speed * dt * (c.dx || c.dy ? 1 : 0)),
  )
  if (c.bomb) useBomb(s, events)

  // 自動射擊
  s.shotCooldown -= dt
  if (s.shotCooldown <= 0 && s.clearTimer <= 0) {
    fireShots(s)
    s.shotCooldown = 0.09
  }

  // 敵人出場
  if (s.clearTimer <= 0) {
    s.stageTime += dt
    while (s.next < s.schedule.length && (s.schedule[s.next] as ScheduleItem).t <= s.stageTime) {
      spawn(s, s.schedule[s.next] as ScheduleItem)
      s.next += 1
    }
  }
  for (const e of s.enemies) enemyLogic(s, e, dt, events)

  // 玩家子彈
  s.shots = s.shots.filter((b) => {
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.y < -10 || b.x < -10 || b.x > WIDTH + 10) return false
    for (const e of s.enemies) {
      if (e.hp <= 0) continue
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 <= (e.r + 4) ** 2) {
        // 敵人還沒進畫面時不會被打
        if (e.y < 0) continue
        e.hp -= 1
        return false
      }
    }
    return true
  })

  // 敵彈與撞擊
  const hitR = PLAYER_R
  for (const b of s.bullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
  s.bullets = s.bullets.filter(
    (b) => b.x > -20 && b.x < WIDTH + 20 && b.y > -20 && b.y < HEIGHT + 20,
  )
  if (s.invuln <= 0) {
    const hit =
      s.bullets.some((b) => (b.x - s.px) ** 2 + (b.y - s.py) ** 2 <= (b.r + hitR) ** 2) ||
      s.enemies.some(
        (e) => e.type !== 'boss' && (e.x - s.px) ** 2 + (e.y - s.py) ** 2 <= (e.r + hitR) ** 2,
      )
    if (hit) loseLife(s, events)
    if (s.gameOver) return events
  }

  // 擊倒與掉落
  for (const e of s.enemies) {
    if (e.hp > 0) continue
    s.score += e.type === 'boss' ? 3000 : e.type === 'turret' ? 300 : 100
    events.push('kill')
    dropFor(s, e, rng)
    if (e.type === 'boss') {
      s.bossAlive = false
      s.bullets = []
      s.clearTimer = 3
      s.score += s.lives * 500
      events.push(s.stage >= STAGES ? 'win' : 'stage-clear')
      if (s.stage >= STAGES) s.won = true
    }
  }
  s.enemies = s.enemies.filter(
    (e) => e.hp > 0 && e.y < HEIGHT + 40 && e.x > -60 && e.x < WIDTH + 60 && e.y > -60,
  )

  // 道具
  s.pickups = s.pickups.filter((p) => {
    p.y += 95 * dt
    if ((p.x - s.px) ** 2 + (p.y - s.py) ** 2 <= 28 * 28) {
      if (p.kind === 'power') s.power = Math.min(4, s.power + 1)
      else s.bombs = Math.min(5, s.bombs + 1)
      events.push('powerup')
      return false
    }
    return p.y < HEIGHT + 20
  })

  // 過關
  if (s.clearTimer > 0 && !s.won) {
    s.clearTimer -= dt
    if (s.clearTimer <= 0) startStage(s, s.stage + 1, rng)
  }
  return events
}
