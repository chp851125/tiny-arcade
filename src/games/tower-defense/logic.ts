export const WIDTH = 800
export const HEIGHT = 600
export const CELL = 50
export const COLS = 16
export const ROWS = 9
export const GRID_Y = 64
export const START_GOLD = 220
export const START_LIVES = 20
export const FINAL_WAVE = 20

export interface GameMap {
  id: string
  name: string
  /** 路線轉折點（格子座標）；起點在畫面外一格 */
  waypoints: readonly (readonly [number, number])[]
}

export const MAPS: readonly GameMap[] = [
  {
    id: 'snake',
    name: '蛇行小徑',
    waypoints: [
      [-1, 1],
      [13, 1],
      [13, 4],
      [2, 4],
      [2, 7],
      [16, 7],
    ],
  },
  {
    id: 'zigzag',
    name: '之字山路',
    waypoints: [
      [-1, 4],
      [4, 4],
      [4, 1],
      [8, 1],
      [8, 7],
      [12, 7],
      [12, 3],
      [16, 3],
    ],
  },
  {
    id: 'loop',
    name: '環山步道',
    waypoints: [
      [-1, 1],
      [6, 1],
      [6, 6],
      [10, 6],
      [10, 2],
      [14, 2],
      [14, 7],
      [16, 7],
    ],
  },
]

export type TowerType = 'arrow' | 'cannon' | 'ice' | 'sniper'
export const TOWER_TYPES: readonly TowerType[] = ['arrow', 'cannon', 'ice', 'sniper']

export interface TowerSpec {
  name: string
  cost: number
  range: number
  /** 攻擊間隔（秒） */
  interval: number
  damage: number
  color: string
  desc: string
}

export const TOWERS: Record<TowerType, TowerSpec> = {
  arrow: {
    name: '弓箭塔',
    cost: 50,
    range: 130,
    interval: 0.55,
    damage: 11,
    color: '#4aa3ff',
    desc: '射速快、便宜',
  },
  cannon: {
    name: '大砲',
    cost: 110,
    range: 120,
    interval: 1.5,
    damage: 30,
    color: '#ff9a3c',
    desc: '範圍爆炸傷害',
  },
  ice: {
    name: '冰凍塔',
    cost: 80,
    range: 110,
    interval: 0.9,
    damage: 4,
    color: '#3fd0d0',
    desc: '讓敵人減速一半',
  },
  sniper: {
    name: '狙擊塔',
    cost: 160,
    range: 230,
    interval: 2,
    damage: 70,
    color: '#b36bff',
    desc: '射程遠、打最硬的',
  },
}

export const MAX_LEVEL = 3
const SPLASH_RADIUS = 52

export type EnemyType = 'grunt' | 'fast' | 'tank' | 'boss'

interface EnemySpec {
  name: string
  hp: number
  speed: number
  reward: number
  /** 漏過去時扣的命 */
  leak: number
  color: string
  r: number
}

export const ENEMIES: Record<EnemyType, EnemySpec> = {
  grunt: { name: '小怪', hp: 34, speed: 62, reward: 6, leak: 1, color: '#ff6b5e', r: 11 },
  fast: { name: '快跑者', hp: 22, speed: 115, reward: 7, leak: 1, color: '#ffc933', r: 9 },
  tank: { name: '裝甲怪', hp: 150, speed: 42, reward: 15, leak: 2, color: '#2fb67c', r: 14 },
  boss: { name: '首領', hp: 700, speed: 36, reward: 90, leak: 5, color: '#b36bff', r: 19 },
}

export interface Tower {
  id: number
  type: TowerType
  col: number
  row: number
  level: number
  cooldown: number
  spent: number
  /** 面向目標的角度（畫面用） */
  angle: number
}

export interface Enemy {
  id: number
  type: EnemyType
  hp: number
  maxHp: number
  /** 沿路線走過的距離 */
  dist: number
  slow: number
  slowTimer: number
}

export interface Shot {
  kind: 'arrow' | 'shell'
  x: number
  y: number
  targetId: number
  damage: number
  speed: number
  /** 最後已知目標位置（目標死亡後飛向這裡） */
  tx: number
  ty: number
}

