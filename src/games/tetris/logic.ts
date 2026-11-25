import type { Random } from '../../shared/random.ts'

export const COLS = 10
export const ROWS = 20

export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z'
export const PIECE_TYPES: readonly PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z']

/** 方塊顏色（對應格子裡存的 1~7） */
export const COLORS: Record<PieceType, string> = {
  I: '#3fd0d0',
  J: '#4aa3ff',
  L: '#ff9a3c',
  O: '#ffc933',
  S: '#2fb67c',
  T: '#b36bff',
  Z: '#ff6b5e',
}

const BASE: Record<PieceType, readonly (readonly number[])[]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
}

type Matrix = readonly (readonly number[])[]

function rotateCw(m: Matrix): Matrix {
  const n = m.length
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => m[n - 1 - c]?.[r] ?? 0),
  )
}

/** 每種方塊的 4 個旋轉狀態 */
const SHAPES: Record<PieceType, Matrix[]> = Object.fromEntries(
  PIECE_TYPES.map((t) => {
    const states: Matrix[] = [BASE[t]]
    for (let i = 1; i < 4; i++) states.push(rotateCw(states[i - 1] as Matrix))
    return [t, states]
  }),
) as Record<PieceType, Matrix[]>

type Kick = readonly [number, number]

/** SRS 踢牆資料（來源 rot → 目標 rot）；y 向上為正，使用時會翻成畫面座標 */
const KICKS_JLSTZ: Record<string, readonly Kick[]> = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
}
const KICKS_I: Record<string, readonly Kick[]> = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
}

export interface Piece {
  type: PieceType
  rot: number
  /** 方塊矩陣左上角在棋盤上的位置（可能在棋盤外上方） */
  x: number
  y: number
}

export type Board = number[][]

export interface State {
  board: Board
  piece: Piece
  hold: PieceType | null
  holdUsed: boolean
  queue: PieceType[]
  bag: PieceType[]
  score: number
  lines: number
  level: number
  gameOver: boolean
  /** 重力累積時間與落地後的鎖定倒數 */
  gravityTimer: number
  lockTimer: number
  lockResets: number
  /** 消行動畫：要消除的列與剩餘秒數 */
  clearing: { rows: number[]; timer: number } | null
}

export type TetrisEvent =
  'move' | 'rotate' | 'lock' | 'hold' | 'clear' | 'tetris' | 'levelup' | 'gameover'

const LOCK_DELAY = 0.5
const MAX_LOCK_RESETS = 15
export const CLEAR_ANIM = 0.25
const LINE_SCORE = [0, 100, 300, 500, 800]

export const cellsOf = (p: Piece): { x: number; y: number }[] => {
  const m = SHAPES[p.type][p.rot] as Matrix
  const cells: { x: number; y: number }[] = []
  m.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) cells.push({ x: p.x + c, y: p.y + r })
    }),
  )
  return cells
}

export const shapeOf = (type: PieceType, rot = 0): Matrix => SHAPES[type][rot] as Matrix

export function collides(board: Board, p: Piece): boolean {
  return cellsOf(p).some(
    ({ x, y }) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && (board[y]?.[x] ?? 0) !== 0),
  )
}

function refillBag(bag: PieceType[], rng: Random): void {
  while (bag.length < 7) bag.push(...rng.shuffle(PIECE_TYPES))
}

function spawnPiece(type: PieceType): Piece {
  const size = (BASE[type] as Matrix).length
  return { type, rot: 0, x: Math.floor((COLS - size) / 2), y: type === 'I' ? -1 : 0 }
}

function nextType(state: State, rng: Random): PieceType {
  refillBag(state.bag, rng)
  const type = state.queue.shift() as PieceType
  state.queue.push(state.bag.shift() as PieceType)
  return type
}

export function createState(rng: Random): State {
  const state: State = {
    board: Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0)),
    piece: spawnPiece('T'),
    hold: null,
    holdUsed: false,
    queue: [],
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    clearing: null,
  }
  refillBag(state.bag, rng)
  for (let i = 0; i < 5; i++) state.queue.push(state.bag.shift() as PieceType)
  state.piece = spawnPiece(nextType(state, rng))
  return state
}

/** 每下落一格需要的秒數（越高等級越快） */
export function fallInterval(level: number): number {
  return Math.max(0.02, Math.pow(0.8 - (level - 1) * 0.007, level - 1))
}

const grounded = (s: State): boolean => collides(s.board, { ...s.piece, y: s.piece.y + 1 })

/** 成功移動或旋轉後，若方塊貼地就重設鎖定倒數（最多 15 次，避免永遠不落地） */
function onAdjusted(s: State): void {
  if (grounded(s) && s.lockResets < MAX_LOCK_RESETS) {
    s.lockTimer = 0
    s.lockResets += 1
  }
}

