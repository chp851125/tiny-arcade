import type { GameCategory, GameMeta, GameModule } from './types.ts'

/** 由色相產生主色；同分類內只微調色相 */
export function accentFromHue(hue: number): string {
  return `hsl(${hue} 78% 62%)`
}

/** 建立一款遊戲的資料；預設是可玩（ready），尚未開發的才傳 'soon' */
function game(
  id: string,
  name: string,
  category: GameCategory,
  difficulty: GameMeta['difficulty'],
  controls: string,
  hue: number,
  status: GameMeta['status'] = 'ready',
): GameMeta {
  return { id, name, category, difficulty, controls, accent: accentFromHue(hue), status }
}

/** 所有遊戲的資料；新增遊戲 = 在這裡加一筆，並在 loaders 接上 */
export const games: readonly GameMeta[] = [
  // 益智（藍綠）
  game('tictactoe', '井字棋', 'puzzle', 1, '滑鼠點擊，Esc 暫停', 210),
  game('guess-number', '猜數字 1A2B', 'puzzle', 2, '鍵盤輸入數字，Esc 暫停', 204),
  game('memory-match', '記憶翻牌', 'puzzle', 2, '滑鼠點擊，Esc 暫停', 198),
  game('2048', '2048', 'puzzle', 3, '方向鍵或 WASD，Esc 暫停', 192),
  game('minesweeper', '踩地雷', 'puzzle', 3, '左鍵翻開、右鍵插旗，Esc 暫停', 186),
  game('sudoku', '數獨', 'puzzle', 4, '滑鼠選格、鍵盤填數字，右鍵寫小字', 180),
  game('link-up', '連連看', 'puzzle', 2, '滑鼠點擊，Esc 暫停', 174),
  game('match-three', '三消', 'puzzle', 2, '滑鼠拖曳或點選，Esc 暫停', 168),
  game('sokoban', '推箱子', 'puzzle', 4, '方向鍵或 WASD，Z 復原，R 重來', 162),
  // 經典街機（紅橘）
  game('snake', '貪食蛇', 'arcade', 2, '方向鍵或 WASD，Esc 暫停', 355),
  game('pong', '乒乓', 'arcade', 2, 'W / S 或上下鍵，Esc 暫停', 2),
  game('breakout', '打磚塊', 'arcade', 3, '左右鍵或滑鼠，空白鍵發球', 10),
  game('tetris', '俄羅斯方塊', 'arcade', 4, '方向鍵、空白鍵直落、C 暫存', 18),
  game('space-invaders', '太空侵略者', 'arcade', 3, '左右鍵移動、自動射擊', 25),
  game('pacman', '小精靈', 'arcade', 4, '方向鍵或 WASD，Esc 暫停', 32),
  // 反應（黃粉）
  game('reaction-test', '反應速度測試', 'reflex', 1, '滑鼠點擊或空白鍵', 52),
  game('whack-a-mole', '打地鼠', 'reflex', 2, '滑鼠點擊，Esc 暫停', 46),
  game('flappy', 'Flappy', 'reflex', 4, '空白鍵、↑ 或滑鼠點擊', 340),
  game('catch-fruit', '接水果', 'reflex', 2, '左右鍵或滑鼠', 332),
  game('endless-runner', '無盡跑酷', 'reflex', 3, '空白鍵跳躍（按住跳更高）、↓ 蹲下', 326),
  // 冒險策略（紫青）
  game('tower-defense', '塔防', 'adventure', 4, '滑鼠蓋塔、數字鍵選塔', 282),
  game('roguelike', 'Roguelike 地牢', 'adventure', 5, '方向鍵移動攻擊、數字鍵用道具', 270),
  game('card-battle', '卡牌戰鬥', 'adventure', 4, '滑鼠點牌出牌、數字鍵快捷', 200),
  game('bullet-hell', '彈幕射擊', 'adventure', 5, '方向鍵移動、Shift 慢速、Space 炸彈', 186),
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
  'space-invaders': () => import('./space-invaders/index.ts'),
  pacman: () => import('./pacman/index.ts'),
  'reaction-test': () => import('./reaction-test/index.ts'),
  'whack-a-mole': () => import('./whack-a-mole/index.ts'),
  flappy: () => import('./flappy/index.ts'),
  'catch-fruit': () => import('./catch-fruit/index.ts'),
  'endless-runner': () => import('./endless-runner/index.ts'),
  'tower-defense': () => import('./tower-defense/index.ts'),
  roguelike: () => import('./roguelike/index.ts'),
  'card-battle': () => import('./card-battle/index.ts'),
  'bullet-hell': () => import('./bullet-hell/index.ts'),
}

/** 載入遊戲模組；尚未開發的遊戲會拋錯 */
export function loadGame(id: string): Promise<GameModule> {
  const loader = loaders[id]
  if (!loader) return Promise.reject(new Error(`遊戲尚未開放：${id}`))
  return loader()
}
