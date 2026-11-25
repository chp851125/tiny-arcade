import type { Random } from '../../shared/random.ts'

/** # 牆、. 豆子、o 大力丸、P 小精靈起點、G 鬼屋、- 鬼屋的門 */
export const MAZE: readonly string[] = [
  '#####################',
  '#.........#.........#',
  '#o###.###.#.###.###o#',
  '#...................#',
  '#.###.#.#####.#.###.#',
  '#.....#...#...#.....#',
  '#####.###.#.###.#####',
  '#####.#.......#.#####',
  '#####.#.##-##.#.#####',
  '......#.#GGG#.#......',
  '#####.#.#####.#.#####',
  '#####.#.......#.#####',
  '#####.###.#.###.#####',
  '#.........#.........#',
  '#.###.###.#.###.###.#',
  '#o..#.....P.....#..o#',
  '###.#.#.#####.#.#.###',
  '#.....#...#...#.....#',
  '#.#######.#.#######.#',
  '#...................#',
  '#####################',
]

export const COLS = MAZE[0]?.length ?? 0
export const ROWS = MAZE.length

/** 方向：0 上、1 左、2 下、3 右 */
export type Dir = 0 | 1 | 2 | 3
export const DX = [0, -1, 0, 1] as const
export const DY = [-1, 0, 1, 0] as const
const OPPOSITE: readonly Dir[] = [2, 3, 0, 1]
const DIRS: readonly Dir[] = [0, 1, 2, 3]

/** 鬼出了門之後第一個格子，以及鬼屋中央 */
const EXIT = { x: 10, y: 7 }
const HOUSE = { x: 10, y: 9 }
const SCATTER = [
  { x: 19, y: 0 },
  { x: 1, y: 0 },
  { x: 19, y: 20 },
  { x: 1, y: 20 },
]
const HOUSE_START = [
  { x: 10, y: 7 },
  { x: 10, y: 9 },
  { x: 9, y: 9 },
  { x: 11, y: 9 },
]
/** 各隻鬼離開鬼屋的等待秒數 */
const RELEASE = [0, 2, 6, 10]
/** 散開／追擊交替的時間表（秒）；最後一段一直追擊 */
const PHASES = [7, 20, 7, 20, 5, 20, 5, Infinity]

export const GHOST_COLORS = ['#ff4d4d', '#ff7ab8', '#3fd0d0', '#ff9a3c']

const PAC_SPEED = 6.6
const EAT_SPEED = 13
const LEAVE_SPEED = 4
const READY_TIME = 2
const DEATH_TIME = 1.6
const CLEAR_TIME = 2
const PELLET_POINTS = 50
const DOT_POINTS = 10
const START_LIVES = 3

export interface Mover {
  /** 目前所在（或剛離開）的格子 */
  x: number
  y: number
  dir: Dir | -1
  /** 往 dir 方向走到下一格的進度，0~1 */
  prog: number
}

export type GhostMode = 'house' | 'leaving' | 'active' | 'eaten'

export interface Ghost extends Mover {
  id: number
  mode: GhostMode
  frightened: boolean
  /** 下次到格子時要掉頭 */
  reverse: boolean
  releaseTimer: number
}

export interface State {
  /** 0 空、1 豆子、2 大力丸 */
  food: number[]
  dotsLeft: number
  pac: Mover & { want: Dir | -1 }
  ghosts: Ghost[]
  score: number
  lives: number
  level: number
  /** 準備開始的倒數、死亡動畫倒數、過關倒數 */
  ready: number
  dying: number
  clearing: number
  /** 驚嚇狀態剩餘秒數與連吃鬼的次數 */
  frightened: number
  chain: number
  phaseIndex: number
  phaseTimer: number
  gameOver: boolean
}

export type PacEvent = 'dot' | 'pellet' | 'ghost' | 'death' | 'clear' | 'gameover' | 'ready'

const cellAt = (x: number, y: number): string => MAZE[y]?.[x] ?? '#'

