import type { Random } from '../../shared/random.ts'

export const WIDTH = 800
export const HEIGHT = 600
export const BASKET_Y = HEIGHT - 70
export const BASKET_H = 36
export const ITEM_R = 18
export const START_LIVES = 5
const BASKET_SPEED = 580
const ARENA_MARGIN = 28

export type ItemType = 'apple' | 'orange' | 'lemon' | 'cherry' | 'gold' | 'bomb'

export interface Item {
  x: number
  y: number
  vy: number
  type: ItemType
  spin: number
}

export interface State {
  basketX: number
  basketW: number
  items: Item[]
  score: number
  lives: number
  /** 連續接到的水果數（沒漏接、沒接到炸彈） */
  combo: number
  caught: number
  spawnTimer: number
  gameOver: boolean
}

export type CatchEvent = 'catch' | 'gold' | 'miss' | 'bomb' | 'gameover'

const FRUITS: readonly ItemType[] = ['apple', 'orange', 'lemon', 'cherry']

export function createState(): State {
  return {
    basketX: WIDTH / 2,
    basketW: 120,
    items: [],
    score: 0,
    lives: START_LIVES,
    combo: 0,
    caught: 0,
    spawnTimer: 1,
    gameOver: false,
  }
}

/** 連擊加成：每連續接到 5 個多 1 倍，最多 ×5 */
export const comboMultiplier = (combo: number): number => Math.min(5, 1 + Math.floor(combo / 5))

/** 掉落速度與出現間隔，隨接到的數量慢慢變快，有上限 */
const fallSpeed = (caught: number): number => Math.min(400, 170 + caught * 2.5)
const spawnInterval = (caught: number): number => Math.max(0.45, 1.1 - caught * 0.012)

export interface Controls {
  /** -1 左、0 不動、1 右 */
  dir: number
  /** 滑鼠的邏輯 x 座標；沒有用滑鼠時為 null */
  mouseX: number | null
}

export function update(s: State, dt: number, controls: Controls, rng: Random): CatchEvent[] {
  const events: CatchEvent[] = []
  if (s.gameOver) return events

  const half = s.basketW / 2
  const clamp = (x: number): number => Math.max(half + 6, Math.min(WIDTH - half - 6, x))
  if (controls.mouseX !== null) s.basketX = clamp(controls.mouseX)
  if (controls.dir !== 0) s.basketX = clamp(s.basketX + controls.dir * BASKET_SPEED * dt)

  s.spawnTimer -= dt
  if (s.spawnTimer <= 0) {
    s.spawnTimer = spawnInterval(s.caught) * (0.75 + rng.next() * 0.5)
    const r = rng.next()
    const type: ItemType = s.caught >= 5 && r < 0.14 ? 'bomb' : r > 0.95 ? 'gold' : rng.pick(FRUITS)
    s.items.push({
      x: rng.int(ARENA_MARGIN + ITEM_R, WIDTH - ARENA_MARGIN - ITEM_R),
      y: -ITEM_R,
      vy: fallSpeed(s.caught) * (type === 'gold' ? 1.25 : 1),
      type,
      spin: rng.next() * Math.PI * 2,
    })
  }

  s.items = s.items.filter((it) => {
    it.y += it.vy * dt
    it.spin += dt * 2
    // 接住：落到籃子口的高度範圍內，且水平位置在籃子上方
    if (it.y + ITEM_R >= BASKET_Y && it.y - ITEM_R <= BASKET_Y + BASKET_H * 0.6) {
      if (Math.abs(it.x - s.basketX) <= half + ITEM_R * 0.3) {
        if (it.type === 'bomb') {
          loseLife(s, events)
          events.push('bomb')
        } else {
          s.combo += 1
          s.caught += 1
          s.score += (it.type === 'gold' ? 5 : 1) * comboMultiplier(s.combo)
          events.push(it.type === 'gold' ? 'gold' : 'catch')
        }
        return false
      }
    }
    if (it.y - ITEM_R > HEIGHT) {
      // 漏掉水果要扣命；炸彈漏掉是好事
      if (it.type !== 'bomb') {
        loseLife(s, events)
        events.push('miss')
      }
      return false
    }
    return true
  })
  return events
}

function loseLife(s: State, events: CatchEvent[]): void {
  s.combo = 0
  s.lives -= 1
  if (s.lives <= 0) {
    s.gameOver = true
    events.push('gameover')
  }
}
