import type { Random } from '../../shared/random.ts'

export const SIZE = 4

export type Direction = 'up' | 'down' | 'left' | 'right'

/** 棋盤以 16 格的陣列表示，0 代表空格 */
export type Board = readonly number[]

export function emptyBoard(): number[] {
  return Array<number>(SIZE * SIZE).fill(0)
}

/** 把一行往前推並合併相同數字；每個數字每次只能合併一次 */
function slideLine(line: readonly number[]): { line: number[]; gained: number } {
  const tiles = line.filter((v) => v !== 0)
  const result: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    const v = tiles[i] ?? 0
    if (v === tiles[i + 1]) {
      result.push(v * 2)
      gained += v * 2
      i += 1
    } else {
      result.push(v)
    }
  }
  while (result.length < SIZE) result.push(0)
  return { line: result, gained }
}

/** 取得某方向每一行的格子索引，順序為「推向的那一端」在前 */
function lineIndexes(dir: Direction): number[][] {
  const lines: number[][] = []
  for (let a = 0; a < SIZE; a++) {
    const line: number[] = []
    for (let b = 0; b < SIZE; b++) {
      if (dir === 'left') line.push(a * SIZE + b)
      else if (dir === 'right') line.push(a * SIZE + (SIZE - 1 - b))
      else if (dir === 'up') line.push(b * SIZE + a)
      else line.push((SIZE - 1 - b) * SIZE + a)
    }
    lines.push(line)
  }
  return lines
}

export interface MoveResult {
  board: number[]
  gained: number
  moved: boolean
}

export function move(board: Board, dir: Direction): MoveResult {
  const next = [...board]
  let gained = 0
  for (const indexes of lineIndexes(dir)) {
    const slid = slideLine(indexes.map((i) => board[i] ?? 0))
    gained += slid.gained
    indexes.forEach((boardIndex, k) => {
      next[boardIndex] = slid.line[k] ?? 0
    })
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) }
}

/** 在隨機空格放入 2（90%）或 4（10%）；沒有空格時回傳 -1 */
export function spawn(board: number[], rng: Random): number {
  const empties = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)
  if (empties.length === 0) return -1
  const index = rng.pick(empties)
  board[index] = rng.next() < 0.9 ? 2 : 4
  return index
}

export function canMove(board: Board): boolean {
  return (['up', 'down', 'left', 'right'] as const).some((d) => move(board, d).moved)
}
