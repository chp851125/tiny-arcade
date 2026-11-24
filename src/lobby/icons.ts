/**
 * 遊戲圖示：用簡單幾何圖形畫成 SVG（viewBox 48×48）。
 * class a = 主色、w = 白、k = 墨色；線條與外框由 lobby.css 統一。
 */
const ICONS: Record<string, string> = {
  tictactoe:
    '<path d="M18 7v34M30 7v34M7 18h34M7 30h34" fill="none"/><path d="M9 9l7 7M16 9l-7 7" fill="none"/><circle cx="36" cy="36" r="4" class="a"/>',
  'guess-number':
    '<circle cx="9" cy="24" r="5" class="a"/><circle cx="20" cy="24" r="5" class="w"/><circle cx="31" cy="24" r="5" class="k"/><path d="M6 38h36" fill="none"/>',
  'memory-match':
    '<rect x="5" y="9" width="17" height="26" rx="3" class="a"/><rect x="26" y="13" width="17" height="26" rx="3" class="w" transform="rotate(8 34 26)"/><circle cx="34" cy="26" r="4" class="a"/>',
  '2048':
    '<rect x="6" y="6" width="16" height="16" rx="3" class="a"/><rect x="26" y="6" width="16" height="16" rx="3" class="w"/><rect x="6" y="26" width="16" height="16" rx="3" class="w"/><rect x="26" y="26" width="16" height="16" rx="3" class="k"/>',
  minesweeper:
    '<path d="M24 5v38M5 24h38M11 11l26 26M37 11L11 37" fill="none"/><circle cx="24" cy="24" r="11" class="k"/><circle cx="20" cy="20" r="3" class="w"/>',
  sudoku:
    '<rect x="6" y="6" width="36" height="36" rx="3" class="w"/><path d="M18 6v36M30 6v36M6 18h36M6 30h36" fill="none"/><rect x="18" y="18" width="12" height="12" class="a"/><rect x="6" y="6" width="12" height="12" class="a"/>',
  'link-up':
    '<rect x="5" y="5" width="14" height="14" rx="3" class="a"/><rect x="29" y="29" width="14" height="14" rx="3" class="a"/><path d="M19 12h10v24h0" fill="none"/>',
  'match-three':
    '<circle cx="12" cy="34" r="8" class="a"/><circle cx="24" cy="22" r="8" class="a"/><circle cx="36" cy="34" r="8" class="a"/><path d="M12 34h24" fill="none"/>',
  sokoban:
    '<rect x="6" y="14" width="26" height="26" rx="3" class="a"/><path d="M6 14l26 26M32 14L6 40" fill="none"/><circle cx="38" cy="10" r="5" class="w"/>',
  snake:
    '<path d="M8 38h24V24H14V10h26" fill="none" class="thick"/><circle cx="40" cy="10" r="5" class="a"/><circle cx="41" cy="9" r="1.2" class="k"/>',
  pong: '<rect x="5" y="12" width="6" height="22" rx="2" class="a"/><rect x="37" y="16" width="6" height="22" rx="2" class="w"/><circle cx="24" cy="24" r="4" class="k"/>',
  breakout:
    '<rect x="5" y="6" width="12" height="7" class="a"/><rect x="18" y="6" width="12" height="7" class="w"/><rect x="31" y="6" width="12" height="7" class="a"/><rect x="5" y="14" width="12" height="7" class="w"/><rect x="31" y="14" width="12" height="7" class="w"/><circle cx="24" cy="30" r="3" class="k"/><rect x="14" y="40" width="20" height="4" rx="2" class="a"/>',
  tetris:
    '<rect x="6" y="8" width="12" height="12" class="a"/><rect x="18" y="8" width="12" height="12" class="a"/><rect x="30" y="8" width="12" height="12" class="a"/><rect x="18" y="20" width="12" height="12" class="a"/><rect x="6" y="32" width="12" height="10" class="w"/>',
  'space-invaders':
    '<path d="M10 14h28v14H10zM6 22h4v10H6zM38 22h4v10h-4zM16 28v8M32 28v8" class="a"/><rect x="16" y="18" width="5" height="5" class="k"/><rect x="27" y="18" width="5" height="5" class="k"/>',
  pacman:
    '<path d="M24 24L40 14A18 18 0 1 0 40 34Z" class="a"/><circle cx="24" cy="14" r="2.5" class="k"/>',
  'reaction-test': '<path d="M27 4L10 27h12l-3 17 19-25H26z" class="a"/>',
  'whack-a-mole':
    '<ellipse cx="24" cy="38" rx="17" ry="6" class="k"/><path d="M13 36a11 12 0 0 1 22 0z" class="a"/><circle cx="20" cy="29" r="1.6" class="k"/><circle cx="28" cy="29" r="1.6" class="k"/>',
  flappy:
    '<rect x="32" y="4" width="10" height="16" class="w"/><rect x="32" y="30" width="10" height="14" class="w"/><circle cx="16" cy="25" r="9" class="a"/><circle cx="19" cy="22" r="2" class="k"/><path d="M24 26l7 2-7 3z" class="w"/>',
  'catch-fruit':
    '<circle cx="24" cy="12" r="7" class="a"/><path d="M8 28h32l-5 14H13z" class="w"/>',
  'endless-runner':
    '<rect x="8" y="14" width="14" height="14" rx="2" class="a"/><path d="M4 40h40" fill="none"/><path d="M28 40l5-10 5 10zM37 40l4-8 4 8z" class="k"/>',
  'tower-defense':
    '<path d="M14 42V18h-4V8h6v4h4V8h8v4h4V8h6v10h-4v24z" class="a"/><path d="M20 42v-9a4 4 0 0 1 8 0v9" class="k"/>',
  roguelike:
    '<path d="M36 5l7 7-22 22-7-7z" class="w"/><path d="M14 27l7 7-6 4-5-5z" class="a"/><path d="M8 40l-3 3" fill="none"/>',
  'card-battle':
    '<rect x="6" y="10" width="20" height="28" rx="3" class="w" transform="rotate(-10 16 24)"/><rect x="22" y="10" width="20" height="28" rx="3" class="a" transform="rotate(10 32 24)"/>',
  'bullet-hell':
    '<path d="M24 28l8 14H16z" class="a"/><circle cx="12" cy="10" r="3.5" class="w"/><circle cx="24" cy="8" r="3.5" class="w"/><circle cx="36" cy="14" r="3.5" class="w"/><circle cx="17" cy="20" r="3.5" class="k"/><circle cx="31" cy="22" r="3.5" class="k"/>',
  demo: '<rect x="8" y="8" width="32" height="32" rx="3" class="a"/><circle cx="24" cy="24" r="8" class="w"/><circle cx="24" cy="24" r="2.5" class="k"/>',
}

const FALLBACK = '<circle cx="24" cy="24" r="14" class="a"/>'

/** 建立某款遊戲的圖示 SVG（內容為靜態字串，不含使用者輸入） */
export function createIcon(id: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('class', 'lobby-icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = ICONS[id] ?? FALLBACK
  return svg
}
