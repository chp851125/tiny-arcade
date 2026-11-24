import './memory-match.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'

/** 記憶翻牌：4×4 共 8 對圖案，兩張一組翻開，相同就留下 */

const SVG_NS = 'http://www.w3.org/2000/svg'
const MISMATCH_DELAY_MS = 800

interface Symbol {
  color: string
  shape: string
}

const SYMBOLS: readonly Symbol[] = [
  { color: '#ff6b5e', shape: '<circle cx="50" cy="50" r="30"/>' },
  { color: '#4aa3ff', shape: '<rect x="22" y="22" width="56" height="56" rx="6"/>' },
  { color: '#ffc933', shape: '<path d="M50 18L84 78H16Z"/>' },
  {
    color: '#2fb67c',
    shape: '<path d="M50 14L60 40L88 42L66 60L74 86L50 70L26 86L34 60L12 42L40 40Z"/>',
  },
  { color: '#b36bff', shape: '<path d="M50 14L84 50L50 86L16 50Z"/>' },
  {
    color: '#ff7ab8',
    shape:
      '<path d="M50 82C10 52 18 20 38 20C46 20 50 28 50 32C50 28 54 20 62 20C82 20 90 52 50 82Z"/>',
  },
  { color: '#ff9a3c', shape: '<path d="M38 16H62V38H84V62H62V84H38V62H16V38H38Z"/>' },
  { color: '#3fd0d0', shape: '<path d="M62 14A38 38 0 1 0 86 62A30 30 0 0 1 62 14Z"/>' },
]

interface Card {
  symbol: number
  open: boolean
  matched: boolean
}

let cleanup: (() => void) | null = null

function createFace(symbol: Symbol): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', 'mm__symbol')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.fill = symbol.color
  svg.innerHTML = symbol.shape
  return svg
}

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

  let cards: Card[] = []
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
  const buttons = Array.from({ length: SYMBOLS.length * 2 }, (_, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'mm__card'
    b.setAttribute('aria-label', `第 ${i + 1} 張牌`)
    b.addEventListener('click', () => onCardClick(i))
    boardEl.append(b)
    return b
  })

  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const actions = document.createElement('div')
  actions.className = 'mm__actions'
  actions.append(pauseButton, againButton)

  root.append(stats, status, boardEl, actions)
  container.append(root)

  // --- 流程 ---
  const render = (): void => {
    const won = pairs === SYMBOLS.length
    cards.forEach((card, i) => {
      const b = buttons[i]
      if (!b) return
      const face = card.open || card.matched
      b.classList.toggle('is-open', face)
      b.classList.toggle('is-matched', card.matched)
      b.disabled = face
      const symbol = SYMBOLS[card.symbol]
      b.replaceChildren(...(face && symbol ? [createFace(symbol)] : []))
    })
    movesStat.value.textContent = String(moves)
    pairsStat.value.textContent = `${pairs} / ${SYMBOLS.length}`
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
        ctx.audio.play(pairs === SYMBOLS.length ? 'success' : 'score')
      } else {
        locked = true
        timer = window.setTimeout(() => {
          hidePicked()
          render()
        }, MISMATCH_DELAY_MS)
      }
    }
    render()
  }

  const restart = (): void => {
    window.clearTimeout(timer)
    timer = 0
    const order = rng.shuffle(SYMBOLS.flatMap((_, i) => [i, i]))
    cards = order.map((symbol) => ({ symbol, open: false, matched: false }))
    moves = 0
    pairs = 0
    picked = []
    locked = false
    render()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused || pairs === SYMBOLS.length) return
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
