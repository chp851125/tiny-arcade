import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600
export const PADDLE_W = 14
export const PADDLE_H = 100
export const PADDLE_MARGIN = 30
export const BALL_R = 9
export const WIN_SCORE = 7

const PADDLE_SPEED = 480
const SERVE_SPEED = 380
const MAX_SPEED = 900
const SPEED_GAIN = 1.06
const MAX_ANGLE = (Math.PI / 180) * 58

export interface Level {
  id: string
  label: string
  /** 電腦球拍最高速度（像素／秒） */
  speed: number
  /** 電腦多久重新判斷一次球的位置（秒），越大越遲鈍 */
  reaction: number
  /** 電腦每次回擊前瞄準的最大誤差（像素） */
  error: number
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', label: '簡單', speed: 250, reaction: 0.22, error: 70 },
  { id: 'normal', label: '普通', speed: 340, reaction: 0.12, error: 40 },
  { id: 'hard', label: '困難', speed: 450, reaction: 0.05, error: 16 },
]

export interface State {
  ball: { x: number; y: number; vx: number; vy: number }
  /** 球拍上緣的 y */
  left: number
  right: number
  score: { player: number; cpu: number }
  /** 發球前的等待時間（秒） */
  serveTimer: number
  /** 電腦的瞄準目標與下次重新判斷的倒數 */
  cpuTarget: number
  cpuTimer: number
  cpuError: number
  winner: 'player' | 'cpu' | null
}

export type PongEvent = 'hit' | 'wall' | 'player-score' | 'cpu-score'

const centerY = (top: number): number => top + PADDLE_H / 2

export function createState(rng: Random, serveTo: 'player' | 'cpu' = 'cpu'): State {
  const state: State = {
    ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    left: (HEIGHT - PADDLE_H) / 2,
    right: (HEIGHT - PADDLE_H) / 2,
    score: { player: 0, cpu: 0 },
    serveTimer: 1,
    cpuTarget: HEIGHT / 2,
    cpuTimer: 0,
    cpuError: 0,
    winner: null,
  }
  serve(state, serveTo, rng)
  return state
}

/** 把球放回中央，朝 serveTo 那一方發出（丟球的人先接） */
export function serve(state: State, serveTo: 'player' | 'cpu', rng: Random): void {
  const angle = (rng.next() * 2 - 1) * ((Math.PI / 180) * 25)
  const dir = serveTo === 'player' ? -1 : 1
  state.ball = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx: Math.cos(angle) * SERVE_SPEED * dir,
    vy: Math.sin(angle) * SERVE_SPEED,
  }
  state.serveTimer = 1
}

const clampPaddle = (y: number): number => Math.min(HEIGHT - PADDLE_H, Math.max(0, y))

/** 電腦球拍：球朝它飛來時才追，並依難度有反應延遲與瞄準誤差 */
function moveCpu(state: State, level: Level, dt: number): void {
  state.cpuTimer -= dt
  if (state.cpuTimer <= 0) {
    state.cpuTimer = level.reaction
    state.cpuTarget = state.ball.vx > 0 ? state.ball.y + state.cpuError : HEIGHT / 2
  }
  const diff = state.cpuTarget - centerY(state.right)
  const maxMove = level.speed * dt
  if (Math.abs(diff) > 4)
    state.right = clampPaddle(state.right + Math.sign(diff) * Math.min(maxMove, Math.abs(diff)))
}

/** 球拍回擊後，電腦重新抽一個瞄準誤差 */
function rollCpuError(state: State, level: Level, rng: Random): void {
  state.cpuError = (rng.next() * 2 - 1) * level.error
}

/**
 * 前進一個固定時間步長。
 * @param dir 玩家球拍移動方向：-1 往上、0 不動、1 往下
 */
export function update(
  state: State,
  dt: number,
  dir: number,
  level: Level,
  rng: Random,
): PongEvent[] {
  const events: PongEvent[] = []
  if (state.winner) return events
  state.left = clampPaddle(state.left + dir * PADDLE_SPEED * dt)
  moveCpu(state, level, dt)

  if (state.serveTimer > 0) {
    state.serveTimer -= dt
    return events
  }

  const ball = state.ball
  // 球很快時分成小段前進，避免穿過球拍
  const speed = Math.hypot(ball.vx, ball.vy)
  const steps = Math.max(1, Math.ceil((speed * dt) / 6))
  const h = dt / steps
  const leftFace = PADDLE_MARGIN + PADDLE_W
  const rightFace = WIDTH - PADDLE_MARGIN - PADDLE_W

  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * h
    ball.y += ball.vy * h

    if (ball.y < BALL_R) {
      ball.y = BALL_R
      ball.vy = Math.abs(ball.vy)
      events.push('wall')
    } else if (ball.y > HEIGHT - BALL_R) {
      ball.y = HEIGHT - BALL_R
      ball.vy = -Math.abs(ball.vy)
      events.push('wall')
    }

    // 玩家球拍（左）
    if (
      ball.vx < 0 &&
      ball.x - BALL_R <= leftFace &&
      ball.x + BALL_R >= PADDLE_MARGIN &&
      ball.y >= state.left - BALL_R &&
      ball.y <= state.left + PADDLE_H + BALL_R
    ) {
      bounce(ball, centerY(state.left), 1)
      ball.x = leftFace + BALL_R
      rollCpuError(state, level, rng)
      state.cpuTimer = 0
      events.push('hit')
    }
    // 電腦球拍（右）
    else if (
      ball.vx > 0 &&
      ball.x + BALL_R >= rightFace &&
      ball.x - BALL_R <= WIDTH - PADDLE_MARGIN &&
      ball.y >= state.right - BALL_R &&
      ball.y <= state.right + PADDLE_H + BALL_R
    ) {
      bounce(ball, centerY(state.right), -1)
      ball.x = rightFace - BALL_R
      events.push('hit')
    }

    if (ball.x < -BALL_R * 2) {
      state.score.cpu += 1
      events.push('cpu-score')
      afterPoint(state, 'player', rng)
      break
    }
    if (ball.x > WIDTH + BALL_R * 2) {
      state.score.player += 1
      events.push('player-score')
      afterPoint(state, 'cpu', rng)
      break
    }
  }
  return events
}

function bounce(ball: State['ball'], paddleCenter: number, outward: 1 | -1): void {
  const rel = Math.max(-1, Math.min(1, (ball.y - paddleCenter) / (PADDLE_H / 2 + BALL_R)))
  const angle = rel * MAX_ANGLE
  const speed = Math.min(MAX_SPEED, Math.hypot(ball.vx, ball.vy) * SPEED_GAIN)
  ball.vx = Math.cos(angle) * speed * outward
  ball.vy = Math.sin(angle) * speed
}

function afterPoint(state: State, serveTo: 'player' | 'cpu', rng: Random): void {
  if (state.score.player >= WIN_SCORE) state.winner = 'player'
  else if (state.score.cpu >= WIN_SCORE) state.winner = 'cpu'
  else serve(state, serveTo, rng)
  state.cpuError = 0
}
