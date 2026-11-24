export type Direction = 'up' | 'down' | 'left' | 'right'

export const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

/**
 * 關卡文字：# 牆、空白 地板、. 目標、$ 箱子、@ 玩家、* 目標上的箱子、+ 目標上的玩家
 */
export interface Level {
  name: string
  /** 程式算出的最少步數與最少推箱次數（兩者通常不是同一種解法） */
  best: { moves: number; pushes: number }
  rows: readonly string[]
}

export interface State {
  width: number
  height: number
  walls: boolean[]
  goals: boolean[]
  /** 地板（含目標）；牆外面的空白不算，用來只畫出房間 */
  floor: boolean[]
  boxes: number[]
  player: number
  moves: number
  pushes: number
}

export function parseLevel(level: Level): State {
  const height = level.rows.length
  const width = Math.max(...level.rows.map((r) => r.length))
  const size = width * height
  const walls = Array<boolean>(size).fill(false)
  const goals = Array<boolean>(size).fill(false)
  const boxes: number[] = []
  let player = 0
  level.rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const c = row[x] ?? ' '
      const i = y * width + x
      if (c === '#') walls[i] = true
      if (c === '.' || c === '*' || c === '+') goals[i] = true
      if (c === '$' || c === '*') boxes.push(i)
      if (c === '@' || c === '+') player = i
    }
  })
  // 從玩家出發能走到的格子才算房間內部（牆外的空白不畫）
  const floor = Array<boolean>(size).fill(false)
  const stack = [player]
  floor[player] = true
  while (stack.length > 0) {
    const i = stack.pop() ?? 0
    const x = i % width
    const y = Math.floor(i / width)
    for (const { dx, dy } of Object.values(DELTAS)) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = ny * width + nx
      if (!walls[n] && !floor[n]) {
        floor[n] = true
        stack.push(n)
      }
    }
  }
  return { width, height, walls, goals, floor, boxes, player, moves: 0, pushes: 0 }
}

export function cloneState(s: State): State {
  return { ...s, boxes: [...s.boxes] }
}

/** 往某方向走一步（必要時推箱子）；回傳是否有移動，以及是否推了箱子 */
export function step(s: State, dir: Direction): { moved: boolean; pushed: boolean } {
  const { dx, dy } = DELTAS[dir]
  const x = (s.player % s.width) + dx
  const y = Math.floor(s.player / s.width) + dy
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return { moved: false, pushed: false }
  const target = y * s.width + x
  if (s.walls[target]) return { moved: false, pushed: false }
  const boxIndex = s.boxes.indexOf(target)
  if (boxIndex >= 0) {
    const bx = x + dx
    const by = y + dy
    if (bx < 0 || by < 0 || bx >= s.width || by >= s.height) return { moved: false, pushed: false }
    const beyond = by * s.width + bx
    if (s.walls[beyond] || s.boxes.includes(beyond)) return { moved: false, pushed: false }
    s.boxes[boxIndex] = beyond
    s.player = target
    s.moves += 1
    s.pushes += 1
    return { moved: true, pushed: true }
  }
  s.player = target
  s.moves += 1
  return { moved: true, pushed: false }
}

export function isSolved(s: State): boolean {
  return s.boxes.every((b) => s.goals[b])
}
