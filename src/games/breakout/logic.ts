import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600
export const BRICK_COLS = 10
export const BRICK_W = 68
export const BRICK_H = 24
export const BRICK_GAP = 6
const BRICK_LEFT = (WIDTH - (BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP)) / 2
const BRICK_TOP = 84
export const PADDLE_Y = HEIGHT - 44
export const PADDLE_H = 16
export const BALL_R = 8
export const START_LIVES = 3
/** 越上面的磚塊分數越高：第 0 排 70 分，每往下一排少 10 分，最少 10 分 */
const BRICK_ROWS_BONUS = 7
const PADDLE_SPEED = 620
const MAX_ANGLE = (Math.PI / 180) * 62

/** 關卡：1 = 一下就破，2 = 要打兩下，0 = 空 */
export const STAGES: readonly (readonly string[])[] = [
  ['1111111111', '1111111111', '1111111111', '1111111111', '1111111111'],
  ['2222222222', '1111111111', '1010101010', '0101010101', '1111111111'],
  ['0000000000', '0001111000', '0011111100', '0111111110', '1111111111', '2222222222'],
  ['2121212121', '1212121212', '2121212121', '1212121212', '0000000000', '1111111111'],
]

/** 每一排的顏色，由上而下 */
export const ROW_COLORS = ['#ff6b5e', '#ff9a3c', '#ffc933', '#2fb67c', '#4aa3ff', '#b36bff']

export interface Brick {
  x: number
  y: number
  hp: number
  maxHp: number
  row: number
}

export interface State {
  stage: number
  bricks: Brick[]
  paddleX: number
  paddleW: number
  ball: { x: number; y: number; vx: number; vy: number }
  /** 球還黏在球拍上等待發射 */
  stuck: boolean
  lives: number
  score: number
  /** 過關後到下一關的等待秒數；0 代表沒在過關 */
  clearTimer: number
  gameOver: boolean
}

export type BreakoutEvent = 'wall' | 'paddle' | 'brick' | 'break' | 'lose-life' | 'clear'

export function ballSpeed(stage: number): number {
  return Math.min(620, 340 + (stage - 1) * 30)
}

function buildBricks(stage: number): Brick[] {
  const layout = STAGES[(stage - 1) % STAGES.length] as readonly string[]
  const bricks: Brick[] = []
  layout.forEach((line, row) => {
    for (let col = 0; col < BRICK_COLS; col++) {
      const hp = Number(line[col] ?? '0')
      if (hp > 0) {
        bricks.push({
          x: BRICK_LEFT + col * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
          hp,
          maxHp: hp,
          row,
        })
      }
    }
  })
  return bricks
}

const paddleWidth = (stage: number): number => (stage >= 4 ? 100 : 116)

export function startStage(state: State, stage: number): void {
  state.stage = stage
  state.bricks = buildBricks(stage)
  state.paddleW = paddleWidth(stage)
  state.paddleX = (WIDTH - state.paddleW) / 2
  state.stuck = true
  state.clearTimer = 0
  state.ball = { x: 0, y: 0, vx: 0, vy: 0 }
  placeBall(state)
}

export function createState(): State {
  const state: State = {
    stage: 1,
    bricks: [],
    paddleX: 0,
    paddleW: 116,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    stuck: true,
    lives: START_LIVES,
    score: 0,
    clearTimer: 0,
    gameOver: false,
  }
  startStage(state, 1)
  return state
}

function placeBall(state: State): void {
  state.ball.x = state.paddleX + state.paddleW / 2
  state.ball.y = PADDLE_Y - BALL_R - 1
}

const clampPaddle = (state: State, x: number): number =>
  Math.max(0, Math.min(WIDTH - state.paddleW, x))

/** 發射：朝上方稍微隨機的角度 */
export function launch(state: State, rng: Random): boolean {
  if (!state.stuck || state.clearTimer > 0 || state.gameOver) return false
  const angle = (rng.next() * 2 - 1) * ((Math.PI / 180) * 22)
  const speed = ballSpeed(state.stage)
  state.ball.vx = Math.sin(angle) * speed
  state.ball.vy = -Math.cos(angle) * speed
  state.stuck = false
  return true
}

