import type { Random } from '../../shared/random.ts'

export const HAND_SIZE = 5
export const ENERGY_PER_TURN = 3
export const PLAYER_HP = 60
export const BATTLES = 5

export type CardId =
  | 'strike'
  | 'defend'
  | 'bash'
  | 'twin'
  | 'cleave'
  | 'heavy'
  | 'flurry'
  | 'iron'
  | 'rally'
  | 'draw'
  | 'burst'
  | 'counter'
  | 'mend'

export interface CardDef {
  id: CardId
  name: string
  cost: number
  type: 'attack' | 'skill'
  /** enemy：選一個敵人；all：全體敵人；self：不用選 */
  target: 'enemy' | 'all' | 'self'
  text: string
  dmg?: number
  hits?: number
  block?: number
  vuln?: number
  strength?: number
  draw?: number
  energy?: number
  heal?: number
  exhaust?: boolean
}

export const CARDS: Record<CardId, CardDef> = {
  strike: {
    id: 'strike',
    name: '打擊',
    cost: 1,
    type: 'attack',
    target: 'enemy',
    text: '造成 6 點傷害',
    dmg: 6,
  },
  defend: {
    id: 'defend',
    name: '防禦',
    cost: 1,
    type: 'skill',
    target: 'self',
    text: '獲得 5 點格擋',
    block: 5,
  },
  bash: {
    id: 'bash',
    name: '痛擊',
    cost: 2,
    type: 'attack',
    target: 'enemy',
    text: '造成 8 點傷害，施加 2 層易傷',
    dmg: 8,
    vuln: 2,
  },
  twin: {
    id: 'twin',
    name: '雙重打擊',
    cost: 1,
    type: 'attack',
    target: 'enemy',
    text: '造成 5 點傷害 2 次',
    dmg: 5,
    hits: 2,
  },
  cleave: {
    id: 'cleave',
    name: '橫掃',
    cost: 1,
    type: 'attack',
    target: 'all',
    text: '對全體敵人造成 6 點傷害',
    dmg: 6,
  },
  heavy: {
    id: 'heavy',
    name: '重擊',
    cost: 2,
    type: 'attack',
    target: 'enemy',
    text: '造成 16 點傷害',
    dmg: 16,
  },
  flurry: {
    id: 'flurry',
    name: '狂怒',
    cost: 0,
    type: 'attack',
    target: 'enemy',
    text: '造成 3 點傷害',
    dmg: 3,
  },
  iron: {
    id: 'iron',
    name: '鐵壁',
    cost: 2,
    type: 'skill',
    target: 'self',
    text: '獲得 13 點格擋',
    block: 13,
  },
  rally: {
    id: 'rally',
    name: '戰吼',
    cost: 1,
    type: 'skill',
    target: 'self',
    text: '力量 +2（攻擊傷害 +2）',
    strength: 2,
  },
  draw: {
    id: 'draw',
    name: '洞察',
    cost: 1,
    type: 'skill',
    target: 'self',
    text: '抽 2 張牌',
    draw: 2,
  },
  burst: {
    id: 'burst',
    name: '爆發',
    cost: 0,
    type: 'skill',
    target: 'self',
    text: '獲得 2 點能量。消耗',
    energy: 2,
    exhaust: true,
  },
  counter: {
    id: 'counter',
    name: '反擊',
    cost: 1,
    type: 'attack',
    target: 'enemy',
    text: '造成 4 點傷害，獲得 6 點格擋',
    dmg: 4,
    block: 6,
  },
  mend: {
    id: 'mend',
    name: '包紮',
    cost: 1,
    type: 'skill',
    target: 'self',
    text: '恢復 7 點生命。消耗',
    heal: 7,
    exhaust: true,
  },
}

export const STARTER_DECK: CardId[] = [
  'strike',
  'strike',
  'strike',
  'strike',
  'strike',
  'defend',
  'defend',
  'defend',
  'defend',
  'bash',
]

/** 戰鬥後可以選的新牌 */
export const REWARD_POOL: CardId[] = [
  'twin',
  'cleave',
  'heavy',
  'flurry',
  'iron',
  'rally',
  'draw',
  'burst',
  'counter',
  'mend',
  'bash',
  'defend',
]

export type Intent =
  | { kind: 'attack'; dmg: number; hits?: number }
  | { kind: 'defend'; block: number }
  | { kind: 'buff'; strength: number }
  | { kind: 'debuff'; vuln: number }

export interface EnemySpec {
  id: string
  name: string
  hp: number
  color: string
  pattern: Intent[]
}

