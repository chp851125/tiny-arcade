import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600
export const GROUND_Y = 480
export const RUNNER_X = 150
export const RUNNER_W = 40
export const RUNNER_H = 70
export const DUCK_H = 38

const GRAVITY = 2600
const JUMP_SPEED = 900
/** 放開跳躍鍵時，往上的速度最多保留這麼多（做出短跳） */
const CUT_SPEED = 330
const HIT_SHRINK = 8

export type ObstacleType = 'crate' | 'tall' | 'pair' | 'bird'

export interface Obstacle {
  type: ObstacleType
  x: number
  w: number
  h: number
  /** 底部離地面的高度 */
  lift: number
}

export interface State {
  /** 小人腳底離地的高度與垂直速度 */
  y: number
  vy: number
  ducking: boolean
  started: boolean
  dead: boolean
  obstacles: Obstacle[]
  /** 已跑的距離（像素） */
  distance: number
  /** 下一個障礙物要出現在多遠之後 */
  nextSpawn: number
  /** 腳步動畫與地面捲動 */
  run: number
}

export type RunnerEvent = 'jump' | 'land' | 'hit' | 'milestone'

export interface Controls {
  /** 這一步剛按下跳躍 */
  jumpPressed: boolean
  /** 跳躍鍵還按著 */
  jumpHeld: boolean
  duck: boolean
}

export function createState(): State {
  return {
    y: 0,
    vy: 0,
    ducking: false,
    started: false,
    dead: false,
    obstacles: [],
    distance: 0,
    nextSpawn: 700,
    run: 0,
  }
}

export const metersOf = (s: State): number => Math.floor(s.distance / 40)

/** 跑速（像素／秒），隨距離慢慢變快，有上限 */
export function speedAt(meters: number): number {
  return Math.min(700, 320 + meters * 1.5)
}

function makeObstacle(meters: number, rng: Random): Obstacle {
  const r = rng.next()
  if (meters >= 150 && r < 0.22) return { type: 'bird', x: WIDTH + 40, w: 48, h: 30, lift: 40 }
  if (r < 0.5) return { type: 'crate', x: WIDTH + 40, w: 40, h: 50, lift: 0 }
  if (r < 0.75) return { type: 'tall', x: WIDTH + 40, w: 38, h: 88, lift: 0 }
  return { type: 'pair', x: WIDTH + 40, w: 92, h: 50, lift: 0 }
}

export function update(s: State, dt: number, c: Controls, rng: Random): RunnerEvent[] {
  const events: RunnerEvent[] = []
  const grounded = s.y <= 0 && s.vy <= 0

  if (s.dead) {
    // 死亡後原地掉回地面
    s.vy -= GRAVITY * dt
    s.y = Math.max(0, s.y + s.vy * dt)
    if (s.y === 0) s.vy = 0
    return events
  }

  if (c.jumpPressed && grounded) {
    s.started = true
    s.vy = JUMP_SPEED
    events.push('jump')
  }
  if (!s.started) return events

  s.ducking = c.duck && grounded
  // 空中按下蹲可以快速落地
  if (c.duck && !grounded) s.vy -= GRAVITY * 0.8 * dt
  if (!c.jumpHeld && s.vy > CUT_SPEED) s.vy = CUT_SPEED

  const wasAir = s.y > 0
  s.vy -= GRAVITY * dt
  s.y += s.vy * dt
  if (s.y <= 0) {
    s.y = 0
    s.vy = 0
    if (wasAir) events.push('land')
  }

  const meters = metersOf(s)
  const speed = speedAt(meters)
  const dx = speed * dt
  const before = Math.floor(meters / 100)
  s.distance += dx
  s.run += dx
  if (Math.floor(metersOf(s) / 100) > before) events.push('milestone')
  for (const o of s.obstacles) o.x -= dx
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > -20)
  s.nextSpawn -= dx
  if (s.nextSpawn <= 0) {
    const o = makeObstacle(meters, rng)
    s.obstacles.push(o)
    // 兩個障礙之間留夠跳起來再落地的距離，越快距離越長
    s.nextSpawn = speed * (0.95 + rng.next() * 0.9) + o.w
  }

  // 碰撞（判定框比畫面小一點，比較寬容）
  const rh = s.ducking ? DUCK_H : RUNNER_H
  const rx0 = RUNNER_X + HIT_SHRINK
  const rx1 = RUNNER_X + RUNNER_W - HIT_SHRINK
  const ry0 = s.y + HIT_SHRINK / 2
  const ry1 = s.y + rh - HIT_SHRINK
  for (const o of s.obstacles) {
    const ox0 = o.x + 4
    const ox1 = o.x + o.w - 4
    const oy0 = o.lift
    const oy1 = o.lift + o.h - 4
    if (rx1 > ox0 && rx0 < ox1 && ry1 > oy0 && ry0 < oy1) {
      s.dead = true
      s.vy = 300
      events.push('hit')
      break
    }
  }
  return events
}
