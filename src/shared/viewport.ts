export interface ViewportOptions {
  /** 邏輯解析度寬 */
  width: number
  /** 邏輯解析度高 */
  height: number
  /** 畫布外框背景色（等比縮放後留白處），預設透明 */
  background?: string
}

export interface Viewport {
  canvas: HTMLCanvasElement
  /** 已套好縮放的 2D context，直接用邏輯座標繪製 */
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** 把滑鼠事件座標轉成邏輯座標 */
  toLogical: (clientX: number, clientY: number) => { x: number; y: number }
  /** 重設 transform 並清空整張畫布 */
  clear: () => void
  destroy: () => void
}

/** 在容器中建立等比縮放置中的 canvas，處理高 DPI 並隨容器大小即時重算 */
export function createViewport(container: HTMLElement, options: ViewportOptions): Viewport {
  const { width, height } = options

  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.left = '50%'
  canvas.style.top = '50%'
  canvas.style.display = 'block'
  if (options.background) canvas.style.background = options.background

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法取得 2D context')

  // 容器必須是定位基準
  const prevPosition = container.style.position
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  container.append(canvas)

  let scale = 1

  const resize = (): void => {
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    scale = Math.min(rect.width / width, rect.height / height)
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = `${width * scale}px`
    canvas.style.height = `${height * scale}px`
    canvas.style.transform = 'translate(-50%, -50%)'
    canvas.width = Math.round(width * scale * dpr)
    canvas.height = Math.round(height * scale * dpr)
    // 邏輯座標 -> 實際像素
    const k = (width * scale * dpr) / width
    ctx.setTransform(k, 0, 0, k, 0, 0)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  // devicePixelRatio 改變（縮放視窗、換螢幕）時也要重算
  window.addEventListener('resize', resize)
  resize()

  return {
    canvas,
    ctx,
    width,
    height,
    toLogical: (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height,
      }
    },
    clear: () => {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    },
    destroy: () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      canvas.remove()
      container.style.position = prevPosition
    },
  }
}