export const ENEMY_SPECS: Record<string, EnemySpec> = {
  slime: {
    id: 'slime',
    name: '史萊姆',
    hp: 30,
    color: '#2fb67c',
    pattern: [
      { kind: 'attack', dmg: 6 },
      { kind: 'attack', dmg: 8 },
      { kind: 'defend', block: 6 },
    ],
  },
  goblin: {
    id: 'goblin',
    name: '哥布林',
    hp: 38,
    color: '#ff9a3c',
    pattern: [
      { kind: 'attack', dmg: 5, hits: 2 },
      { kind: 'buff', strength: 2 },
      { kind: 'attack', dmg: 9 },
    ],
  },
  bat: {
    id: 'bat',
    name: '蝙蝠',
    hp: 18,
    color: '#b36bff',
    pattern: [
      { kind: 'attack', dmg: 4, hits: 2 },
      { kind: 'attack', dmg: 5 },
    ],
  },
  minislime: {
    id: 'minislime',
    name: '小史萊姆',
    hp: 14,
    color: '#8fe3a8',
    pattern: [
      { kind: 'attack', dmg: 4 },
      { kind: 'defend', block: 4 },
    ],
  },
  skeleton: {
    id: 'skeleton',
    name: '骷髏戰士',
    hp: 48,
    color: '#cfc8a8',
    pattern: [
      { kind: 'attack', dmg: 10 },
      { kind: 'debuff', vuln: 2 },
      { kind: 'defend', block: 9 },
      { kind: 'attack', dmg: 7, hits: 2 },
    ],
  },
  demon: {
    id: 'demon',
    name: '魔王',
    hp: 120,
    color: '#ff4d4d',
    pattern: [
      { kind: 'attack', dmg: 12 },
      { kind: 'buff', strength: 2 },
      { kind: 'attack', dmg: 7, hits: 2 },
      { kind: 'debuff', vuln: 2 },
      { kind: 'attack', dmg: 18 },
      { kind: 'defend', block: 12 },
    ],
  },
}

export const ENCOUNTERS: string[][] = [
  ['slime'],
  ['goblin'],
  ['bat', 'bat'],
  ['skeleton', 'minislime'],
  ['demon'],
]

export interface Enemy {
  uid: number
  spec: EnemySpec
  hp: number
  maxHp: number
  block: number
  strength: number
  vulnerable: number
  step: number
}

export interface Player {
  hp: number
  maxHp: number
  block: number
  strength: number
  vulnerable: number
}

export type Phase = 'player' | 'enemy' | 'reward' | 'won' | 'lost'

export interface State {
  battle: number
  player: Player
  energy: number
  /** 整副牌（跨戰鬥保留） */
  deck: CardId[]
  drawPile: CardId[]
  hand: CardId[]
  discard: CardId[]
  exhausted: CardId[]
  enemies: Enemy[]
  phase: Phase
  turn: number
  nextUid: number
}

export type CardEvent =
  | { kind: 'damage'; uid: number; amount: number; blocked: number }
  | { kind: 'block'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'buff'; text: string }
  | { kind: 'kill'; uid: number }
  | { kind: 'playerHit'; amount: number; blocked: number }
  | { kind: 'enemyBlock'; uid: number; amount: number }

export const intentOf = (e: Enemy): Intent =>
  e.spec.pattern[e.step % e.spec.pattern.length] as Intent

export function createState(rng: Random): State {
  const s: State = {
    battle: 0,
    player: { hp: PLAYER_HP, maxHp: PLAYER_HP, block: 0, strength: 0, vulnerable: 0 },
    energy: 0,
    deck: [...STARTER_DECK],
    drawPile: [],
    hand: [],
    discard: [],
    exhausted: [],
    enemies: [],
    phase: 'player',
    turn: 0,
    nextUid: 1,
  }
  startBattle(s, 0, rng)
  return s
}

export function startBattle(s: State, index: number, rng: Random): void {
  s.battle = index
  s.enemies = (ENCOUNTERS[index] as string[]).map((id) => {
    const spec = ENEMY_SPECS[id] as EnemySpec
    return {
      uid: s.nextUid++,
      spec,
      hp: spec.hp,
      maxHp: spec.hp,
      block: 0,
      strength: 0,
      vulnerable: 0,
      step: 0,
    }
  })
  s.player.strength = 0
  s.player.vulnerable = 0
  s.drawPile = rng.shuffle(s.deck)
  s.hand = []
  s.discard = []
  s.exhausted = []
  s.turn = 0
  beginPlayerTurn(s, rng)
}

export function drawCards(s: State, n: number, rng: Random): void {
  for (let i = 0; i < n; i++) {
    if (s.drawPile.length === 0) {
      if (s.discard.length === 0) return
      s.drawPile = rng.shuffle(s.discard)
      s.discard = []
    }
    const c = s.drawPile.pop() as CardId
    s.hand.push(c)
  }
}

function beginPlayerTurn(s: State, rng: Random): void {
  s.phase = 'player'
  s.turn += 1
  s.player.block = 0
  s.energy = ENERGY_PER_TURN
  drawCards(s, HAND_SIZE, rng)
}

const livingEnemies = (s: State): Enemy[] => s.enemies.filter((e) => e.hp > 0)

function dealDamage(e: Enemy, base: number, strength: number): { amount: number; blocked: number } {
  let dmg = base + strength
  if (e.vulnerable > 0) dmg = Math.floor(dmg * 1.5)
  dmg = Math.max(0, dmg)
  const blocked = Math.min(e.block, dmg)
  e.block -= blocked
  const amount = dmg - blocked
  e.hp = Math.max(0, e.hp - amount)
  return { amount, blocked }
}