export interface Effect {
  kind: 'boom' | 'frost' | 'beam'
  x: number
  y: number
  x2: number
  y2: number
  age: number
  life: number
  r: number
  color: string
}

export interface SpawnItem {
  type: EnemyType
  delay: number
}

export interface State {
  map: GameMap
  /** 路線的像素座標與累積長度 */
  pathPoints: { x: number; y: number }[]
  pathLen: number[]
  buildable: boolean[]
  towers: Tower[]
  enemies: Enemy[]
  shots: Shot[]
  effects: Effect[]
  gold: number
  lives: number
  wave: number
  /** 這一波剩下要出的怪 */
  spawning: SpawnItem[]
  spawnTimer: number
  waveActive: boolean
  won: boolean
  gameOver: boolean
  nextId: number
  /** 這波有沒有漏怪（用來給完美防守的獎勵） */
  leaked: boolean
}

export type TdEvent =
  'shoot' | 'kill' | 'leak' | 'wave-start' | 'wave-clear' | 'win' | 'gameover' | 'boss'

const cellCenter = (c: number, r: number): { x: number; y: number } => ({
  x: c * CELL + CELL / 2,
  y: GRID_Y + r * CELL + CELL / 2,
})

export function createState(map: GameMap): State {
  const pts = map.waypoints.map(([c, r]) => cellCenter(c, r))
  const len = [0]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as { x: number; y: number }
    const b = pts[i] as { x: number; y: number }
    len.push((len[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y))
  }
  // 路線經過的格子不能蓋塔
  const buildable = Array<boolean>(COLS * ROWS).fill(true)
  for (let i = 1; i < map.waypoints.length; i++) {
    const [c0, r0] = map.waypoints[i - 1] as readonly [number, number]
    const [c1, r1] = map.waypoints[i] as readonly [number, number]
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) buildable[r * COLS + c] = false
      }
    }
  }
  return {
    map,
    pathPoints: pts,
    pathLen: len,
    buildable,
    towers: [],
    enemies: [],
    shots: [],
    effects: [],
    gold: START_GOLD,
    lives: START_LIVES,
    wave: 0,
    spawning: [],
    spawnTimer: 0,
    waveActive: false,
    won: false,
    gameOver: false,
    nextId: 1,
    leaked: false,
  }
}

