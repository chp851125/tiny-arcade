import type { Random } from '../../shared/random.ts'

export interface Level {
  id: string
  label: string
  cols: number
  rows: number
  mines: number
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', label: '初級', cols: 9, rows: 9, mines: 10 },
  { id: 'medium', label: '中級', cols: 16, rows: 16, mines: 40 },
  { id: 'hard', label: '高級', cols: 30, rows: 16, mines: 99 },
  { id: 'ultimate', label: '終極', cols: 40, rows: 22, mines: 180 },
]

/** 某格周圍（最多 8 個）的格子索引 */
export function neighbors(index: number, cols: number, rows: number): number[] {
  const x = index % cols
  const y = Math.floor(index / cols)
  const result: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) result.push(ny * cols + nx)
    }
  }
  return result
}

/** 佈雷；第一次點的格子和它周圍一圈不放雷（地圖太擠時只保證那一格） */
export function placeMines(level: Level, safeIndex: number, rng: Random): boolean[] {
  const total = level.cols * level.rows
  let banned = new Set([safeIndex, ...neighbors(safeIndex, level.cols, level.rows)])
  if (total - banned.size < level.mines) banned = new Set([safeIndex])
  const candidates = Array.from({ length: total }, (_, i) => i).filter((i) => !banned.has(i))
  const mines = Array<boolean>(total).fill(false)
  for (const i of rng.shuffle(candidates).slice(0, level.mines)) mines[i] = true
  return mines
}

/** 每格周圍的地雷數 */
export function countAround(mines: readonly boolean[], cols: number, rows: number): number[] {
  return mines.map((_, i) => neighbors(i, cols, rows).filter((n) => mines[n]).length)
}

/**
 * 從某格開始翻開；數字為 0 時連鎖翻開周圍。
 * 已翻開或已插旗的格子不會被翻；回傳這次新翻開的格子。
 */
export function floodReveal(
  start: number,
  counts: readonly number[],
  revealed: readonly boolean[],
  flagged: readonly boolean[],
  cols: number,
  rows: number,
): number[] {
  const opened: number[] = []
  const seen = new Set<number>()
  const stack = [start]
  while (stack.length > 0) {
    const i = stack.pop() ?? 0
    if (seen.has(i) || revealed[i] || flagged[i]) continue
    seen.add(i)
    opened.push(i)
    if (counts[i] === 0) stack.push(...neighbors(i, cols, rows))
  }
  return opened
}
