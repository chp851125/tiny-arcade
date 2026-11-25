import type { Random } from '../../shared/random.ts'

export const COLS = 33
export const ROWS = 20
export const FINAL_FLOOR = 8
const FOV_RADIUS = 8

export const WALL = 0
export const FLOOR = 1
export const STAIRS = 2

export type MonsterType = 'rat' | 'bat' | 'goblin' | 'skeleton' | 'ogre' | 'boss'

export interface MonsterSpec {
  name: string
  hp: number
  atk: number
  xp: number
  color: string
  glyph: string
}

export const MONSTERS: Record<MonsterType, MonsterSpec> = {
  rat: { name: '老鼠', hp: 6, atk: 2, xp: 3, color: '#a0673a', glyph: '鼠' },
  bat: { name: '蝙蝠', hp: 5, atk: 2, xp: 3, color: '#b36bff', glyph: '蝠' },
  goblin: { name: '哥布林', hp: 13, atk: 4, xp: 7, color: '#2fb67c', glyph: '哥' },
  skeleton: { name: '骷髏', hp: 20, atk: 5, xp: 11, color: '#e8e0c8', glyph: '骷' },
  ogre: { name: '食人魔', hp: 36, atk: 8, xp: 22, color: '#ff9a3c', glyph: '魔' },
  boss: { name: '巨龍', hp: 90, atk: 11, xp: 100, color: '#ff4d4d', glyph: '龍' },
}

export type ItemType = 'potion' | 'scroll' | 'sword' | 'shield' | 'heart'

export const ITEM_NAMES: Record<ItemType, string> = {
  potion: '治療藥水',
  scroll: '炸彈卷軸',
  sword: '鋒利的劍',
  shield: '堅固的盾',
  heart: '生命水晶',
}

export interface Monster {
  id: number
  type: MonsterType
  x: number
  y: number
  hp: number
  /** 看到過玩家，之後會一直追 */
  alerted: boolean
}

export interface Item {
  type: ItemType
  x: number
  y: number
}

export interface Player {
  x: number
  y: number
  hp: number
  maxHp: number
  atk: number
  def: number
  level: number
  xp: number
}

export interface State {
  floor: number
  tiles: number[]
  visible: boolean[]
  explored: boolean[]
  player: Player
  monsters: Monster[]
  items: Item[]
  potions: number
  scrolls: number
  turn: number
  kills: number
  messages: string[]
  dead: boolean
  won: boolean
  nextId: number
  /** 自然回血計數 */
  regen: number
  killedBy: string
}

export type RogueEvent =
  'hit' | 'kill' | 'hurt' | 'pickup' | 'stairs' | 'levelup' | 'heal' | 'bomb' | 'death' | 'win'

const idx = (x: number, y: number): number => y * COLS + x
const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < COLS && y < ROWS

export const isFloor = (s: State, x: number, y: number): boolean =>
  inBounds(x, y) && s.tiles[idx(x, y)] !== WALL

function log(s: State, msg: string): void {
  s.messages.push(msg)
  if (s.messages.length > 60) s.messages.shift()
}

interface Room {
  x: number
  y: number
  w: number
  h: number
}

const center = (r: Room): { x: number; y: number } => ({
  x: Math.floor(r.x + r.w / 2),
  y: Math.floor(r.y + r.h / 2),
})

function carveCorridor(
  tiles: number[],
  a: { x: number; y: number },
  b: { x: number; y: number },
  rng: Random,
): void {
  let { x, y } = a
  const horizontalFirst = rng.next() < 0.5
  const hStep = (): void => {
    while (x !== b.x) {
      x += Math.sign(b.x - x)
      tiles[idx(x, y)] = FLOOR
    }
  }
  const vStep = (): void => {
    while (y !== b.y) {
      y += Math.sign(b.y - y)
      tiles[idx(x, y)] = FLOOR
    }
  }
  if (horizontalFirst) {
    hStep()
    vStep()
  } else {
    vStep()
    hStep()
  }
}

