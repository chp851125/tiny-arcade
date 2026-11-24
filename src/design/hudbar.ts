import './hudbar.css'

export interface HudBarOptions {
  title: string
  /** 中間狀態文字（分數、時間等） */
  status?: string
  /** 右側按鈕插槽（回大廳、靜音等） */
  actions?: HTMLElement[]
}

export interface HudBarHandle {
  element: HTMLElement
  setStatus: (text: string) => void
}

/** 建立遊戲頂部資訊列：左標題、中間狀態、右按鈕 */
export function HudBar(options: HudBarOptions): HudBarHandle {
  const el = document.createElement('div')
  el.className = 'ui-hudbar'

  const title = document.createElement('div')
  title.className = 'ui-hudbar__title'
  title.textContent = options.title

  const status = document.createElement('div')
  status.className = 'ui-hudbar__status'
  status.textContent = options.status ?? ''

  const actions = document.createElement('div')
  actions.className = 'ui-hudbar__actions'
  if (options.actions) actions.append(...options.actions)

  el.append(title, status, actions)
  return {
    element: el,
    setStatus: (text) => {
      status.textContent = text
    },
  }
}
