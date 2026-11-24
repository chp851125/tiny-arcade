import './shell.css'
import { Button, HudBar } from '../design/index.ts'
import { createInput } from '../shared/input.ts'
import { isMuted, playSound, toggleMuted } from '../shared/audio.ts'
import { createViewport } from '../shared/viewport.ts'
import type { Viewport } from '../shared/viewport.ts'
import { loadGame } from './registry.ts'
import type { GameContext, GameMeta, GameModule } from './types.ts'

function exitToLobby(): void {
  location.hash = '#/'
}

/**
 * 進入遊戲：建立容器與 HudBar，套用主色並載入、mount 遊戲。
 * 回傳的清除函式一定會呼叫 destroy 並清掉外殼建立的所有東西。
 */
export function enterGame(app: HTMLElement, meta: GameMeta): () => void {
  const shell = document.createElement('div')
  shell.className = 'game-shell'
  shell.style.setProperty('--accent', meta.accent)

  const muteButton = Button({
    label: isMuted() ? '取消靜音' : '靜音',
    variant: 'secondary',
    onClick: () => {
      muteButton.textContent = toggleMuted() ? '取消靜音' : '靜音'
    },
  })
  const backButton = Button({ label: '回大廳', onClick: exitToLobby })
  const hud = HudBar({ title: meta.name, actions: [muteButton, backButton] })

  const stage = document.createElement('div')
  stage.className = 'game-stage'
  shell.append(hud.element, stage)
  app.replaceChildren(shell)

  const input = createInput()
  const viewports: Viewport[] = []
  let mod: GameModule | null = null
  let disposed = false

  const ctx: GameContext = {
    audio: { play: playSound, isMuted, toggleMuted },
    input,
    createViewport: (options) => {
      const vp = createViewport(stage, options)
      viewports.push(vp)
      return vp
    },
    exitToLobby,
  }

  loadGame(meta.id)
    .then((loaded) => {
      // 載入期間已離開就不 mount
      if (disposed) return
      mod = loaded
      loaded.mount(stage, ctx)
    })
    .catch((error: unknown) => {
      console.error(error)
      if (!disposed) exitToLobby()
    })

  return () => {
    if (disposed) return
    disposed = true
    try {
      mod?.destroy()
    } catch (error) {
      console.error(error)
    }
    input.destroy()
    viewports.forEach((vp) => vp.destroy())
    // 保底：移除遊戲忘記關閉、掛在 body 上的對話框
    document.body.querySelectorAll(':scope > .ui-dialog-overlay').forEach((el) => el.remove())
    shell.remove()
  }
}