/** 隨機產生一層地城：幾間房間用走廊依序連起來 */
function generateTiles(rng: Random): { tiles: number[]; rooms: Room[] } {
  const tiles = Array<number>(COLS * ROWS).fill(WALL)
  const rooms: Room[] = []
  for (let attempt = 0; attempt < 120 && rooms.length < 9; attempt++) {
    const w = rng.int(4, 9)
    const h = rng.int(3, 5)
    const x = rng.int(1, COLS - w - 2)
    const y = rng.int(1, ROWS - h - 2)
    const room = { x, y, w, h }
    // 房間之間至少留一格牆
    if (
      rooms.some(
        (r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y,
      )
    )
      continue
    rooms.push(room)
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) tiles[idx(xx, yy)] = FLOOR
  }
  for (let i = 1; i < rooms.length; i++)
    carveCorridor(tiles, center(rooms[i - 1] as Room), center(rooms[i] as Room), rng)
  return { tiles, rooms }
}

function monsterPool(floor: number): MonsterType[] {
  const pool: MonsterType[] = []
  if (floor <= 3) pool.push('rat', 'rat', 'bat')
  if (floor >= 2 && floor <= 5) pool.push('goblin', 'goblin')
  if (floor >= 3) pool.push('skeleton')
  if (floor >= 5) pool.push('ogre')
  if (floor >= 4) pool.push('goblin')
  return pool
}

function newFloor(s: State, rng: Random): void {
  const { tiles, rooms } = generateTiles(rng)
  s.tiles = tiles
  s.monsters = []
  s.items = []
  s.visible = Array<boolean>(COLS * ROWS).fill(false)
  s.explored = Array<boolean>(COLS * ROWS).fill(false)

  const first = center(rooms[0] as Room)
  s.player.x = first.x
  s.player.y = first.y
  const last = center(rooms[rooms.length - 1] as Room)
  if (s.floor < FINAL_FLOOR) tiles[idx(last.x, last.y)] = STAIRS

  const occupied = new Set<number>([idx(first.x, first.y), idx(last.x, last.y)])
  const freeCell = (room: Room): { x: number; y: number } | null => {
    for (let t = 0; t < 30; t++) {
      const x = rng.int(room.x, room.x + room.w - 1)
      const y = rng.int(room.y, room.y + room.h - 1)
      if (!occupied.has(idx(x, y))) {
        occupied.add(idx(x, y))
        return { x, y }
      }
    }
    return null
  }

  const count = Math.min(10, 3 + s.floor)
  const pool = monsterPool(s.floor)
  for (let i = 0; i < count; i++) {
    const room = rooms[rng.int(1, rooms.length - 1)] as Room
    const p = freeCell(room)
    if (!p) continue
    const type = pool.length > 0 ? rng.pick(pool) : 'goblin'
    s.monsters.push({ id: s.nextId++, type, x: p.x, y: p.y, hp: MONSTERS[type].hp, alerted: false })
  }
  if (s.floor === FINAL_FLOOR) {
    const p = freeCell(rooms[rooms.length - 1] as Room)
    if (p)
      s.monsters.push({
        id: s.nextId++,
        type: 'boss',
        x: p.x,
        y: p.y,
        hp: MONSTERS.boss.hp,
        alerted: false,
      })
  }

  const itemCount = 3 + rng.int(0, 2)
  for (let i = 0; i < itemCount; i++) {
    const room = rooms[rng.int(0, rooms.length - 1)] as Room
    const p = freeCell(room)
    if (!p) continue
    const r = rng.next()
    const type: ItemType =
      r < 0.42 ? 'potion' : r < 0.64 ? 'scroll' : r < 0.78 ? 'sword' : r < 0.92 ? 'shield' : 'heart'
    s.items.push({ type, x: p.x, y: p.y })
  }
  computeFov(s)
}

export function createState(rng: Random): State {
  const s: State = {
    floor: 1,
    tiles: [],
    visible: [],
    explored: [],
    player: { x: 0, y: 0, hp: 30, maxHp: 30, atk: 4, def: 0, level: 1, xp: 0 },
    monsters: [],
    items: [],
    potions: 1,
    scrolls: 0,
    turn: 0,
    kills: 0,
    messages: [],
    dead: false,
    won: false,
    nextId: 1,
    regen: 0,
    killedBy: '',
  }
  newFloor(s, rng)
  log(s, '你走進了地城。找到樓梯往下走，一共 8 層。')
  return s
}

/** 視野：用直線檢查，半徑內沒被牆擋住的格子看得到 */
export function computeFov(s: State): void {
  s.visible.fill(false)
  const { x: px, y: py } = s.player
  for (let y = py - FOV_RADIUS; y <= py + FOV_RADIUS; y++) {
    for (let x = px - FOV_RADIUS; x <= px + FOV_RADIUS; x++) {
      if (!inBounds(x, y) || (x - px) ** 2 + (y - py) ** 2 > FOV_RADIUS * FOV_RADIUS) continue
      if (hasLine(s, px, py, x, y)) {
        s.visible[idx(x, y)] = true
        s.explored[idx(x, y)] = true
      }
    }
  }
}