/** 鄰格（含左右穿越隧道）；超出上下界回傳 null */
function neighbor(x: number, y: number, d: Dir): { x: number; y: number } | null {
  let nx = x + DX[d]
  const ny = y + DY[d]
  if (ny < 0 || ny >= ROWS) return null
  if (nx < 0) nx = COLS - 1
  if (nx >= COLS) nx = 0
  return { x: nx, y: ny }
}

const isWall = (c: string): boolean => c === '#'
/** 小精靈與一般狀態的鬼可以走的格子 */
const openForActive = (x: number, y: number): boolean => {
  const c = cellAt(x, y)
  return !isWall(c) && c !== 'G' && c !== '-'
}
/** 離開或返回鬼屋的鬼還可以走鬼屋與門 */
const openForGhostHome = (x: number, y: number): boolean => !isWall(cellAt(x, y))

/** 從某目標往外廣度搜尋的步數表（鬼回家與出門時用） */
function distanceMap(tx: number, ty: number): number[] {
  const dist = Array<number>(COLS * ROWS).fill(-1)
  dist[ty * COLS + tx] = 0
  const queue = [{ x: tx, y: ty }]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as { x: number; y: number }
    for (const d of DIRS) {
      const n = neighbor(cur.x, cur.y, d)
      if (!n || !openForGhostHome(n.x, n.y) || dist[n.y * COLS + n.x] !== -1) continue
      dist[n.y * COLS + n.x] = (dist[cur.y * COLS + cur.x] as number) + 1
      queue.push(n)
    }
  }
  return dist
}
const TO_EXIT = distanceMap(EXIT.x, EXIT.y)
const TO_HOUSE = distanceMap(HOUSE.x, HOUSE.y)

function buildFood(): { food: number[]; dots: number } {
  let dots = 0
  const food = Array<number>(COLS * ROWS).fill(0)
  MAZE.forEach((row, y) => {
    for (let x = 0; x < COLS; x++) {
      const c = row[x]
      if (c === '.') food[y * COLS + x] = 1
      if (c === 'o') food[y * COLS + x] = 2
      if (c === '.' || c === 'o') dots++
    }
  })
  return { food, dots }
}

const pacStart = (() => {
  for (let y = 0; y < ROWS; y++) {
    const x = MAZE[y]?.indexOf('P') ?? -1
    if (x >= 0) return { x, y }
  }
  return { x: 10, y: 15 }
})()

function resetActors(s: State): void {
  s.pac = { x: pacStart.x, y: pacStart.y, dir: -1, prog: 0, want: -1 }
  s.ghosts = HOUSE_START.map((p, id) => ({
    id,
    x: p.x,
    y: p.y,
    dir: id === 0 ? 1 : -1,
    prog: 0,
    mode: id === 0 ? 'active' : 'house',
    frightened: false,
    reverse: false,
    releaseTimer: (RELEASE[id] as number) / (1 + 0.1 * (s.level - 1)),
  }))
  s.frightened = 0
  s.chain = 0
  s.phaseIndex = 0
  s.phaseTimer = PHASES[0] as number
  s.ready = READY_TIME
}

export function createState(): State {
  const { food, dots } = buildFood()
  const s = {
    food,
    dotsLeft: dots,
    score: 0,
    lives: START_LIVES,
    level: 1,
    dying: 0,
    clearing: 0,
    gameOver: false,
  } as State
  resetActors(s)
  return s
}

const pacSpeed = (): number => PAC_SPEED
const ghostSpeed = (level: number): number => Math.min(PAC_SPEED * 1.02, 5.7 + 0.3 * (level - 1))
const frightenedTime = (level: number): number => Math.max(2.5, 8 - (level - 1) * 1.2)

export const posOf = (m: Mover): { x: number; y: number } => {
  if (m.dir === -1) return { x: m.x, y: m.y }
  let x = m.x + DX[m.dir] * m.prog
  // 穿越隧道時，位置在畫面兩側循環
  if (x < -0.5) x += COLS
  if (x > COLS - 0.5) x -= COLS
  return { x, y: m.y + DY[m.dir] * m.prog }
}

const scatterMode = (s: State): boolean => s.phaseIndex % 2 === 0

