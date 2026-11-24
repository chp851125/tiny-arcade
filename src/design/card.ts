import './card.css'

export interface CardOptions {
  children?: Array<Node | string>
  /** 有給 onClick 時，卡片會變成可點擊（button） */
  onClick?: (event: MouseEvent) => void
}

/** 建立卡片；可點擊時 hover 會浮起 */
export function Card(options: CardOptions = {}): HTMLElement {
  const clickable = options.onClick !== undefined
  const el: HTMLElement = document.createElement(clickable ? 'button' : 'div')
  el.className = clickable ? 'ui-card ui-card--clickable' : 'ui-card'
  if (el instanceof HTMLButtonElement) el.type = 'button'
  if (options.children) el.append(...options.children)
  if (options.onClick) el.addEventListener('click', options.onClick)
  return el
}