export interface Controls {
  /** -1 左、0 不動、1 右 */
  dir: number
  /** 滑鼠的邏輯 x 座標；沒有用滑鼠時為 null */
  mouseX: number | null
}

export function update(state: State, dt: number, controls: Controls): BreakoutEvent[] {
  const events: BreakoutEvent[] = []
  if (state.gameOver) return events

  if (controls.mouseX !== null) {
    state.paddleX = clampPaddle(state, controls.mouseX - state.paddleW / 2)
  }
  if (controls.dir !== 0) {
    state.paddleX = clampPaddle(state, state.paddleX + controls.dir * PADDLE_SPEED * dt)
  }

  if (state.clearTimer > 0) {
    state.clearTimer -= dt
    if (state.clearTimer <= 0) startStage(state, state.stage + 1)
    return events
  }
  if (state.stuck) {
    placeBall(state)
    return events
  }

  const ball = state.ball
  const speed = Math.hypot(ball.vx, ball.vy)
  const steps = Math.max(1, Math.ceil((speed * dt) / 5))
  const h = dt / steps

  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * h
    ball.y += ball.vy * h

    // 牆與天花板
    if (ball.x < BALL_R) {
      ball.x = BALL_R
      ball.vx = Math.abs(ball.vx)
      events.push('wall')
    } else if (ball.x > WIDTH - BALL_R) {
      ball.x = WIDTH - BALL_R
      ball.vx = -Math.abs(ball.vx)
      events.push('wall')
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R
      ball.vy = Math.abs(ball.vy)
      events.push('wall')
    }

    // 球拍
    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.y - BALL_R <= PADDLE_Y + PADDLE_H &&
      ball.x >= state.paddleX - BALL_R &&
      ball.x <= state.paddleX + state.paddleW + BALL_R
    ) {
      const rel = Math.max(
        -1,
        Math.min(1, (ball.x - (state.paddleX + state.paddleW / 2)) / (state.paddleW / 2 + BALL_R)),
      )
      const angle = rel * MAX_ANGLE
      const s = Math.min(720, Math.hypot(ball.vx, ball.vy) * 1.01)
      ball.vx = Math.sin(angle) * s
      ball.vy = -Math.cos(angle) * s
      ball.y = PADDLE_Y - BALL_R
      events.push('paddle')
    }

    // 磚塊：一次只處理一塊，避免同時碰到兩塊時反彈兩次
    for (const brick of state.bricks) {
      if (brick.hp <= 0) continue
      const nx = Math.max(brick.x, Math.min(ball.x, brick.x + BRICK_W))
      const ny = Math.max(brick.y, Math.min(ball.y, brick.y + BRICK_H))
      const dx = ball.x - nx
      const dy = ball.y - ny
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx)
      } else {
        ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy)
      }
      // 把球推到磚塊外面，避免下一小段又算成碰到同一塊
      const dist = Math.hypot(dx, dy)
      if (dist > 1e-6) {
        ball.x = nx + (dx / dist) * (BALL_R + 0.5)
        ball.y = ny + (dy / dist) * (BALL_R + 0.5)
      } else {
        ball.x -= ball.vx * h
        ball.y -= ball.vy * h
      }
      brick.hp -= 1
      if (brick.hp <= 0) {
        state.score += 10 * (BRICK_ROWS_BONUS - Math.min(brick.row, BRICK_ROWS_BONUS - 1))
        events.push('break')
      } else {
        events.push('brick')
      }
      break
    }

    if (state.bricks.every((b) => b.hp <= 0)) {
      state.clearTimer = 1.6
      state.score += 100
      events.push('clear')
      return events
    }

    // 掉出下緣
    if (ball.y > HEIGHT + BALL_R * 2) {
      state.lives -= 1
      events.push('lose-life')
      if (state.lives <= 0) state.gameOver = true
      else {
        state.stuck = true
        placeBall(state)
      }
      return events
    }
  }
  return events
}
