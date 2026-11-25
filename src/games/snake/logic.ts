import type { Random } from '../../shared/random.ts'

export const COLS = 24
export const ROWS = 16

export type Direction = 'up' | 'down' | 'left' | 'right'

export const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export interface Level {
  id: string
  label: string
  /** 每秒走幾格 */
  speed: number
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', label: '簡單', speed: 7 },
  { id: 'normal', label: '普通', speed: 10 },
  { id: 'hard', label: '困難', speed: 14 },
]

export interface Cell {
  x: number
  y: number
}

export interface State {
  /** 蛇身，第一個是頭 */
  snake: Cell[]
  dir: Direction
  food: Cell | null
  score: number
  eaten: number
  alive: boolean
  won: boolean
}

export function createState(rng: Random): State {
  const cy = Math.floor(ROWS / 2)
  const cx = Math.floor(COLS / 2)
  const snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ]
  const state: State = {
    snake,
    dir: 'right',
    food: null,
    score: 0,
    eaten: 0,
    alive: true,
    won: false,
  }
  state.food = placeFood(snake, rng)
  return state
}

/** 在沒有蛇的格子隨機放食物；滿盤時回傳 null */
export function placeFood(snake: readonly Cell[], rng: Random): Cell | null {
  const taken = new Set(snake.map((c) => c.y * COLS + c.x))
  const free: Cell[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (!taken.has(y * COLS + x)) free.push({ x, y })
  }
  return free.length === 0 ? null : rng.pick(free)
}

/** 往目前方向前進一格；撞牆或撞到自己就死亡 */
export function advance(state: State, dir: Direction, rng: Random): { ate: boolean } {
  state.dir = dir
  const head = state.snake[0] as Cell
  const { dx, dy } = DELTAS[dir]
  const next = { x: head.x + dx, y: head.y + dy }
  if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
    state.alive = false
    return { ate: false }
  }
  const ate = state.food !== null && next.x === state.food.x && next.y === state.food.y
  // 沒吃到時尾巴會前進，所以尾巴那格可以踩
  const body = ate ? state.snake : state.snake.slice(0, -1)
  if (body.some((c) => c.x === next.x && c.y === next.y)) {
    state.alive = false
    return { ate: false }
  }
  state.snake.unshift(next)
  if (ate) {
    state.eaten += 1
    state.food = placeFood(state.snake, rng)
    if (state.food === null) {
      state.won = true
      state.alive = false
    }
  } else {
    state.snake.pop()
  }
  return { ate }
}