function ghostTarget(s: State, g: Ghost): { x: number; y: number } {
  if (scatterMode(s)) return SCATTER[g.id] as { x: number; y: number }
  const p = s.pac
  const pd = p.dir === -1 ? 1 : p.dir
  const ahead = (n: number): { x: number; y: number } => ({
    x: p.x + DX[pd] * n,
    y: p.y + DY[pd] * n,
  })
  if (g.id === 0) return { x: p.x, y: p.y }
  if (g.id === 1) return ahead(4)
  if (g.id === 2) {
    const a = ahead(2)
    const b = s.ghosts[0] as Ghost
    return { x: a.x * 2 - b.x, y: a.y * 2 - b.y }
  }
  const far = Math.hypot(g.x - p.x, g.y - p.y) > 8
  return far ? { x: p.x, y: p.y } : (SCATTER[3] as { x: number; y: number })
}

/** 鬼在格子上決定下一步的方向 */
function chooseGhostDir(s: State, g: Ghost, rng: Random): Dir {
  const from = g.dir === -1 ? 1 : g.dir
  if (g.mode === 'leaving' || g.mode === 'eaten') {
    const map = g.mode === 'leaving' ? TO_EXIT : TO_HOUSE
    let best: Dir = from
    let bestD = Infinity
    for (const d of DIRS) {
      const n = neighbor(g.x, g.y, d)
      if (!n || !openForGhostHome(n.x, n.y)) continue
      const dist = map[n.y * COLS + n.x] as number
      if (dist >= 0 && dist < bestD) {
        bestD = dist
        best = d
      }
    }
    return best
  }
  const options = DIRS.filter((d) => {
    const n = neighbor(g.x, g.y, d)
    return n !== null && openForActive(n.x, n.y) && d !== OPPOSITE[from]
  })
  if (g.reverse) {
    g.reverse = false
    const back = OPPOSITE[from] as Dir
    const n = neighbor(g.x, g.y, back)
    if (n && openForActive(n.x, n.y)) return back
  }
  if (options.length === 0) return OPPOSITE[from] as Dir
  if (g.frightened) return rng.pick(options)
  const t = ghostTarget(s, g)
  let best = options[0] as Dir
  let bestD = Infinity
  for (const d of options) {
    const n = neighbor(g.x, g.y, d) as { x: number; y: number }
    const dist = (n.x - t.x) ** 2 + (n.y - t.y) ** 2
    if (dist < bestD) {
      bestD = dist
      best = d
    }
  }
  return best
}

function speedOf(s: State, g: Ghost): number {
  if (g.mode === 'eaten') return EAT_SPEED
  if (g.mode === 'leaving') return LEAVE_SPEED
  if (g.frightened) return 3.6
  return ghostSpeed(s.level)
}

function moveGhost(s: State, g: Ghost, dt: number, rng: Random): void {
  if (g.mode === 'house') {
    g.releaseTimer -= dt
    if (g.releaseTimer <= 0) {
      g.mode = 'leaving'
      g.dir = chooseGhostDir(s, g, rng)
      g.prog = 0
    }
    return
  }
  if (g.dir === -1) g.dir = chooseGhostDir(s, g, rng)
  g.prog += speedOf(s, g) * dt
  while (g.prog >= 1) {
    g.prog -= 1
    const n = neighbor(g.x, g.y, g.dir as Dir)
    if (n) {
      g.x = n.x
      g.y = n.y
    }
    if (g.mode === 'leaving' && g.x === EXIT.x && g.y === EXIT.y) {
      g.mode = 'active'
      g.frightened = s.frightened > 0
      g.dir = rng.next() < 0.5 ? 1 : 3
      continue
    }
    if (g.mode === 'eaten' && g.x === HOUSE.x && g.y === HOUSE.y) {
      g.mode = 'leaving'
      g.frightened = false
    }
    g.dir = chooseGhostDir(s, g, rng)
  }
}

