import './button.css'

export type ButtonVariant = 'primary' | 'secondary'

export interface ButtonOptions {
  label: string
  variant?: ButtonVariant
  onClick?: (event: MouseEvent) => void
  disabled?: boolean
}

/** 建立按鈕，預設為 primary */
export function Button(options: ButtonOptions): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `ui-button ui-button--${options.variant ?? 'primary'}`
  el.textContent = options.label
  el.disabled = options.disabled ?? false
  if (options.onClick) el.addEventListener('click', options.onClick)
  return el
}
