export interface LoopOptions {
  /** 固定更新步長（秒），預設 1/60 */
  step?: number
  /** 切回分頁時，單幀最多累積的時間（秒），避免一次補太多更新；預設 0.25 */
  maxFrameTime?: number
  /** 固定步長的邏輯更新，dt 為步長（秒） */
  update: (dt: number) => void
  /** 繪製；alpha 為 0~1 的插值比例（目前更新到下一步的進度） */
  render: (alpha: number) => void
}

export interface Loop {
  start: () => void
  /** 停止並清掉所有監聽與排程 */
  stop: () => void
  /** 手動暫停（更新與繪製都停止） */
  pause: () => void
  resume: () => void
  readonly running: boolean
  readonly paused: boolean
}

/** 固定時間步長主迴圈；分頁隱藏或視窗失焦時自動暫停 */
export function createLoop(options: LoopOptions): Loop {
  const step = options.step ?? 1 / 60
  const maxFrameTime = options.maxFrameTime ?? 0.25

  let rafId = 0
  let running = false
  let manualPaused = false
  let autoPaused = false
  let lastTime = 0
  let accumulator = 0

  const isActive = (): boolean => running && !manualPaused && !autoPaused

  const frame = (now: number): void => {
    rafId = 0
    if (!isActive()) return
    const delta = Math.min((now - lastTime) / 1000, maxFrameTime)
    lastTime = now
    accumulator += delta
    while (accumulator >= step) {
      options.update(step)
      accumulator -= step
      if (!isActive()) return
    }
    options.render(accumulator / step)
    rafId = requestAnimationFrame(frame)
  }

  /** 依目前狀態決定要排程或取消；重新開始時重設計時基準 */
  const sync = (): void => {
    if (isActive()) {
      if (rafId === 0) {
        lastTime = performance.now()
        rafId = requestAnimationFrame(frame)
      }
    } else if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const onVisibility = (): void => {
    autoPaused = document.hidden
    sync()
  }
  const onBlur = (): void => {
    autoPaused = true
    sync()
  }
  const onFocus = (): void => {
    autoPaused = document.hidden
    sync()
  }

  return {
    start() {
      if (running) return
      running = true
      manualPaused = false
      autoPaused = document.hidden || !document.hasFocus()
      accumulator = 0
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('blur', onBlur)
      window.addEventListener('focus', onFocus)
      // 先畫出第一幀，即使一開始沒有焦點也不會是空白畫面
      options.render(0)
      sync()
    },
    stop() {
      running = false
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      sync()
    },
    pause() {
      manualPaused = true
      sync()
    },
    resume() {
      manualPaused = false
      accumulator = 0
      sync()
    },
    get running() {
      return running
    },
    get paused() {
      return manualPaused || autoPaused
    },
  }
}
