import type { Input } from '../shared/input.ts'
import type { SoundName } from '../shared/audio.ts'
import type { Viewport, ViewportOptions } from '../shared/viewport.ts'

export type GameCategory = 'puzzle' | 'arcade' | 'reflex' | 'adventure'

/** 分類的顯示名稱 */
export const CATEGORY_LABELS: Record<GameCategory, string> = {
  puzzle: '益智',
  arcade: '經典街機',
  reflex: '反應',
  adventure: '冒險策略',
}

/** 分類的顯示順序 */
export const CATEGORY_ORDER: readonly GameCategory[] = ['puzzle', 'arcade', 'reflex', 'adventure']

export interface GameMeta {
  id: string
  name: string
  category: GameCategory
  /** 難度 1~5 */
  difficulty: 1 | 2 | 3 | 4 | 5
  /** 操作提示 */
  controls: string
  /** 主色（任何 CSS 顏色字串） */
  accent: string
  /** ready 可玩；soon 尚未開發 */
  status: 'ready' | 'soon'
}

/** 遊戲可用的音效介面 */
export interface GameAudio {
  play: (name: SoundName) => void
  isMuted: () => boolean
  toggleMuted: () => boolean
}

/** 外殼提供給遊戲的工具 */
export interface GameContext {
  audio: GameAudio
  /** 鍵盤輸入；外殼會在離開時銷毀 */
  input: Input
  /** 在遊戲容器內建立等比縮放的 canvas；外殼會在離開時保底銷毀 */
  createViewport: (options: ViewportOptions) => Viewport
  exitToLobby: () => void
}

/** 每款遊戲必須匯出的介面 */
export interface GameModule {
  mount: (container: HTMLElement, ctx: GameContext) => void
  /** 必須清掉所有事件監聽、計時器與迴圈 */
  destroy: () => void
}
