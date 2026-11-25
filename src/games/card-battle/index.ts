import './card-battle.css'
import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import {
  BATTLES,
  CARDS,
  ENERGY_PER_TURN,
  canPlay,
  createState,
  endPlayerTurn,
  enemyAct,
  finishEnemyTurn,
  intentOf,
  nextBattle,
  playCard,
  randomRewards,
} from './logic.ts'
import type { CardEvent, CardId, Enemy, Intent, State } from './logic.ts'

/** 卡牌戰鬥：每回合 3 點能量、抽 5 張牌，出牌打倒怪物，連打 5 場，最後一場是魔王 */

type Phase = 'menu' | 'playing' | 'paused' | 'over'

let cleanup: (() => void) | null = null

function intentText(i: Intent): { label: string; cls: string } {
  if (i.kind === 'attack')
    return { label: i.hits ? `攻擊 ${i.dmg} ×${i.hits}` : `攻擊 ${i.dmg}`, cls: 'is-attack' }
  if (i.kind === 'defend') return { label: `防禦 ${i.block}`, cls: 'is-defend' }
  if (i.kind === 'buff') return { label: `強化 力量+${i.strength}`, cls: 'is-buff' }
  return { label: `削弱 易傷 ${i.vuln}`, cls: 'is-debuff' }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let state: State = createState(rng)
  let phase: Phase = 'menu'
  let selected = -1
  let rewards: CardId[] | null = null
  let busy = false
  let dialog: DialogHandle | null = null
  const timers = new Set<number>()
  let pops: { selector: string; text: string; cls: string }[] = []
  let shake = ''

  const root = el('div', 'cb')
  container.append(root)

  const later = (ms: number, fn: () => void): void => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
  }

  const livingEnemies = (): Enemy[] => state.enemies.filter((e) => e.hp > 0)

  // --- 事件與音效 ---
  const handleEvents = (events: CardEvent[]): void => {
    for (const ev of events) {
      if (ev.kind === 'damage') {
        pops.push({
          selector: `[data-uid="${ev.uid}"]`,
          text: ev.amount > 0 ? `-${ev.amount}` : ev.blocked > 0 ? '擋住' : '0',
          cls: 'is-dmg',
        })
        ctx.audio.play('click')
      } else if (ev.kind === 'kill') ctx.audio.play('score')
      else if (ev.kind === 'block') {
        pops.push({ selector: '.cb__player', text: `+${ev.amount} 格擋`, cls: 'is-block' })
        ctx.audio.play('click')
      } else if (ev.kind === 'heal') {
        pops.push({ selector: '.cb__player', text: `+${ev.amount} 生命`, cls: 'is-heal' })
        ctx.audio.play('click')
      } else if (ev.kind === 'buff') {
        pops.push({ selector: '.cb__player', text: ev.text, cls: 'is-buff' })
        ctx.audio.play('click')
      } else if (ev.kind === 'playerHit') {
        pops.push({
          selector: '.cb__player',
          text: ev.amount > 0 ? `-${ev.amount}` : '擋住',
          cls: 'is-hurt',
        })
        shake = 'player'
        ctx.audio.play(ev.amount > 0 ? 'fail' : 'click')
      } else if (ev.kind === 'enemyBlock') {
        pops.push({
          selector: `[data-uid="${ev.uid}"]`,
          text: `+${ev.amount} 格擋`,
          cls: 'is-block',
        })
      }
    }
  }

  // --- 流程 ---
  const checkEnd = (): void => {
    if (state.phase === 'lost') {
      phase = 'over'
      ctx.audio.play('explosion')
      dialog = Dialog({
        title: '你倒下了',
        content: [
          `在第 ${state.battle + 1} 場戰鬥被打倒，牌組共 ${state.deck.length} 張。`,
          '再挑戰一次嗎？',
        ],
        actions: [
          Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
          Button({ label: '再玩一次', onClick: () => start() }),
        ],
      })
      dialog.open()
    } else if (state.phase === 'won') {
      phase = 'over'
      ctx.audio.play('success')
      dialog = Dialog({
        title: '打倒魔王！',
        content: [
          `你通過了全部 ${BATTLES} 場戰鬥，剩下 ${state.player.hp} 點生命，牌組 ${state.deck.length} 張。`,
          '再玩一次嗎？',
        ],
        actions: [
          Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
          Button({ label: '再玩一次', onClick: () => start() }),
        ],
      })
      dialog.open()
    } else if (state.phase === 'reward' && !rewards) {
      rewards = randomRewards(rng)
      ctx.audio.play('success')
    }
  }

  const start = (): void => {
    closeDialog()
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
    state = createState(rng)
    selected = -1
    rewards = null
    busy = false
    phase = 'playing'
    render()
  }

  const showMenu = (): void => {
    closeDialog()
    state = createState(rng)
    phase = 'menu'
    dialog = Dialog({
      title: '卡牌戰鬥',
      content: [
        `連續打倒 ${BATTLES} 場戰鬥的怪物，最後是魔王。每場勝利後可以選一張新牌放進牌組。`,
        '每回合有 3 點能量、抽 5 張牌。點牌出牌，攻擊牌要再點一隻敵人。敵人頭上會顯示牠下一步要做什麼。',
        '快捷鍵：數字鍵 1~5 選牌，Enter 結束回合，Esc 取消／暫停。',
      ],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '開始', onClick: () => start() }),
      ],
    })
    dialog.open()
    render()
  }

  const afterPlayerAction = (events: CardEvent[]): void => {
    handleEvents(events)
    selected = -1
    checkEnd()
    render()
  }

  const tryPlay = (handIndex: number, targetUid: number | null): void => {
    if (busy || phase !== 'playing' || state.phase !== 'player') return
    afterPlayerAction(playCard(state, handIndex, targetUid, rng))
  }

  const onCardClick = (i: number): void => {
    if (busy || phase !== 'playing' || state.phase !== 'player' || !canPlay(state, i)) return
    const card = CARDS[state.hand[i] as CardId]
    if (card.target === 'enemy') {
      const live = livingEnemies()
      if (live.length === 1) tryPlay(i, (live[0] as Enemy).uid)
      else {
        selected = selected === i ? -1 : i
        render()
      }
    } else {
      tryPlay(i, null)
    }
  }

  const onEnemyClick = (uid: number): void => {
    if (selected >= 0) tryPlay(selected, uid)
  }

  const runEnemyTurn = (): void => {
    busy = true
    endPlayerTurn(state)
    selected = -1
    render()
    const order = livingEnemies().map((e) => e.uid)
    const stepAt = (k: number): void => {
      if (phase !== 'playing') return
      if (k >= order.length) {
        finishEnemyTurn(state, rng)
        busy = false
        checkEnd()
        render()
        return
      }
      const events = enemyAct(state, order[k] as number)
      handleEvents(events)
      render()
      if (state.phase === 'lost') {
        busy = false
        checkEnd()
        render()
        return
      }
      later(650, () => stepAt(k + 1))
    }
    later(450, () => stepAt(0))
  }

  const onEndTurn = (): void => {
    if (busy || phase !== 'playing' || state.phase !== 'player') return
    runEnemyTurn()
  }

  const pickReward = (card: CardId | null): void => {
    nextBattle(state, card, rng)
    rewards = null
    selected = -1
    render()
  }

  const pause = (): void => {
    if (phase !== 'playing') return
    phase = 'paused'
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({ label: '重新開始', variant: 'secondary', onClick: () => showMenu() }),
        Button({ label: '繼續', onClick: () => resume() }),
      ],
    })
    dialog.open()
  }

  const resume = (): void => {
    if (phase !== 'paused') return
    closeDialog()
    phase = 'playing'
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (phase === 'paused') resume()
      else if (selected >= 0) {
        selected = -1
        render()
      } else pause()
      return
    }
    if (phase !== 'playing' || e.repeat) return
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(e.code)
    if (n >= 0 && !rewards) onCardClick(n)
    else if (e.code === 'Enter') onEndTurn()
  }
  window.addEventListener('keydown', onKeyDown)

  // --- 畫面 ---
  const cardEl = (
    id: CardId,
    opts: { index?: number; playable?: boolean; selected?: boolean; onClick?: () => void },
  ): HTMLElement => {
    const c = CARDS[id]
    const card = el('button', `cb__card is-${c.type}`)
    card.type = 'button'
    if (opts.playable === false) card.classList.add('is-disabled')
    if (opts.selected) card.classList.add('is-selected')
    const cost = el('span', 'cb__cost', String(c.cost))
    const name = el('span', 'cb__card-name', c.name)
    const kind = el('span', 'cb__card-kind', c.type === 'attack' ? '攻擊' : '技能')
    const text = el('span', 'cb__card-text', c.text)
    card.append(cost, name, kind, text)
    if (opts.index !== undefined) card.append(el('span', 'cb__hotkey', String(opts.index + 1)))
    if (opts.onClick) card.addEventListener('click', opts.onClick)
    return card
  }

  const enemyEl = (e: Enemy): HTMLElement => {
    const dead = e.hp <= 0
    const wrap = el('div', 'cb__enemy')
    wrap.dataset.uid = String(e.uid)
    if (dead) wrap.classList.add('is-dead')
    if (selected >= 0 && !dead) wrap.classList.add('is-target')
    const it = intentText(intentOf(e))
    const intent = el('div', `cb__intent ${it.cls}`, dead ? '' : it.label)
    const body = el('div', 'cb__blob')
    body.style.background = e.spec.color
    body.append(el('span', 'cb__eye'), el('span', 'cb__eye'))
    const name = el('div', 'cb__name', e.spec.name)
    const bar = el('div', 'cb__bar')
    const fill = el('div', 'cb__bar-fill')
    fill.style.width = `${(100 * Math.max(0, e.hp)) / e.maxHp}%`
    bar.append(fill, el('span', 'cb__bar-text', `${Math.max(0, e.hp)} / ${e.maxHp}`))
    const tags = el('div', 'cb__tags')
    if (e.block > 0) tags.append(el('span', 'cb__tag is-block', `格擋 ${e.block}`))
    if (e.strength > 0) tags.append(el('span', 'cb__tag is-buff', `力量 ${e.strength}`))
    if (e.vulnerable > 0) tags.append(el('span', 'cb__tag is-debuff', `易傷 ${e.vulnerable}`))
    wrap.append(intent, body, name, bar, tags)
    if (!dead) wrap.addEventListener('click', () => onEnemyClick(e.uid))
    return wrap
  }

  function render(): void {
    root.replaceChildren()
    const myTurn = state.phase === 'player' && !busy && phase === 'playing'

    const top = el('div', 'cb__top')
    top.append(
      el('span', 'cb__top-main', `第 ${state.battle + 1} / ${BATTLES} 場`),
      el('span', 'cb__top-sub', `回合 ${state.turn}`),
      el(
        'span',
        'cb__top-sub',
        `抽牌堆 ${state.drawPile.length} · 棄牌堆 ${state.discard.length} · 消耗 ${state.exhausted.length}`,
      ),
    )

    const field = el('div', 'cb__field')
    for (const e of state.enemies) field.append(enemyEl(e))

    const p = state.player
    const bottom = el('div', 'cb__bottom')
    const player = el('div', 'cb__player')
    if (shake === 'player') {
      player.classList.add('is-shake')
      shake = ''
    }
    const pbar = el('div', 'cb__bar')
    const pfill = el('div', 'cb__bar-fill is-player')
    pfill.style.width = `${(100 * p.hp) / p.maxHp}%`
    pbar.append(pfill, el('span', 'cb__bar-text', `${p.hp} / ${p.maxHp}`))
    const ptags = el('div', 'cb__tags')
    if (p.block > 0) ptags.append(el('span', 'cb__tag is-block', `格擋 ${p.block}`))
    if (p.strength > 0) ptags.append(el('span', 'cb__tag is-buff', `力量 ${p.strength}`))
    if (p.vulnerable > 0) ptags.append(el('span', 'cb__tag is-debuff', `易傷 ${p.vulnerable}`))
    const energy = el('div', 'cb__energy', `${state.energy}/${ENERGY_PER_TURN}`)
    player.append(el('div', 'cb__name', '你'), pbar, ptags)
    const endButton = Button({
      label: busy ? '敵人行動中…' : '結束回合',
      onClick: () => onEndTurn(),
      disabled: !myTurn,
    })
    bottom.append(player, energy, endButton)

    const hand = el('div', 'cb__hand')
    state.hand.forEach((id, i) => {
      hand.append(
        cardEl(id, {
          index: i,
          playable: myTurn && canPlay(state, i),
          selected: selected === i,
          onClick: () => onCardClick(i),
        }),
      )
    })
    const hint = el('p', 'cb__hint')
    hint.textContent = selected >= 0 ? '再點一隻敵人來出牌（Esc 取消）' : ''

    root.append(top, field, hint, bottom, hand)

    if (rewards && state.phase === 'reward') {
      const overlay = el('div', 'cb__reward')
      const box = el('div', 'cb__reward-box')
      box.append(el('h2', 'cb__reward-title', '勝利！選一張新牌加入牌組'))
      const row = el('div', 'cb__reward-row')
      for (const id of rewards) row.append(cardEl(id, { onClick: () => pickReward(id) }))
      box.append(
        row,
        el('p', 'cb__reward-note', `戰鬥結束恢復 10 點生命。目前牌組 ${state.deck.length} 張。`),
      )
      box.append(
        Button({ label: '略過（不拿牌）', variant: 'secondary', onClick: () => pickReward(null) }),
      )
      overlay.append(box)
      root.append(overlay)
    }

    flushPops()
  }

  function flushPops(): void {
    const rr = root.getBoundingClientRect()
    pops.forEach((pop, k) => {
      const target = root.querySelector<HTMLElement>(pop.selector)
      if (!target) return
      const r = target.getBoundingClientRect()
      const span = el('span', `cb__pop ${pop.cls}`, pop.text)
      span.style.left = `${r.left - rr.left + r.width / 2}px`
      span.style.top = `${r.top - rr.top + r.height * 0.3 + k * 14}px`
      root.append(span)
      later(900, () => span.remove())
    })
    pops = []
  }

  cleanup = () => {
    timers.forEach((id) => window.clearTimeout(id))
    timers.clear()
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  showMenu()
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