function movePac(s: State, dt: number, events: PacEvent[]): void {
  const p = s.pac
  const canGo = (d: Dir): boolean => {
    const n = neighbor(p.x, p.y, d)
    return n !== null && openForActive(n.x, n.y)
  }
  // 半路可以直接掉頭
  if (p.dir !== -1 && p.want !== -1 && p.want === OPPOSITE[p.dir] && p.prog > 0) {
    const n = neighbor(p.x, p.y, p.dir)
    if (n) {
      p.x = n.x
      p.y = n.y
    }
    p.dir = p.want
    p.prog = 1 - p.prog
  }
  if (p.dir === -1 && p.want !== -1 && canGo(p.want)) {
    p.dir = p.want
    p.prog = 0
  }
  if (p.dir === -1) return
  p.prog += pacSpeed() * dt
  while (p.prog >= 1 && p.dir !== -1) {
    p.prog -= 1
    const n = neighbor(p.x, p.y, p.dir)
    if (n) {
      p.x = n.x
      p.y = n.y
    }
    eatAt(s, p.x, p.y, events)
    if (p.want !== -1 && canGo(p.want)) p.dir = p.want
    else if (!canGo(p.dir)) {
      p.dir = -1
      p.prog = 0
    }
  }
}

function eatAt(s: State, x: number, y: number, events: PacEvent[]): void {
  const i = y * COLS + x
  const f = s.food[i]
  if (!f) return
  s.food[i] = 0
  s.dotsLeft -= 1
  if (f === 1) {
    s.score += DOT_POINTS
    events.push('dot')
  } else {
    s.score += PELLET_POINTS
    events.push('pellet')
    s.frightened = frightenedTime(s.level)
    s.chain = 0
    for (const g of s.ghosts) {
      if (g.mode === 'active' || g.mode === 'leaving') {
        g.frightened = true
        if (g.mode === 'active') g.reverse = true
      }
    }
  }
}

export function update(s: State, dt: number, want: Dir | -1, rng: Random): PacEvent[] {
  const events: PacEvent[] = []
  if (s.gameOver) return events
  if (want !== -1) s.pac.want = want

  if (s.dying > 0) {
    s.dying -= dt
    if (s.dying <= 0) {
      s.lives -= 1
      if (s.lives <= 0) {
        s.gameOver = true
        events.push('gameover')
      } else {
        resetActors(s)
        events.push('ready')
      }
    }
    return events
  }
  if (s.clearing > 0) {
    s.clearing -= dt
    if (s.clearing <= 0) {
      const { food, dots } = buildFood()
      s.food = food
      s.dotsLeft = dots
      s.level += 1
      resetActors(s)
      events.push('ready')
    }
    return events
  }
  if (s.ready > 0) {
    s.ready -= dt
    return events
  }

  // 散開／追擊的輪替（驚嚇期間先暫停計時）
  if (s.frightened > 0) {
    s.frightened -= dt
    if (s.frightened <= 0) {
      s.frightened = 0
      for (const g of s.ghosts) g.frightened = false
    }
  } else {
    s.phaseTimer -= dt
    if (s.phaseTimer <= 0 && s.phaseIndex < PHASES.length - 1) {
      s.phaseIndex += 1
      s.phaseTimer = PHASES[s.phaseIndex] as number
      for (const g of s.ghosts) if (g.mode === 'active') g.reverse = true
    }
  }

  movePac(s, dt, events)
  for (const g of s.ghosts) moveGhost(s, g, dt, rng)

  // 碰撞
  const pp = posOf(s.pac)
  for (const g of s.ghosts) {
    if (g.mode === 'house' || g.mode === 'eaten') continue
    const gp = posOf(g)
    if (Math.hypot(gp.x - pp.x, gp.y - pp.y) > 0.6) continue
    if (g.frightened) {
      g.mode = 'eaten'
      g.frightened = false
      s.chain += 1
      s.score += 100 * 2 ** s.chain
      events.push('ghost')
    } else {
      s.dying = DEATH_TIME
      events.push('death')
      return events
    }
  }

  if (s.dotsLeft === 0) {
    s.clearing = CLEAR_TIME
    events.push('clear')
  }
  return events
}
