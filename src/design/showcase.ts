import './showcase.css'
import { Button, Card, Dialog, HudBar, Stars, Tag } from './index.ts'

const ACCENTS: Array<{ name: string; color: string }> = [
  { name: '橘紅', color: '#ff6b4a' },
  { name: '天藍', color: '#4aa8ff' },
  { name: '草綠', color: '#4ac96b' },
  { name: '紫色', color: '#a56bff' },
]

function section(title: string, ...children: Node[]): HTMLElement {
  const el = document.createElement('section')
  const h = document.createElement('h2')
  h.textContent = title
  const row = document.createElement('div')
  row.className = 'showcase__row'
  row.append(...children)
  el.append(h, row)
  return el
}

/** 開發用設計展示頁（#/design）；回傳清除函式 */
export function mountShowcase(container: HTMLElement): () => void {
  const root = document.createElement('main')
  root.className = 'showcase'

  const heading = document.createElement('h1')
  heading.textContent = 'DESIGN'

  // accent 切換
  const swatch = document.createElement('span')
  swatch.className = 'showcase__swatch'
  const accentButtons = ACCENTS.map((a) =>
    Button({
      label: a.name,
      variant: 'secondary',
      onClick: () => {
        root.style.setProperty('--accent', a.color)
      },
    }),
  )

  const dialog = Dialog({
    title: '暫停',
    content: ['遊戲已暫停，要繼續嗎？'],
    actions: [
      Button({ label: '回大廳', variant: 'secondary', onClick: () => dialog.close() }),
      Button({ label: '繼續', onClick: () => dialog.close() }),
    ],
  })

  root.append(
    heading,
    section('Accent 切換', swatch, ...accentButtons),
    section(
      'Button',
      Button({ label: 'Primary' }),
      Button({ label: 'Secondary', variant: 'secondary' }),
      Button({ label: 'Disabled', disabled: true }),
    ),
    section(
      'Card',
      Card({ children: ['一般卡片'] }),
      Card({ children: ['可點擊卡片（hover 看看）'], onClick: () => undefined }),
    ),
    section('Tag', Tag('益智'), Tag('動作'), Tag('單人')),
    section('Stars', Stars(1), Stars(3), Stars(5)),
    section('Dialog', Button({ label: '開啟對話框', onClick: () => dialog.open() })),
    section(
      'HudBar',
      HudBar({
        title: 'TIC TAC TOE',
        status: '分數 120',
        actions: [Button({ label: '靜音', variant: 'secondary' }), Button({ label: '回大廳' })],
      }).element,
    ),
  )

  container.replaceChildren(root)
  return () => {
    dialog.close()
    container.replaceChildren()
  }
}
