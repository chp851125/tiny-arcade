import type { GameCategory, GameMeta, GameModule } from './types.ts'

/** 由色相產生主色；同分類內只微調色相 */
export function accentFromHue(hue: number): string {
  return `hsl(${hue} 78% 62%)`
}

function soon(
  id: string,
  name: string,
  category: GameCategory,
  difficulty: GameMeta['difficulty'],
  controls: string,
  hue: number,
): GameMeta {
  return { id, name, category, difficulty, controls, accent: accentFromHue(hue), status: 'soon' }
}

/** 所有遊戲的資料；新增遊戲 = 把 status 改 ready，並在 loaders 接上 */
export const games: readonly GameMeta[] = [
  // 益智（藍綠）
  { ...soon('tictactoe', '井字棋', 'puzzle', 1, '滑鼠點擊，Esc 暫停', 210), status: 'ready' },
  {
    ...soon('guess-number', '猜數字 1A2B', 'puzzle', 2, '鍵盤輸入數字，Esc 暫停', 204),
    status: 'ready',
  },
  { ...soon('memory-match', '記憶翻牌', 'puzzle', 2, '滑鼠點擊，Esc 暫停', 198), status: 'ready' },
  { ...soon('2048', '2048', 'puzzle', 3, '方向鍵或 WASD，Esc 暫停', 192), status: 'ready' },
  {
    ...soon('minesweeper', '踩地雷', 'puzzle', 3, '左鍵翻開、右鍵插旗，Esc 暫停', 186),
    status: 'ready',
  },
  {
    ...soon('sudoku', '數獨', 'puzzle', 4, '滑鼠選格、鍵盤填數字，右鍵寫小字', 180),
    status: 'ready',
  },
  { ...soon('link-up', '連連看', 'puzzle', 2, '滑鼠點擊，Esc 暫停', 174), status: 'ready' },
  { ...soon('match-three', '三消', 'puzzle', 2, '滑鼠拖曳或點選，Esc 暫停', 168), status: 'ready' },
  {
    ...soon('sokoban', '推箱子', 'puzzle', 4, '方向鍵或 WASD，Z 復原，R 重來', 162),
    status: 'ready',
  },
  // 經典街機（紅橘）
  { ...soon('snake', '貪食蛇', 'arcade', 2, '方向鍵或 WASD，Esc 暫停', 355), status: 'ready' },
  { ...soon('pong', '乒乓', 'arcade', 2, 'W / S 或上下鍵，Esc 暫停', 2), status: 'ready' },
  { ...soon('breakout', '打磚塊', 'arcade', 3, '左右鍵或滑鼠，空白鍵發球', 10), status: 'ready' },
  {
    ...soon('tetris', '俄羅斯方塊', 'arcade', 4, '方向鍵、空白鍵直落、C 暫存', 18),
    status: 'ready',
  },
  soon('space-invaders', '太空侵略者', 'arcade', 3, '左右鍵、空白鍵', 25),
  soon('pacman', '小精靈', 'arcade', 4, '方向鍵', 32),
  // 反應（黃粉）
  soon('reaction-test', '反應速度測試', 'reflex', 1, '滑鼠點擊', 52),
  soon('whack-a-mole', '打地鼠', 'reflex', 2, '滑鼠點擊', 46),
  soon('flappy', 'Flappy', 'reflex', 4, '空白鍵', 340),
  soon('catch-fruit', '接水果', 'reflex', 2, '左右鍵', 332),
  soon('endless-runner', '無盡跑酷', 'reflex', 3, '空白鍵跳躍', 326),
  // 冒險策略（紫青）
  soon('tower-defense', '塔防', 'adventure', 4, '滑鼠點擊', 282),
  soon('roguelike', 'Roguelike 地牢', 'adventure', 5, '方向鍵、數字鍵', 270),
  soon('card-battle', '卡牌戰鬥', 'adventure', 4, '滑鼠點擊', 200),
  soon('bullet-hell', '彈幕射擊', 'adventure', 5, '方向鍵、Shift 慢速', 186),
  // 範例遊戲，只用來驗證框架
  {
    id: 'demo',
    name: '點方塊',
    category: 'reflex',
    difficulty: 1,
    controls: '滑鼠點擊方塊，Esc 暫停',
    accent: accentFromHue(40),
    status: 'ready',
  },
]

export function getGameMeta(id: string): GameMeta | undefined {
  return games.find((g) => g.id === id)
}

/** 各遊戲的動態載入；每款遊戲會分開打包 */
const loaders: Record<string, () => Promise<GameModule>> = {
  demo: () => import('./demo/index.ts'),
  tictactoe: () => import('./tictactoe/index.ts'),
  'guess-number': () => import('./guess-number/index.ts'),
  'memory-match': () => import('./memory-match/index.ts'),
  '2048': () => import('./2048/index.ts'),
  minesweeper: () => import('./minesweeper/index.ts'),
  sudoku: () => import('./sudoku/index.ts'),
  'link-up': () => import('./link-up/index.ts'),
  'match-three': () => import('./match-three/index.ts'),
  sokoban: () => import('./sokoban/index.ts'),
  snake: () => import('./snake/index.ts'),
  pong: () => import('./pong/index.ts'),
  breakout: () => import('./breakout/index.ts'),
  tetris: () => import('./tetris/index.ts'),
}

/** 載入遊戲模組；尚未開發的遊戲會拋錯 */
export function loadGame(id: string): Promise<GameModule> {
  const loader = loaders[id]
  if (!loader) return Promise.reject(new Error(`遊戲尚未開放：${id}`))
  return loader()
}