export function moveHorizontal(s: State, dx: number): boolean {
  if (s.gameOver || s.clearing) return false
  const moved = { ...s.piece, x: s.piece.x + dx }
  if (collides(s.board, moved)) return false
  s.piece = moved
  onAdjusted(s)
  return true
}

export function rotate(s: State, dir: 1 | -1): boolean {
  if (s.gameOver || s.clearing || s.piece.type === 'O') return false
  const from = s.piece.rot
  const to = (from + dir + 4) % 4
  const table = s.piece.type === 'I' ? KICKS_I : KICKS_JLSTZ
  for (const [kx, ky] of table[`${from}>${to}`] ?? [[0, 0]]) {
    const test = { ...s.piece, rot: to, x: s.piece.x + kx, y: s.piece.y - ky }
    if (!collides(s.board, test)) {
      s.piece = test
      onAdjusted(s)
      return true
    }
  }
  return false
}

/** 鬼影：方塊直接落到底的位置 */
export function ghostOf(s: State): Piece {
  let p = s.piece
  while (!collides(s.board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 }
  return p
}

function lockPiece(s: State, rng: Random): TetrisEvent[] {
  const events: TetrisEvent[] = ['lock']
  const color = PIECE_TYPES.indexOf(s.piece.type) + 1
  let above = false
  for (const { x, y } of cellsOf(s.piece)) {
    if (y < 0) above = true
    else (s.board[y] as number[])[x] = color
  }
  s.holdUsed = false
  s.lockTimer = 0
  s.lockResets = 0
  s.gravityTimer = 0
  const rows = s.board.map((r, i) => (r.every((v) => v !== 0) ? i : -1)).filter((i) => i >= 0)
  if (rows.length > 0) {
    s.clearing = { rows, timer: CLEAR_ANIM }
    events.push(rows.length === 4 ? 'tetris' : 'clear')
    return events
  }
  if (above) {
    s.gameOver = true
    events.push('gameover')
    return events
  }
  spawnNext(s, rng, events)
  return events
}

function spawnNext(s: State, rng: Random, events: TetrisEvent[]): void {
  s.piece = spawnPiece(nextType(s, rng))
  if (collides(s.board, s.piece)) {
    s.gameOver = true
    events.push('gameover')
  }
}

function finishClear(s: State, rng: Random, events: TetrisEvent[]): void {
  const clearing = s.clearing
  if (!clearing) return
  const count = clearing.rows.length
  const kept = s.board.filter((_, i) => !clearing.rows.includes(i))
  s.board = [...Array.from({ length: count }, () => Array<number>(COLS).fill(0)), ...kept]
  s.clearing = null
  s.score += (LINE_SCORE[count] ?? 0) * s.level
  s.lines += count
  const level = Math.floor(s.lines / 10) + 1
  if (level > s.level) {
    s.level = level
    events.push('levelup')
  }
  spawnNext(s, rng, events)
}

export function hardDrop(s: State, rng: Random): TetrisEvent[] {
  if (s.gameOver || s.clearing) return []
  const ghost = ghostOf(s)
  s.score += 2 * (ghost.y - s.piece.y)
  s.piece = ghost
  return lockPiece(s, rng)
}

export function holdPiece(s: State, rng: Random): TetrisEvent[] {
  if (s.gameOver || s.clearing || s.holdUsed) return []
  const current = s.piece.type
  const events: TetrisEvent[] = ['hold']
  if (s.hold === null) {
    s.hold = current
    s.piece = spawnPiece(nextType(s, rng))
  } else {
    s.piece = spawnPiece(s.hold)
    s.hold = current
  }
  s.holdUsed = true
  s.gravityTimer = 0
  s.lockTimer = 0
  s.lockResets = 0
  if (collides(s.board, s.piece)) {
    s.gameOver = true
    events.push('gameover')
  }
  return events
}

/** 重力、鎖定與消行動畫；softDrop 為 true 時下落加速 */
export function tick(s: State, dt: number, softDrop: boolean, rng: Random): TetrisEvent[] {
  const events: TetrisEvent[] = []
  if (s.gameOver) return events
  if (s.clearing) {
    s.clearing.timer -= dt
    if (s.clearing.timer <= 0) finishClear(s, rng, events)
    return events
  }
  if (grounded(s)) {
    s.lockTimer += dt
    if (s.lockTimer >= LOCK_DELAY || (softDrop && s.lockTimer >= LOCK_DELAY / 3)) {
      events.push(...lockPiece(s, rng))
    }
    return events
  }
  s.lockTimer = 0
  s.gravityTimer += dt
  const interval = softDrop ? Math.min(fallInterval(s.level), 0.05) : fallInterval(s.level)
  while (s.gravityTimer >= interval) {
    s.gravityTimer -= interval
    if (collides(s.board, { ...s.piece, y: s.piece.y + 1 })) break
    s.piece = { ...s.piece, y: s.piece.y + 1 }
    if (softDrop) s.score += 1
  }
  return events
}
