import './dialog.css'

export interface DialogOptions {
  title: string
  content: Array<Node | string>
  /** 按鈕列，通常放 Button */
  actions?: HTMLElement[]
}

export interface DialogHandle {
  element: HTMLElement
  open: () => void
  close: () => void
}

/** 建立對話框（含遮罩）；open 時掛到 body，close 時移除 */
export function Dialog(options: DialogOptions): DialogHandle {
  const overlay = document.createElement('div')
  overlay.className = 'ui-dialog-overlay'

  const box = document.createElement('div')
  box.className = 'ui-dialog'
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'true')

  const title = document.createElement('h2')
  title.className = 'ui-dialog__title'
  title.textContent = options.title

  const body = document.createElement('div')
  body.className = 'ui-dialog__body'
  body.append(...options.content)

  box.append(title, body)
  if (options.actions && options.actions.length > 0) {
    const actions = document.createElement('div')
    actions.className = 'ui-dialog__actions'
    actions.append(...options.actions)
    box.append(actions)
  }
  overlay.append(box)

  return {
    element: overlay,
    open: () => document.body.append(overlay),
    close: () => overlay.remove(),
  }
}
