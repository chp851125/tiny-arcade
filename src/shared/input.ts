/** 會造成頁面捲動的按鍵，需要 preventDefault */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])

export interface Input {
  /** 該鍵目前是否按住（code 例如 'ArrowLeft'、'KeyW'、'Space'） */
  isDown: (code: string) => boolean
  /** 自上次呼叫 endFrame 以來，該鍵是否剛被按下（只算第一次，不含長按重複） */
  wasPressed: (code: string) => boolean
  /** 每個更新週期結束時呼叫，清掉 wasPressed 的記錄 */
  endFrame: () => void
  /** 移除所有監聽 */
  destroy: () => void
}

/** 鍵盤輸入；失焦時清除所有按下狀態 */
export function createInput(target: Window = window): Input {
  const down = new Set<string>()
  const pressed = new Set<string>()

  const onKeyDown = (e: KeyboardEvent): void => {
    if (SCROLL_KEYS.has(e.code)) e.preventDefault()
    if (e.repeat) return
    if (!down.has(e.code)) pressed.add(e.code)
    down.add(e.code)
  }
  const onKeyUp = (e: KeyboardEvent): void => {
    down.delete(e.code)
  }
  const clear = (): void => {
    down.clear()
    pressed.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', clear)

  return {
    isDown: (code) => down.has(code),
    wasPressed: (code) => pressed.has(code),
    endFrame: () => pressed.clear(),
    destroy: () => {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', clear)
      clear()
    },
  }
}
