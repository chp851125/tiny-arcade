import './lobby.css'
import { Card, Stars, Tag } from '../design/index.ts'
import { accentFromHue, games } from '../games/registry.ts'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../games/types.ts'
import type { GameCategory, GameMeta } from '../games/types.ts'
import { createIcon } from './icons.ts'

type Filter = 'all' | GameCategory

/** 目前選的分頁，只存在記憶體（回到大廳時保留） */
let currentFilter: Filter = 'all'

/** 標題每個字母的色相 */
const LOGO_HUES = [355, 25, 50, 150, 200, 280, 340, 40, 190, 10]

function createLogo(): HTMLElement {
  const h1 = document.createElement('h1')
  h1.className = 'lobby-logo'
  h1.setAttribute('aria-label', 'TINYARCADE')
  'TINYARCADE'.split('').forEach((char, i) => {
    const span = document.createElement('span')
    span.textContent = char
    span.setAttribute('aria-hidden', 'true')
    span.style.setProperty('--c', accentFromHue(LOGO_HUES[i % LOGO_HUES.length] ?? 0))
    h1.append(span)
  })
  return h1
}

function createGameCard(meta: GameMeta, index: number): HTMLElement {
  const ready = meta.status === 'ready'

  const icon = document.createElement('div')
  icon.className = 'lobby-card__icon'
  icon.append(createIcon(meta.id))

  const name = document.createElement('h3')
  name.className = 'lobby-card__name'
  name.textContent = meta.name

  const head = document.createElement('div')
  head.className = 'lobby-card__head'
  const titleBox = document.createElement('div')
  titleBox.append(name, Stars(meta.difficulty))
  head.append(icon, titleBox)

  const tags = document.createElement('div')
  tags.className = 'lobby-card__tags'
  tags.append(Tag(CATEGORY_LABELS[meta.category]))
  if (meta.id === 'demo') tags.append(Tag('範例'))

  const controls = document.createElement('p')
  controls.className = 'lobby-card__controls'
  controls.textContent = meta.controls

  const children: Node[] = [head, tags, controls]
  if (!ready) {
    const badge = document.createElement('span')
    badge.className = 'lobby-card__badge'
    badge.textContent = 'COMING SOON'
    tags.append(badge)
  }

  const card = Card({
    children,
    onClick: ready
      ? () => {
          location.hash = `#/g/${meta.id}`
        }
      : undefined,
  })
  card.classList.add('lobby-card')
  card.style.setProperty('--accent', meta.accent)
  card.style.setProperty('--i', String(index))
  if (!ready) {
    card.classList.add('is-soon')
    card.setAttribute('aria-disabled', 'true')
  }
  return card
}

/** 顯示大廳；回傳清除函式 */
export function mountLobby(container: HTMLElement): () => void {
  const root = document.createElement('main')
  root.className = 'lobby'

  const header = document.createElement('header')
  header.className = 'lobby-header'
  const tagline = document.createElement('p')
  tagline.className = 'lobby-tagline'
  tagline.textContent = '單機小遊戲合集，打開就能玩，不用註冊。'
  header.append(createLogo(), tagline)

  const tabs = document.createElement('div')
  tabs.className = 'lobby-tabs'
  tabs.setAttribute('role', 'tablist')

  const grid = document.createElement('div')
  grid.className = 'lobby-grid'

  const footer = document.createElement('footer')
  footer.className = 'lobby-footer'
  footer.textContent = 'TINYARCADE · 純前端單機遊戲 · 分數只在當次遊戲顯示，不會被儲存'

  const tabButtons = new Map<Filter, HTMLButtonElement>()
  const filters: Filter[] = ['all', ...CATEGORY_ORDER]

  const renderGrid = (): void => {
    const list = currentFilter === 'all' ? games : games.filter((g) => g.category === currentFilter)
    grid.replaceChildren(...list.map((meta, i) => createGameCard(meta, i)))
    tabButtons.forEach((button, filter) => {
      const selected = filter === currentFilter
      button.classList.toggle('is-active', selected)
      button.setAttribute('aria-selected', String(selected))
    })
  }

  filters.forEach((filter) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lobby-tab'
    button.setAttribute('role', 'tab')
    button.textContent = filter === 'all' ? '全部' : CATEGORY_LABELS[filter]
    button.addEventListener('click', () => {
      currentFilter = filter
      renderGrid()
    })
    tabButtons.set(filter, button)
    tabs.append(button)
  })

  renderGrid()
  root.append(header, tabs, grid, footer)
  container.replaceChildren(root)
  return () => container.replaceChildren()
}
