/**
 * 共用圖案庫：每個圖案有固定的形狀與顏色，不會出現「同形狀不同顏色」，
 * 讓玩家光看形狀就能分辨。順序依辨識度排列，前面的比較好認。
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

interface SymbolDef {
  name: string
  /** viewBox 0 0 100 100 內的 SVG 內容 */
  shape: string
}

const SHAPES: readonly SymbolDef[] = [
  { name: '圓', shape: '<circle cx="50" cy="50" r="32"/>' },
  { name: '方', shape: '<rect x="20" y="20" width="60" height="60" rx="6"/>' },
  { name: '三角', shape: '<path d="M50 16L86 80H14Z"/>' },
  {
    name: '星',
    shape: '<path d="M50 12L61 38L89 41L68 60L75 88L50 73L25 88L32 60L11 41L39 38Z"/>',
  },
  { name: '菱形', shape: '<path d="M50 12L86 50L50 88L14 50Z"/>' },
  {
    name: '愛心',
    shape:
      '<path d="M50 84C8 54 16 18 38 18C46 18 50 26 50 30C50 26 54 18 62 18C84 18 92 54 50 84Z"/>',
  },
  { name: '十字', shape: '<path d="M38 14H62V38H86V62H62V86H38V62H14V38H38Z"/>' },
  { name: '月亮', shape: '<path d="M62 12A38 38 0 1 0 88 62A30 30 0 0 1 62 12Z"/>' },
  { name: '六角', shape: '<path d="M30 16H70L90 50L70 84H30L10 50Z"/>' },
  { name: '五角', shape: '<path d="M50 12L90 42L75 88H25L10 42Z"/>' },
  { name: '閃電', shape: '<path d="M60 10L24 56H46L38 90L76 40H54Z"/>' },
  {
    name: '水滴',
    shape: '<path d="M50 10C50 10 20 46 20 64A30 30 0 0 0 80 64C80 46 50 10 50 10Z"/>',
  },
  {
    name: '圓環',
    shape: '<path fill-rule="evenodd" d="M50 16A34 34 0 1 0 50.1 16ZM50 36A14 14 0 1 1 49.9 36Z"/>',
  },
  { name: '倒三角', shape: '<path d="M50 84L86 20H14Z"/>' },
  { name: '箭頭', shape: '<path d="M12 38H54V18L90 50L54 82V62H12Z"/>' },
  { name: '房子', shape: '<path d="M50 12L90 46H80V88H20V46H10Z"/>' },
  { name: '葉子', shape: '<path d="M16 84C14 40 40 14 88 12C88 58 62 88 16 84Z"/>' },
  {
    name: '鈴鐺',
    shape:
      '<path d="M50 12C34 12 28 28 28 46C28 62 20 68 16 78H84C80 68 72 62 72 46C72 28 66 12 50 12ZM40 82H60A10 10 0 0 1 40 82Z"/>',
  },
  { name: '魚', shape: '<path d="M10 50C28 22 58 22 72 42L92 26V74L72 58C58 78 28 78 10 50Z"/>' },
  { name: '旗子', shape: '<path d="M22 12H30V90H22ZM30 16H84L68 38L84 60H30Z"/>' },
  { name: '皇冠', shape: '<path d="M12 78L16 30L38 54L50 20L62 54L84 30L88 78Z"/>' },
  {
    name: '杯子',
    shape: '<path d="M20 18H80L72 62C70 74 60 80 50 80C40 80 30 74 28 62ZM42 80H58V90H42Z"/>',
  },
  {
    name: '音符',
    shape: '<path d="M36 14H80V66A16 16 0 1 1 70 52V34H48V72A16 16 0 1 1 36 58Z"/>',
  },
  {
    name: '雲',
    shape: '<path d="M26 74A18 18 0 0 1 28 38A24 24 0 0 1 74 34A20 20 0 0 1 74 74Z"/>',
  },
  { name: '圓頂', shape: '<path d="M10 72A40 40 0 0 1 90 72Z"/>' },
  {
    name: '盾牌',
    shape: '<path d="M50 12L86 24V50C86 70 68 84 50 90C32 84 14 70 14 50V24Z"/>',
  },
  {
    name: 'X',
    shape: '<path d="M26 12L50 36L74 12L88 26L64 50L88 74L74 88L50 64L26 88L12 74L36 50L12 26Z"/>',
  },
]

const COLORS = [
  '#ff6b5e',
  '#4aa3ff',
  '#ffc933',
  '#2fb67c',
  '#b36bff',
  '#ff9a3c',
  '#3fd0d0',
  '#ff7ab8',
  '#a0673a',
]

/** 可用的圖案數量 */
export const SYMBOL_COUNT = SHAPES.length

/** 第 index 個圖案（從 0 開始）的顏色；同一個圖案永遠同一個顏色 */
export function symbolColor(index: number): string {
  return COLORS[index % COLORS.length] ?? '#888888'
}

/** 建立第 index 個圖案的 SVG（填色已設好，外框由呼叫端的 CSS 決定） */
export function createSymbolSvg(index: number, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  svg.style.fill = symbolColor(index)
  svg.innerHTML = SHAPES[index % SHAPES.length]?.shape ?? ''
  return svg
}
