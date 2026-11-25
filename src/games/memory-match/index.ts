import './memory-match.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import { createSymbolSvg } from '../../shared/symbols.ts'
import type { GameContext } from '../types.ts'

/** 記憶翻牌：兩張一組翻開，相同就留下；可選三種難度（牌數不同） */

interface Level {
  id: string
  label: string
  cols: number
  rows: number
  /** 翻到不一樣的牌後，多久會蓋回去（毫秒）；越難越短 */
  hideMs: number
}

const LEVELS: readonly Level[] = [
  { id: 'easy', label: '簡單', cols: 4, rows: 3, hideMs: 1100 },
  { id: 'normal', label: '普通', cols: 6, rows: 4, hideMs: 800 },
  { id: 'hard', label: '困難', cols: 8, rows: 5, hideMs: 600 },
  { id: 'expert', label: '專家', cols: 8, rows: 6, hideMs: 450 },
]

interface Card {
  symbol: number
  open: boolean
  matched: boolean
}

let cleanup: (() => void) | null = null

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'mm__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'mm__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let level: Level = LEVELS[0] as Level
  let cards: Card[] = []
  let buttons: HTMLButtonElement[] = []
  let moves = 0
  let pairs = 0
  let picked: number[] = []
  let locked = false
  let timer = 0
  let paused = false
  let dialog: DialogHandle | null = null

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'mm'

  const levelRow = document.createElement('div')
  levelRow.className = 'mm__levels'
  const levelButtons = LEVELS.map((l) => {
    const b = Button({ label: l.label, variant: 'secondary', onClick: () => setLevel(l) })
    b.title = `${l.cols}×${l.rows}，${(l.cols * l.rows) / 2} 對，${(l.hideMs / 1000).toFixed(2)} 秒後蓋回`
    levelRow.append(b)
    return b
  })

  const stats = document.createElement('div')
  stats.className = 'mm__stats'
  const movesStat = createStat('步數')
  const pairsStat = createStat('配對')
  stats.append(movesStat.card, pairsStat.card)

  const status = document.createElement('p')
  status.className = 'mm__status'
  status.setAttribute('aria-live', 'polite')

  const boardEl = document.createElement('div')
  boardEl.className = 'mm__board'

  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const actions = document.createElement('div')
  actions.className = 'mm__actions'
  actions.append(pauseButton, againButton)

  root.append(levelRow, stats, status, boardEl, actions)
  container.append(root)

  // --- 流程 ---
  const render = (): void => {
    const total = (level.cols * level.rows) / 2
    const won = pairs === total
    cards.forEach((card, i) => {
      const b = buttons[i]
      if (!b) return
      const face = card.open || card.matched
      b.classList.toggle('is-open', face)
      b.classList.toggle('is-matched', card.matched)
      b.disabled = face
      b.replaceChildren(...(face ? [createSymbolSvg(card.symbol, 'mm__symbol')] : []))
    })
    movesStat.value.textContent = String(moves)
    pairsStat.value.textContent = `${pairs} / ${total}`
    levelButtons.forEach((b, i) => {
      b.className = `ui-button ui-button--${LEVELS[i] === level ? 'primary' : 'secondary'}`
    })
    status.textContent = won ? `全部配對完成！用了 ${moves} 步` : '翻開兩張相同的牌'
    againButton.hidden = !won
    pauseButton.hidden = won
  }

  const hidePicked = (): void => {
    window.clearTimeout(timer)
    timer = 0
    picked.forEach((i) => {
      const card = cards[i]
      if (card) card.open = false
    })
    picked = []
    locked = false
  }

  const onCardClick = (index: number): void => {
    const card = cards[index]
    if (paused || locked || !card || card.open || card.matched) return
    card.open = true
    picked.push(index)
    ctx.audio.play('click')
    if (picked.length === 2) {
      moves += 1
      const [a, b] = picked
      const first = a === undefined ? undefined : cards[a]
      const second = b === undefined ? undefined : cards[b]
      if (first && second && first.symbol === second.symbol) {
        first.matched = true
        second.matched = true
        picked = []
        pairs += 1
        ctx.audio.play(pairs === (level.cols * level.rows) / 2 ? 'success' : 'score')
      } else {
        locked = true
        timer = window.setTimeout(() => {
          hidePicked()
          render()
        }, level.hideMs)
      }
    }
    render()
  }

  const restart = (): void => {
    window.clearTimeout(timer)
    timer = 0
    const count = (level.cols * level.rows) / 2
    const order = rng.shuffle(Array.from({ length: count }, (_, i) => [i, i]).flat())
    boardEl.style.setProperty('--cols', String(level.cols))
    boardEl.style.setProperty('--rows', String(level.rows))
    buttons = order.map((_, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'mm__card'
      b.setAttribute('aria-label', `第 ${i + 1} 張牌`)
      b.addEventListener('click', () => onCardClick(i))
      return b
    })
    boardEl.replaceChildren(...buttons)
    cards = order.map((symbol) => ({ symbol, open: false, matched: false }))
    moves = 0
    pairs = 0
    picked = []
    locked = false
    render()
  }

  const setLevel = (next: Level): void => {
    if (paused) return
    level = next
    restart()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused || pairs === (level.cols * level.rows) / 2) return
    paused = true
    // 暫停時蓋回尚未配對的牌，避免偷看
    hidePicked()
    render()
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '重新開始',
          variant: 'secondary',
          onClick: () => {
            closeDialog()
            restart()
          },
        }),
        Button({ label: '繼續', onClick: () => closeDialog() }),
      ],
    })
    dialog.open()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || e.repeat) return
    if (paused) closeDialog()
    else pause()
  }
  window.addEventListener('keydown', onKeyDown)

  cleanup = () => {
    window.clearTimeout(timer)
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  restart()
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
