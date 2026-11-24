import './tag.css'

/** 建立標籤 */
export function Tag(text: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.className = 'ui-tag'
  el.textContent = text
  return el
}