export function canPlay(s: State, handIndex: number): boolean {
  const id = s.hand[handIndex]
  return s.phase === 'player' && id !== undefined && CARDS[id].cost <= s.energy
}

/** 出牌；回傳這張牌造成的事件。attack 類的 target 要給敵人的 uid */
export function playCard(
  s: State,
  handIndex: number,
  targetUid: number | null,
  rng: Random,
): CardEvent[] {
  const events: CardEvent[] = []
  if (!canPlay(s, handIndex)) return events
  const id = s.hand[handIndex] as CardId
  const card = CARDS[id]
  let targets: Enemy[] = []
  if (card.target === 'enemy') {
    const t = s.enemies.find((e) => e.uid === targetUid && e.hp > 0)
    if (!t) return events
    targets = [t]
  } else if (card.target === 'all') {
    targets = livingEnemies(s)
  }

  s.energy -= card.cost
  s.hand.splice(handIndex, 1)

  if (card.dmg !== undefined) {
    for (let h = 0; h < (card.hits ?? 1); h++) {
      for (const t of targets) {
        if (t.hp <= 0) continue
        const r = dealDamage(t, card.dmg, s.player.strength)
        events.push({ kind: 'damage', uid: t.uid, amount: r.amount, blocked: r.blocked })
        if (t.hp <= 0) events.push({ kind: 'kill', uid: t.uid })
      }
    }
  }
  if (card.vuln) {
    for (const t of targets) if (t.hp > 0) t.vulnerable += card.vuln
  }
  if (card.block) {
    s.player.block += card.block
    events.push({ kind: 'block', amount: card.block })
  }
  if (card.strength) {
    s.player.strength += card.strength
    events.push({ kind: 'buff', text: `力量 +${card.strength}` })
  }
  if (card.energy) {
    s.energy += card.energy
    events.push({ kind: 'buff', text: `能量 +${card.energy}` })
  }
  if (card.heal) {
    const amount = Math.min(card.heal, s.player.maxHp - s.player.hp)
    s.player.hp += amount
    events.push({ kind: 'heal', amount })
  }
  if (card.draw) drawCards(s, card.draw, rng)

  if (card.exhaust) s.exhausted.push(id)
  else s.discard.push(id)

  if (livingEnemies(s).length === 0) {
    s.phase = s.battle >= BATTLES - 1 ? 'won' : 'reward'
  }
  return events
}

/** 結束玩家回合：手牌丟棄，進入敵人回合 */
export function endPlayerTurn(s: State): void {
  if (s.phase !== 'player') return
  s.discard.push(...s.hand)
  s.hand = []
  if (s.player.vulnerable > 0) s.player.vulnerable -= 1
  s.phase = 'enemy'
}

/** 某個敵人行動；回傳事件。全部敵人都行動完後，呼叫 finishEnemyTurn */
export function enemyAct(s: State, uid: number): CardEvent[] {
  const events: CardEvent[] = []
  const e = s.enemies.find((x) => x.uid === uid)
  if (!e || e.hp <= 0 || s.phase !== 'enemy') return events
  e.block = 0
  const intent = intentOf(e)
  if (intent.kind === 'attack') {
    for (let h = 0; h < (intent.hits ?? 1); h++) {
      let dmg = intent.dmg + e.strength
      if (s.player.vulnerable > 0) dmg = Math.floor(dmg * 1.5)
      const blocked = Math.min(s.player.block, dmg)
      s.player.block -= blocked
      const amount = dmg - blocked
      s.player.hp = Math.max(0, s.player.hp - amount)
      events.push({ kind: 'playerHit', amount, blocked })
    }
  } else if (intent.kind === 'defend') {
    e.block += intent.block
    events.push({ kind: 'enemyBlock', uid: e.uid, amount: intent.block })
  } else if (intent.kind === 'buff') {
    e.strength += intent.strength
    events.push({ kind: 'buff', text: `${e.spec.name} 力量 +${intent.strength}` })
  } else {
    s.player.vulnerable += intent.vuln
    events.push({ kind: 'buff', text: `你獲得易傷 ${intent.vuln}` })
  }
  e.step += 1
  if (s.player.hp <= 0) s.phase = 'lost'
  return events
}

export function finishEnemyTurn(s: State, rng: Random): void {
  if (s.phase !== 'enemy') return
  for (const e of s.enemies) {
    if (e.vulnerable > 0) e.vulnerable -= 1
  }
  beginPlayerTurn(s, rng)
}

export function randomRewards(rng: Random): CardId[] {
  return rng.shuffle(REWARD_POOL).slice(0, 3)
}

/** 戰鬥獲勝：加入選的牌（可略過），回復一些生命，進入下一場 */
export function nextBattle(s: State, pick: CardId | null, rng: Random): void {
  if (pick) s.deck.push(pick)
  s.player.hp = Math.min(s.player.maxHp, s.player.hp + 10)
  startBattle(s, s.battle + 1, rng)
}
