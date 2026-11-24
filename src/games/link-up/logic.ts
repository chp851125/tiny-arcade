import type { Random } from '../../shared/random.ts'

export interface Level {
  id: string
  label: string
  cols: number
  rows: number
  /** 圖案種類數；越多越難 */
  types: number
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', label: '簡單', cols: 8, rows: 6, types: 12 },
  { id: 'normal', label: '普通', cols: 12, rows: 8, types: 20 },
  { id: 'hard', label: '困難', cols: 16, rows: 10, types: 28 },
]

/**
 * 盤面比實際牌區外圍多一圈空格（讓路線可以繞到外面）。
 * 格子以 (x, y) 座標表示，0 代表空格，大於 0 代表圖案編號。
 */
export interface Board {
  /** 含外圈的寬、高 */
  width: number
  height: number
  cells: number[]
}

export interface Point {
  x: number
  y: number
}

export function createBoard(level: Level, rng: Random): Board {
  const width = level.cols + 2
  const height = level.rows + 2
  const pairs = (level.cols * level.rows) / 2
  const tiles: number[] = []
  for (let p = 0; p < pairs; p++) tiles.push((p % level.types) + 1, (p % level.types) + 1)
  const cells = Array<number>(width * height).fill(0)
  let k = 0
  for (const t of rng.shuffle(tiles)) {
    // 依序填進牌區（跳過外圈）
    while ((k % width) % (width - 1) === 0 || Math.floor(k / width) % (height - 1) === 0) k += 1
    cells[k] = t
    k += 1
  }
  return { width, height, cells }
}

const at = (b: Board, p: Point): number => b.cells[p.y * b.width + p.x] ?? 0

/** 兩點之間（不含兩端）是否全是空格，且在同一列或同一欄 */
function clearBetween(b: Board, a: Point, c: Point): boolean {
  if (a.x === c.x) {
    for (let y = Math.min(a.y, c.y) + 1; y < Math.max(a.y, c.y); y++) {
      if (at(b, { x: a.x, y }) !== 0) return false
    }
    return true
  }
  if (a.y === c.y) {
    for (let x = Math.min(a.x, c.x) + 1; x < Math.max(a.x, c.x); x++) {
      if (at(b, { x, y: a.y }) !== 0) return false
    }
    return true
  }
  return false
}

/** 找出連接兩格、最多轉兩次彎的路線；找不到回傳 null */
export function findPath(b: Board, a: Point, c: Point): Point[] | null {
  if (a.x === c.x && a.y === c.y) return null
  // 不轉彎
  if (clearBetween(b, a, c)) return [a, c]
  // 轉一次彎
  for (const corner of [
    { x: a.x, y: c.y },
    { x: c.x, y: a.y },
  ]) {
    if (at(b, corner) === 0 && clearBetween(b, a, corner) && clearBetween(b, corner, c)) {
      return [a, corner, c]
    }
  }
  // 轉兩次彎：先沿欄（或列）走到 p，橫（直）移到 q，再走到終點
  for (let y = 0; y < b.height; y++) {
    const p = { x: a.x, y }
    const q = { x: c.x, y }
    if (y === a.y || y === c.y) continue
    if (
      at(b, p) === 0 &&
      at(b, q) === 0 &&
      clearBetween(b, a, p) &&
      clearBetween(b, p, q) &&
      clearBetween(b, q, c)
    ) {
      return [a, p, q, c]
    }
  }
  for (let x = 0; x < b.width; x++) {
    const p = { x, y: a.y }
    const q = { x, y: c.y }
    if (x === a.x || x === c.x) continue
    if (
      at(b, p) === 0 &&
      at(b, q) === 0 &&
      clearBetween(b, a, p) &&
      clearBetween(b, p, q) &&
      clearBetween(b, q, c)
    ) {
      return [a, p, q, c]
    }
  }
  return null
}

export function pointOf(b: Board, index: number): Point {
  return { x: index % b.width, y: Math.floor(index / b.width) }
}

/** 找出一組可以消除的牌；沒有則回傳 null */
export function findMove(b: Board): { a: number; b: number; path: Point[] } | null {
  const byType = new Map<number, number[]>()
  b.cells.forEach((t, i) => {
    if (t === 0) return
    const list = byType.get(t) ?? []
    list.push(i)
    byType.set(t, list)
  })
  for (const list of byType.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ia = list[i] ?? 0
        const ib = list[j] ?? 0
        const path = findPath(b, pointOf(b, ia), pointOf(b, ib))
        if (path) return { a: ia, b: ib, path }
      }
    }
  }
  return null
}

export function remaining(b: Board): number {
  return b.cells.filter((t) => t !== 0).length
}

/** 把剩下的牌重新排列（位置洗牌），直到有可消除的牌；最多試 50 次 */
export function reshuffle(b: Board, rng: Random): void {
  const spots = b.cells.map((t, i) => (t === 0 ? -1 : i)).filter((i) => i >= 0)
  const tiles = spots.map((i) => b.cells[i] ?? 0)
  for (let attempt = 0; attempt < 50; attempt++) {
    const mixed = rng.shuffle(tiles)
    spots.forEach((spot, k) => {
      b.cells[spot] = mixed[k] ?? 0
    })
    if (findMove(b)) return
  }
}
