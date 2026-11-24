import type { Random } from '../../shared/random.ts'

export const SIZE = 8

export interface Level {
  id: string
  label: string
  /** 寶石種類數；越多越難湊 */
  types: number
}

export const LEVELS: readonly Level[] = [
  { id: 'easy', label: '簡單', types: 5 },
  { id: 'normal', label: '普通', types: 6 },
  { id: 'hard', label: '困難', types: 7 },
]

export interface Tile {
  id: number
  /** 寶石種類，從 0 開始 */
  type: number
}

export type Board = (Tile | null)[]

let nextId = 1
export function createTile(type: number): Tile {
  return { id: nextId++, type }
}

const typeAt = (b: readonly (Tile | null)[], x: number, y: number): number =>
  x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : (b[y * SIZE + x]?.type ?? -1)

/** 找出所有連成三顆以上（橫或直）的格子 */
export function findMatches(b: readonly (Tile | null)[]): Set<number> {
  const result = new Set<number>()
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = typeAt(b, x, y)
      if (t < 0) continue
      if (typeAt(b, x + 1, y) === t && typeAt(b, x + 2, y) === t) {
        for (let k = 0; k < 3; k++) result.add(y * SIZE + x + k)
      }
      if (typeAt(b, x, y + 1) === t && typeAt(b, x, y + 2) === t) {
        for (let k = 0; k < 3; k++) result.add((y + k) * SIZE + x)
      }
    }
  }
  return result
}

/** 交換兩格（原地修改） */
export function swapCells(b: Board, i: number, j: number): void {
  const t = b[i] ?? null
  b[i] = b[j] ?? null
  b[j] = t
}

export function areAdjacent(i: number, j: number): boolean {
  const dx = Math.abs((i % SIZE) - (j % SIZE))
  const dy = Math.abs(Math.floor(i / SIZE) - Math.floor(j / SIZE))
  return dx + dy === 1
}

/** 找一個交換後能湊成三顆的走法；沒有則回傳 null */
export function findMove(b: Board): [number, number] | null {
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (const j of [i + 1, i + SIZE]) {
      if (j >= SIZE * SIZE || (j === i + 1 && (i + 1) % SIZE === 0)) continue
      swapCells(b, i, j)
      const ok = findMatches(b).size > 0
      swapCells(b, i, j)
      if (ok) return [i, j]
    }
  }
  return null
}

/** 產生一個一開始沒有現成連線、且至少有一個走法的盤面 */
export function createBoard(level: Level, rng: Random): Board {
  for (;;) {
    const b: Board = Array<Tile | null>(SIZE * SIZE).fill(null)
    for (let i = 0; i < b.length; i++) {
      const x = i % SIZE
      const y = Math.floor(i / SIZE)
      const banned = new Set<number>()
      if (typeAt(b, x - 1, y) >= 0 && typeAt(b, x - 1, y) === typeAt(b, x - 2, y)) {
        banned.add(typeAt(b, x - 1, y))
      }
      if (typeAt(b, x, y - 1) >= 0 && typeAt(b, x, y - 1) === typeAt(b, x, y - 2)) {
        banned.add(typeAt(b, x, y - 1))
      }
      const options = Array.from({ length: level.types }, (_, t) => t).filter((t) => !banned.has(t))
      b[i] = createTile(rng.pick(options))
    }
    if (findMove(b)) return b
  }
}

export interface Fall {
  tile: Tile
  /** 落下前的列（新補的寶石為負數，代表在盤面上方） */
  fromY: number
  toX: number
  toY: number
  isNew: boolean
}

/** 讓寶石往下掉並補上新的；回傳每顆寶石的移動，供動畫使用 */
export function collapse(b: Board, level: Level, rng: Random): Fall[] {
  const falls: Fall[] = []
  for (let x = 0; x < SIZE; x++) {
    const column: { tile: Tile; fromY: number }[] = []
    for (let y = SIZE - 1; y >= 0; y--) {
      const tile = b[y * SIZE + x]
      if (tile) column.push({ tile, fromY: y })
    }
    const missing = SIZE - column.length
    for (let y = 0; y < SIZE; y++) b[y * SIZE + x] = null
    column.forEach((c, k) => {
      const toY = SIZE - 1 - k
      b[toY * SIZE + x] = c.tile
      if (toY !== c.fromY) falls.push({ tile: c.tile, fromY: c.fromY, toX: x, toY, isNew: false })
    })
    for (let k = 0; k < missing; k++) {
      const toY = missing - 1 - k
      const tile = createTile(rng.int(0, level.types - 1))
      b[toY * SIZE + x] = tile
      falls.push({ tile, fromY: toY - missing, toX: x, toY, isNew: true })
    }
  }
  return falls
}

/** 把現有寶石的位置重新洗牌，直到沒有現成連線且有走法 */
export function reshuffle(b: Board, rng: Random): void {
  const tiles = b.filter((t): t is Tile => t !== null)
  for (let attempt = 0; attempt < 200; attempt++) {
    const mixed = rng.shuffle(tiles)
    mixed.forEach((t, i) => {
      b[i] = t
    })
    if (findMatches(b).size === 0 && findMove(b)) return
  }
}
