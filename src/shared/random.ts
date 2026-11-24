/** 可指定 seed 的亂數產生器（mulberry32） */
export interface Random {
  /** 回傳 [0, 1) 的浮點數 */
  next: () => number
  /** 回傳 [min, max] 的整數（含兩端） */
  int: (min: number, max: number) => number
  /** 從陣列隨機挑一個；空陣列會拋錯 */
  pick: <T>(items: readonly T[]) => T
  /** 回傳洗牌後的新陣列，不改動原陣列 */
  shuffle: <T>(items: readonly T[]) => T[]
}

/** 建立亂數產生器；不給 seed 時用時間與 Math.random 當種子 */
export function createRandom(seed?: number): Random {
  let state = (seed ?? Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(Math.min(min, max))
    const hi = Math.floor(Math.max(min, max))
    return lo + Math.floor(next() * (hi - lo + 1))
  }

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('pick: 陣列不能是空的')
    return items[int(0, items.length - 1)] as T
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(0, i)
      const tmp = result[i] as T
      result[i] = result[j] as T
      result[j] = tmp
    }
    return result
  }

  return { next, int, pick, shuffle }
}