export function posAt(s: State, dist: number): { x: number; y: number } {
  const total = s.pathLen[s.pathLen.length - 1] as number
  const d = Math.max(0, Math.min(total, dist))
  for (let i = 1; i < s.pathPoints.length; i++) {
    const l0 = s.pathLen[i - 1] as number
    const l1 = s.pathLen[i] as number
    if (d <= l1) {
      const a = s.pathPoints[i - 1] as { x: number; y: number }
      const b = s.pathPoints[i] as { x: number; y: number }
      const t = l1 === l0 ? 0 : (d - l0) / (l1 - l0)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
  }
  return s.pathPoints[s.pathPoints.length - 1] as { x: number; y: number }
}

export const towerAt = (s: State, col: number, row: number): Tower | undefined =>
  s.towers.find((t) => t.col === col && t.row === row)

export const towerCenter = (t: Tower): { x: number; y: number } => cellCenter(t.col, t.row)

/** 升級後的數值 */
export function statsOf(t: Tower): { range: number; interval: number; damage: number } {
  const spec = TOWERS[t.type]
  const lv = t.level - 1
  return {
    range: spec.range * (1 + 0.08 * lv),
    interval: spec.interval * (1 - 0.1 * lv),
    damage: spec.damage * (1 + 0.45 * lv),
  }
}

export const upgradeCost = (t: Tower): number =>
  t.level >= MAX_LEVEL ? 0 : Math.round(TOWERS[t.type].cost * (t.level === 1 ? 0.7 : 1))
export const sellValue = (t: Tower): number => Math.floor(t.spent * 0.7)

export function canPlace(s: State, type: TowerType, col: number, row: number): boolean {
  return (
    col >= 0 &&
    col < COLS &&
    row >= 0 &&
    row < ROWS &&
    s.buildable[row * COLS + col] === true &&
    !towerAt(s, col, row) &&
    s.gold >= TOWERS[type].cost
  )
}

export function placeTower(s: State, type: TowerType, col: number, row: number): boolean {
  if (!canPlace(s, type, col, row)) return false
  s.gold -= TOWERS[type].cost
  s.towers.push({
    id: s.nextId++,
    type,
    col,
    row,
    level: 1,
    cooldown: 0.3,
    spent: TOWERS[type].cost,
    angle: 0,
  })
  return true
}

export function upgradeTower(s: State, t: Tower): boolean {
  const cost = upgradeCost(t)
  if (t.level >= MAX_LEVEL || s.gold < cost) return false
  s.gold -= cost
  t.spent += cost
  t.level += 1
  return true
}

export function sellTower(s: State, t: Tower): void {
  s.gold += sellValue(t)
  s.towers = s.towers.filter((x) => x.id !== t.id)
}

/** 每一波要出的怪 */
export function buildWave(wave: number): SpawnItem[] {
  const list: SpawnItem[] = []
  const count = 8 + Math.floor(wave * 2)
  const interval = Math.max(0.5, 1 - wave * 0.03)
  for (let i = 0; i < count; i++) {
    let type: EnemyType = 'grunt'
    if (wave >= 3 && i % 3 === 2) type = 'fast'
    if (wave >= 6 && i % 4 === 3) type = 'tank'
    list.push({ type, delay: interval })
  }
  if (wave % 5 === 0) list.push({ type: 'boss', delay: 1.5 })
  return list
}

export function startWave(s: State): boolean {
  if (s.waveActive || s.won || s.gameOver) return false
  s.wave += 1
  s.spawning = buildWave(s.wave)
  s.spawnTimer = 0.4
  s.waveActive = true
  s.leaked = false
  return true
}

const hpMult = (wave: number): number => 1 + 0.22 * (wave - 1) + 0.0025 * (wave - 1) ** 3

function pickTarget(s: State, t: Tower, range: number): Enemy | null {
  const c = towerCenter(t)
  let best: Enemy | null = null
  for (const e of s.enemies) {
    const p = posAt(s, e.dist)
    if (Math.hypot(p.x - c.x, p.y - c.y) > range + ENEMIES[e.type].r) continue
    if (!best) {
      best = e
      continue
    }
    if (t.type === 'sniper') {
      if (e.hp > best.hp) best = e
    } else if (t.type === 'ice') {
      // 優先打還沒被減速、跑得最前面的
      const eFree = e.slowTimer <= 0
      const bFree = best.slowTimer <= 0
      if (eFree !== bFree ? eFree : e.dist > best.dist) best = e
    } else if (e.dist > best.dist) best = e
  }
  return best
}

function damageEnemy(s: State, e: Enemy, dmg: number, events: TdEvent[]): void {
  if (e.hp <= 0) return
  e.hp -= dmg
  if (e.hp <= 0) {
    s.gold += ENEMIES[e.type].reward
    events.push('kill')
  }
}

export function update(s: State, dt: number): TdEvent[] {
  const events: TdEvent[] = []
  if (s.gameOver || s.won) return events

  // 出怪
  if (s.waveActive && s.spawning.length > 0) {
    s.spawnTimer -= dt
    if (s.spawnTimer <= 0) {
      const item = s.spawning.shift() as SpawnItem
      const spec = ENEMIES[item.type]
      const hp = Math.round(spec.hp * hpMult(s.wave))
      s.enemies.push({
        id: s.nextId++,
        type: item.type,
        hp,
        maxHp: hp,
        dist: 0,
        slow: 1,
        slowTimer: 0,
      })
      s.spawnTimer = item.delay
      if (item.type === 'boss') events.push('boss')
    }
  }

  // 敵人前進
  const total = s.pathLen[s.pathLen.length - 1] as number
  for (const e of s.enemies) {
    if (e.slowTimer > 0) {
      e.slowTimer -= dt
      if (e.slowTimer <= 0) e.slow = 1
    }
    e.dist += ENEMIES[e.type].speed * e.slow * dt
    if (e.dist >= total && e.hp > 0) {
      s.lives -= ENEMIES[e.type].leak
      s.leaked = true
      e.hp = 0
      events.push('leak')
      if (s.lives <= 0) {
        s.lives = 0
        s.gameOver = true
        events.push('gameover')
        return events
      }
    }
  }

  // 塔攻擊
  for (const t of s.towers) {
    t.cooldown -= dt
    if (t.cooldown > 0) continue
    const st = statsOf(t)
    const target = pickTarget(s, t, st.range)
    if (!target) continue
    t.cooldown = st.interval
    const c = towerCenter(t)
    const tp = posAt(s, target.dist)
    t.angle = Math.atan2(tp.y - c.y, tp.x - c.x)
    events.push('shoot')
    if (t.type === 'arrow') {
      s.shots.push({
        kind: 'arrow',
        x: c.x,
        y: c.y,
        targetId: target.id,
        damage: st.damage,
        speed: 520,
        tx: tp.x,
        ty: tp.y,
      })
    } else if (t.type === 'cannon') {
      s.shots.push({
        kind: 'shell',
        x: c.x,
        y: c.y,
        targetId: target.id,
        damage: st.damage,
        speed: 280,
        tx: tp.x,
        ty: tp.y,
      })
    } else if (t.type === 'ice') {
      // 冰凍：範圍內所有敵人都減速
      s.effects.push({
        kind: 'frost',
        x: c.x,
        y: c.y,
        x2: 0,
        y2: 0,
        age: 0,
        life: 0.35,
        r: st.range,
        color: TOWERS.ice.color,
      })
      for (const e of s.enemies) {
        const p = posAt(s, e.dist)
        if (Math.hypot(p.x - c.x, p.y - c.y) <= st.range + ENEMIES[e.type].r) {
          e.slow = 0.5
          e.slowTimer = 1.6
          damageEnemy(s, e, st.damage, events)
        }
      }
    } else {
      s.effects.push({
        kind: 'beam',
        x: c.x,
        y: c.y,
        x2: tp.x,
        y2: tp.y,
        age: 0,
        life: 0.18,
        r: 0,
        color: TOWERS.sniper.color,
      })
      damageEnemy(s, target, st.damage, events)
    }
  }

  // 子彈
  s.shots = s.shots.filter((b) => {
    const target = s.enemies.find((e) => e.id === b.targetId && e.hp > 0)
    if (target) {
      const p = posAt(s, target.dist)
      b.tx = p.x
      b.ty = p.y
    }
    const dx = b.tx - b.x
    const dy = b.ty - b.y
    const d = Math.hypot(dx, dy)
    const step = b.speed * dt
    if (d > step) {
      b.x += (dx / d) * step
      b.y += (dy / d) * step
      return true
    }
    // 命中
    if (b.kind === 'arrow') {
      if (target) damageEnemy(s, target, b.damage, events)
    } else {
      s.effects.push({
        kind: 'boom',
        x: b.tx,
        y: b.ty,
        x2: 0,
        y2: 0,
        age: 0,
        life: 0.3,
        r: SPLASH_RADIUS,
        color: TOWERS.cannon.color,
      })
      for (const e of s.enemies) {
        const p = posAt(s, e.dist)
        if (Math.hypot(p.x - b.tx, p.y - b.ty) <= SPLASH_RADIUS + ENEMIES[e.type].r)
          damageEnemy(s, e, b.damage, events)
      }
    }
    return false
  })

  s.enemies = s.enemies.filter((e) => e.hp > 0)
  s.effects = s.effects.filter((f) => {
    f.age += dt
    return f.age < f.life
  })

  // 這一波打完
  if (s.waveActive && s.spawning.length === 0 && s.enemies.length === 0) {
    s.waveActive = false
    s.gold += 25 + s.wave * 3 + (s.leaked ? 0 : 20)
    events.push('wave-clear')
    if (s.wave >= FINAL_WAVE) {
      s.won = true
      events.push('win')
    }
  }
  return events
}
