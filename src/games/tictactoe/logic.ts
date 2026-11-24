import type { Random } from '../../shared/random.ts'

export type Mark = 'X' | 'O'
export type Cell = Mark | null

/** 八條連線（以格子索引 0~8 表示） */
const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export interface Win {
  mark: Mark
  line: readonly number[]
}

/** 找出已連成一線的勝者；沒有則回傳 null */
export function findWin(board: readonly Cell[]): Win | null {
  for (const line of LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark && mark === board[b] && mark === board[c]) return { mark, line }
  }
  return null
}

export function isFull(board: readonly Cell[]): boolean {
  return board.every((cell) => cell !== null)
}

/** 找出某方一步就能連線的空格；沒有則回傳 -1 */
function findWinningMove(board: readonly Cell[], mark: Mark): number {
  for (const line of LINES) {
    const cells = line.map((i) => board[i])
    const empties = line.filter((i) => board[i] === null)
    if (empties.length === 1 && cells.filter((c) => c === mark).length === 2) {
      return empties[0] ?? -1
    }
  }
  return -1
}

/** 電腦的下法：能贏就贏、要輸就擋、佔中間、佔角、最後隨便下 */
export function chooseCpuMove(board: readonly Cell[], cpu: Mark, rng: Random): number {
  const human: Mark = cpu === 'X' ? 'O' : 'X'
  const win = findWinningMove(board, cpu)
  if (win >= 0) return win
  const block = findWinningMove(board, human)
  if (block >= 0) return block
  if (board[4] === null) return 4
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null)
  if (corners.length > 0) return rng.pick(corners)
  const rest = board.map((_, i) => i).filter((i) => board[i] === null)
  return rng.pick(rest)
}