function hasLine(s: State, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  while (x !== x1 || y !== y1) {
    // 途中遇到牆就擋住（終點本身是牆沒關係，牆面看得到）
    if (!(x === x0 && y === y0) && s.tiles[idx(x, y)] === WALL) return false
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return true
}

const monsterAt = (s: State, x: number, y: number): Monster | undefined =>
  s.monsters.find((m) => m.x === x && m.y === y)

function xpToNext(level: number): number {
  return 10 + (level - 1) * 12
}

function gainXp(s: State, amount: number, events: RogueEvent[]): void {
  const p = s.player
  p.xp += amount
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level)
    p.level += 1
    p.maxHp += 6
    p.atk += 1
    p.hp = Math.min(p.maxHp, p.hp + 10)
    events.push('levelup')
    log(s, `升到 ${p.level} 級了！生命上限 +6、攻擊 +1。`)
  }
}

function playerAttack(s: State, m: Monster, rng: Random, events: RogueEvent[]): void {
  const spec = MONSTERS[m.type]
  const dmg = Math.max(1, s.player.atk + rng.int(-1, 1))
  m.hp -= dmg
  events.push('hit')
  if (m.hp > 0) {
    log(s, `你攻擊${spec.name}，造成 ${dmg} 點傷害。`)
    m.alerted = true
    return
  }
  s.monsters = s.monsters.filter((x) => x !== m)
  s.kills += 1
  events.push('kill')
  log(s, `你打倒了${spec.name}！（+${spec.xp} 經驗）`)
  gainXp(s, spec.xp, events)
  if (m.type === 'boss') {
    s.won = true
    events.push('win')
    log(s, '巨龍倒下了，你征服了這座地城！')
  }
}

function pickupAt(s: State, events: RogueEvent[]): void {
  const it = s.items.find((i) => i.x === s.player.x && i.y === s.player.y)
  if (!it) return
  s.items = s.items.filter((i) => i !== it)
  events.push('pickup')
  const p = s.player
  switch (it.type) {
    case 'potion':
      s.potions += 1
      log(s, '撿到治療藥水（按 1 使用）。')
      break
    case 'scroll':
      s.scrolls += 1
      log(s, '撿到炸彈卷軸（按 2 使用）。')
      break
    case 'sword':
      p.atk += 1
      log(s, '撿到鋒利的劍，攻擊 +1。')
      break
    case 'shield':
      p.def += 1
      log(s, '撿到堅固的盾，防禦 +1。')
      break
    case 'heart':
      p.maxHp += 5
      p.hp += 5
      log(s, '撿到生命水晶，生命上限 +5。')
      break
  }
}

/** 從玩家位置往外算每格的步數，怪物沿著遞減的方向追 */
function distanceField(s: State, limit: number): Map<number, number> {
  const dist = new Map<number, number>([[idx(s.player.x, s.player.y), 0]])
  const queue = [{ x: s.player.x, y: s.player.y }]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as { x: number; y: number }
    const d = dist.get(idx(cur.x, cur.y)) as number
    if (d >= limit) continue
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = cur.x + dx
        const ny = cur.y + dy
        if (!isFloor(s, nx, ny) || dist.has(idx(nx, ny))) continue
        dist.set(idx(nx, ny), d + 1)
        queue.push({ x: nx, y: ny })
      }
    }
  }
  return dist
}

