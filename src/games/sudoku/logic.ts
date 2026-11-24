import type { Random } from '../../shared/random.ts'

export const SIZE = 9
export const CELLS = SIZE * SIZE

export interface Level {
  id: string
  label: string
  /** 題目保留的提示數（越少越難） */
  clues: number
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', label: '簡單', clues: 40 },
  { id: 'normal', label: '普通', clues: 34 },
  { id: 'hard', label: '困難', clues: 29 },
  { id: 'expert', label: '專家', clues: 25 },
]

/** 同一列、同一欄、同一個 3×3 九宮格的其他格子（每格 20 個） */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: CELLS }, (_, i) => {
  const row = Math.floor(i / SIZE)
  const col = i % SIZE
  const boxRow = row - (row % 3)
  const boxCol = col - (col % 3)
  const peers = new Set<number>()
  for (let k = 0; k < SIZE; k++) {
    peers.add(row * SIZE + k)
    peers.add(k * SIZE + col)
  }
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) peers.add(r * SIZE + c)
  }
  peers.delete(i)
  return [...peers]
})

/** 某格目前還能填的數字 */
function available(grid: readonly number[], index: number): number[] {
  const used = new Set<number>()
  for (const p of PEERS[index] ?? []) used.add(grid[p] ?? 0)
  const result: number[] = []
  for (let d = 1; d <= SIZE; d++) if (!used.has(d)) result.push(d)
  return result
}

/** 挑選候選數字最少的空格；沒有空格回傳 -1，有空格卻無解回傳 -2 */
function pickCell(grid: readonly number[]): { index: number; options: number[] } | -1 | -2 {
  let best = -1
  let bestOptions: number[] = []
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] !== 0) continue
    const options = available(grid, i)
    if (options.length === 0) return -2
    if (best === -1 || options.length < bestOptions.length) {
      best = i
      bestOptions = options
      if (options.length === 1) break
    }
  }
  return best === -1 ? -1 : { index: best, options: bestOptions }
}

/** 計算解的數量（最多數到 limit 就停） */
export function countSolutions(grid: number[], limit = 2): number {
  const pick = pickCell(grid)
  if (pick === -1) return 1
  if (pick === -2) return 0
  let total = 0
  for (const d of pick.options) {
    grid[pick.index] = d
    total += countSolutions(grid, limit - total)
    grid[pick.index] = 0
    if (total >= limit) break
  }
  return total
}

/** 用隨機順序填滿整個盤面 */
function fillRandom(grid: number[], rng: Random): boolean {
  const pick = pickCell(grid)
  if (pick === -1) return true
  if (pick === -2) return false
  for (const d of rng.shuffle(pick.options)) {
    grid[pick.index] = d
    if (fillRandom(grid, rng)) return true
  }
  grid[pick.index] = 0
  return false
}

export interface Puzzle {
  /** 題目（0 代表空格） */
  puzzle: number[]
  solution: number[]
}

/** 產生一題只有唯一解的數獨 */
export function generate(level: Level, rng: Random): Puzzle {
  const solution = Array<number>(CELLS).fill(0)
  fillRandom(solution, rng)
  const puzzle = [...solution]
  let clues = CELLS
  for (const i of rng.shuffle(Array.from({ length: CELLS }, (_, k) => k))) {
    if (clues <= level.clues) break
    const keep = puzzle[i] ?? 0
    puzzle[i] = 0
    if (countSolutions([...puzzle]) === 1) clues -= 1
    else puzzle[i] = keep
  }
  return { puzzle, solution }
}

/** 找出和同一列／欄／九宮格內其他格重複的格子 */
export function findConflicts(values: readonly number[]): Set<number> {
  const conflicts = new Set<number>()
  for (let i = 0; i < CELLS; i++) {
    const v = values[i] ?? 0
    if (v === 0) continue
    for (const p of PEERS[i] ?? []) {
      if (values[p] === v) {
        conflicts.add(i)
        break
      }
    }
  }
  return conflicts
}
