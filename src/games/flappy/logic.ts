import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600
export const GROUND_Y = 520
export const BIRD_X = 220
export const BIRD_R = 15
export const PIPE_W = 84

const GRAVITY = 1500
const FLAP_SPEED = -470
const MAX_FALL = 720
const PIPE_SPACING = 310
const MIN_TOP = 70

export interface Pipe {
  x: number
  /** 缺口中心的 y */
  gapY: number
  gap: number
  scored: boolean
}

export interface State {
  birdY: number
  birdVy: number
  pipes: Pipe[]
  score: number
  /** 開場時小鳥原地浮動，第一次拍翅膀才開始 */
  started: boolean
  dead: boolean
  scroll: number
  /** 拍翅膀動畫用的計時 */
  flapTimer: number
}

export type FlappyEvent = 'flap' | 'score' | 'hit'

/** 水管移動速度與缺口大小，會隨分數慢慢變難，但有上限 */
export function pipeSpeed(score: number): number {
  return Math.min(270, 190 + score * 3)
}
export function gapSize(score: number): number {
  return Math.max(150, 190 - score * 1.5)
}

export function createState(): State {
  return {
    birdY: HEIGHT / 2 - 40,
    birdVy: 0,
    pipes: [],
    score: 0,
    started: false,
    dead: false,
    scroll: 0,
    flapTimer: 0,
  }
}

function spawnPipe(s: State, x: number, rng: Random): void {
  const gap = gapSize(s.score)
  const gapY = rng.int(MIN_TOP + gap / 2, GROUND_Y - MIN_TOP - gap / 2)
  s.pipes.push({ x, gapY, gap, scored: false })
}

/** 圓形（小鳥）是否碰到矩形 */
function hitsRect(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const nx = Math.max(x, Math.min(cx, x + w))
  const ny = Math.max(y, Math.min(cy, y + h))
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r
}

export function update(s: State, dt: number, flap: boolean, rng: Random): FlappyEvent[] {
  const events: FlappyEvent[] = []
  s.flapTimer += dt
  if (s.dead) {
    // 死亡後小鳥繼續掉到地上
    s.birdVy = Math.min(MAX_FALL, s.birdVy + GRAVITY * dt)
    s.birdY = Math.min(GROUND_Y - BIRD_R, s.birdY + s.birdVy * dt)
    return events
  }
  if (flap) {
    s.started = true
    s.birdVy = FLAP_SPEED
    s.flapTimer = 0
    events.push('flap')
  }
  if (!s.started) {
    s.birdY = HEIGHT / 2 - 40 + Math.sin(s.flapTimer * 4) * 8
    s.scroll += 100 * dt
    return events
  }

  s.birdVy = Math.min(MAX_FALL, s.birdVy + GRAVITY * dt)
  s.birdY += s.birdVy * dt
  if (s.birdY < BIRD_R) {
    s.birdY = BIRD_R
    s.birdVy = Math.max(0, s.birdVy)
  }

  const speed = pipeSpeed(s.score)
  s.scroll += speed * dt
  for (const p of s.pipes) p.x -= speed * dt
  s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10)
  const last = s.pipes[s.pipes.length - 1]
  if (!last || last.x < WIDTH - PIPE_SPACING)
    spawnPipe(s, last ? last.x + PIPE_SPACING : WIDTH + 40, rng)

  for (const p of s.pipes) {
    if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
      p.scored = true
      s.score += 1
      events.push('score')
    }
    const top = p.gapY - p.gap / 2
    const bottom = p.gapY + p.gap / 2
    if (
      hitsRect(BIRD_X, s.birdY, BIRD_R - 2, p.x, 0, PIPE_W, top) ||
      hitsRect(BIRD_X, s.birdY, BIRD_R - 2, p.x, bottom, PIPE_W, GROUND_Y - bottom)
    ) {
      s.dead = true
    }
  }
  if (s.birdY + BIRD_R >= GROUND_Y) {
    s.birdY = GROUND_Y - BIRD_R
    s.dead = true
  }
  if (s.dead) events.push('hit')
  return events
}