function monstersAct(s: State, rng: Random, events: RogueEvent[]): void {
  const dist = distanceField(s, 14)
  const p = s.player
  for (const m of [...s.monsters]) {
    if (s.dead) return
    const spec = MONSTERS[m.type]
    const d = Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y))
    if (!m.alerted && d <= FOV_RADIUS && s.visible[idx(m.x, m.y)]) m.alerted = true
    if (d === 1) {
      const dmg = Math.max(1, spec.atk - p.def + rng.int(-1, 1))
      p.hp -= dmg
      events.push('hurt')
      log(s, `${spec.name}攻擊你，造成 ${dmg} 點傷害。`)
      if (p.hp <= 0) {
        p.hp = 0
        s.dead = true
        s.killedBy = spec.name
        events.push('death')
        log(s, `你被${spec.name}打倒了……`)
      }
      continue
    }
    if (!m.alerted) continue
    let nx = m.x
    let ny = m.y
    if (m.type === 'bat' && rng.next() < 0.5) {
      // 蝙蝠亂飛
      nx += rng.int(-1, 1)
      ny += rng.int(-1, 1)
    } else {
      let best = dist.get(idx(m.x, m.y)) ?? Infinity
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = m.x + dx
          const ty = m.y + dy
          const dd = dist.get(idx(tx, ty))
          if (
            dd !== undefined &&
            dd < best &&
            !monsterAt(s, tx, ty) &&
            !(tx === p.x && ty === p.y)
          ) {
            best = dd
            nx = tx
            ny = ty
          }
        }
      }
    }
    if (isFloor(s, nx, ny) && !monsterAt(s, nx, ny) && !(nx === p.x && ny === p.y)) {
      m.x = nx
      m.y = ny
    }
  }
}

function endTurn(s: State, rng: Random, events: RogueEvent[]): void {
  if (s.won) {
    computeFov(s)
    return
  }
  s.turn += 1
  monstersAct(s, rng, events)
  if (!s.dead) {
    s.regen += 1
    if (s.regen >= 9 && s.player.hp < s.player.maxHp) {
      s.player.hp += 1
      s.regen = 0
    }
  }
  computeFov(s)
}

/** 往某方向移動；前面有怪物就攻擊。回傳這一步發生的事件 */
export function move(s: State, dx: number, dy: number, rng: Random): RogueEvent[] {
  const events: RogueEvent[] = []
  if (s.dead || s.won) return events
  const nx = s.player.x + dx
  const ny = s.player.y + dy
  if (!isFloor(s, nx, ny)) return events
  const m = monsterAt(s, nx, ny)
  if (m) {
    playerAttack(s, m, rng, events)
  } else {
    s.player.x = nx
    s.player.y = ny
    pickupAt(s, events)
    if (s.tiles[idx(nx, ny)] === STAIRS) {
      s.floor += 1
      events.push('stairs')
      newFloor(s, rng)
      log(s, `你來到地城第 ${s.floor} 層。`)
      if (s.floor === FINAL_FLOOR) log(s, '空氣變得灼熱……這層有巨龍在等你。')
      return events
    }
  }
  endTurn(s, rng, events)
  return events
}

export function wait(s: State, rng: Random): RogueEvent[] {
  const events: RogueEvent[] = []
  if (s.dead || s.won) return events
  endTurn(s, rng, events)
  return events
}

export function usePotion(s: State, rng: Random): RogueEvent[] {
  const events: RogueEvent[] = []
  if (s.dead || s.won) return events
  if (s.potions <= 0) {
    log(s, '沒有治療藥水了。')
    return events
  }
  if (s.player.hp >= s.player.maxHp) {
    log(s, '生命已經是滿的。')
    return events
  }
  s.potions -= 1
  const heal = Math.min(s.player.maxHp - s.player.hp, 18)
  s.player.hp += heal
  events.push('heal')
  log(s, `喝下藥水，恢復 ${heal} 點生命。`)
  endTurn(s, rng, events)
  return events
}

export function useScroll(s: State, rng: Random): RogueEvent[] {
  const events: RogueEvent[] = []
  if (s.dead || s.won) return events
  if (s.scrolls <= 0) {
    log(s, '沒有炸彈卷軸了。')
    return events
  }
  const targets = s.monsters.filter((m) => s.visible[idx(m.x, m.y)])
  if (targets.length === 0) {
    log(s, '視野內沒有敵人，先別浪費卷軸。')
    return events
  }
  s.scrolls -= 1
  events.push('bomb')
  log(s, '卷軸爆炸了！視野內所有敵人受到 10 點傷害。')
  for (const m of targets) {
    m.hp -= 10
    m.alerted = true
    if (m.hp <= 0) {
      const spec = MONSTERS[m.type]
      s.monsters = s.monsters.filter((x) => x !== m)
      s.kills += 1
      events.push('kill')
      log(s, `${spec.name}被炸死了！（+${spec.xp} 經驗）`)
      gainXp(s, spec.xp, events)
      if (m.type === 'boss') {
        s.won = true
        events.push('win')
        log(s, '巨龍倒下了，你征服了這座地城！')
      }
    }
  }
  endTurn(s, rng, events)
  return events
}

export const xpNeeded = xpToNext
