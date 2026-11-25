import './reaction-test.css'
import { Button, Card, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'

/** 反應速度測試：畫面變綠的瞬間盡快點擊（或按空白鍵），測 5 次看平均 */

const ROUNDS = 5
const MIN_WAIT_MS = 1500
const MAX_WAIT_MS = 4500

type Phase = 'idle' | 'waiting' | 'go' | 'early' | 'result' | 'summary'

let cleanup: (() => void) | null = null

function createStat(label: string): { card: HTMLElement; value: HTMLElement } {
  const name = document.createElement('span')
  name.className = 'rt__stat-label'
  name.textContent = label
  const value = document.createElement('span')
  value.className = 'rt__stat-value'
  return { card: Card({ children: [name, value] }), value }
}

/** 依平均反應時間給的評語 */
export function rate(ms: number): string {
  if (ms < 200) return '超快！職業電競等級'
  if (ms < 250) return '很快，反應比多數人好'
  if (ms < 300) return '不錯，在一般水準'
  if (ms < 400) return '普通，再練練會更快'
  return '有點慢，專心盯著畫面試試'
}

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let phase: Phase = 'idle'
  let times: number[] = []
  let lastMs = 0
  let goAt = 0
  let waitTimer = 0
  let frame = 0
  let paused = false
  let dialog: DialogHandle | null = null

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'rt'

  const stats = document.createElement('div')
  stats.className = 'rt__stats'
  const roundStat = createStat('回合')
  const avgStat = createStat('平均')
  const bestStat = createStat('最快')
  stats.append(roundStat.card, avgStat.card, bestStat.card)

  const panel = document.createElement('button')
  panel.type = 'button'
  panel.className = 'rt__panel'
  const title = document.createElement('span')
  title.className = 'rt__title'
  const sub = document.createElement('span')
  sub.className = 'rt__sub'
  panel.append(title, sub)

  const history = document.createElement('div')
  history.className = 'rt__history'
  const slots = Array.from({ length: ROUNDS }, () => {
    const slot = document.createElement('div')
    slot.className = 'rt__slot'
    history.append(slot)
    return slot
  })

  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再測一次', onClick: () => restart() })
  const actions = document.createElement('div')
  actions.className = 'rt__actions'
  actions.append(pauseButton, againButton)

  root.append(stats, panel, history, actions)
  container.append(root)

  // --- 畫面更新 ---
  const average = (): number => Math.round(times.reduce((a, b) => a + b, 0) / (times.length || 1))

  const render = (): void => {
    panel.dataset.phase = phase
    switch (phase) {
      case 'idle':
        title.textContent = times.length === 0 ? '點一下開始' : '點一下繼續'
        sub.textContent = `畫面變綠色的瞬間，盡快點擊（或按空白鍵）。共 ${ROUNDS} 回合。`
        break
      case 'waiting':
        title.textContent = '等待變綠色…'
        sub.textContent = '還沒變色別點！'
        break
      case 'go':
        title.textContent = '現在點！'
        sub.textContent = ''
        break
      case 'early':
        title.textContent = '太早了！'
        sub.textContent = '要等變成綠色才能點。點一下再試一次。'
        break
      case 'result':
        title.textContent = `${lastMs} ms`
        sub.textContent = '點一下繼續下一回合'
        break
      case 'summary':
        title.textContent = `平均 ${average()} ms`
        sub.textContent = rate(average())
        break
    }
    roundStat.value.textContent = `${Math.min(times.length + (phase === 'summary' ? 0 : 1), ROUNDS)} / ${ROUNDS}`
    avgStat.value.textContent = times.length > 0 ? `${average()} ms` : '—'
    bestStat.value.textContent = times.length > 0 ? `${Math.min(...times)} ms` : '—'
    slots.forEach((slot, i) => {
      const t = times[i]
      slot.textContent = t === undefined ? `${i + 1}` : `${t}`
      slot.classList.toggle('is-done', t !== undefined)
      slot.classList.toggle(
        'is-best',
        t !== undefined && t === Math.min(...times) && phase === 'summary',
      )
    })
    againButton.hidden = phase !== 'summary'
    pauseButton.hidden = phase === 'summary'
  }

  // --- 流程 ---
  const clearTimers = (): void => {
    window.clearTimeout(waitTimer)
    waitTimer = 0
    cancelAnimationFrame(frame)
    frame = 0
  }

  const startWaiting = (): void => {
    phase = 'waiting'
    render()
    const delay = MIN_WAIT_MS + rng.next() * (MAX_WAIT_MS - MIN_WAIT_MS)
    waitTimer = window.setTimeout(() => {
      waitTimer = 0
      phase = 'go'
      // 先用目前時間當暫時的起點（避免沿用上一回合），畫面真的畫出來後再校正
      goAt = performance.now()
      render()
      // 等畫面真的畫出綠色之後才開始計時，量到的才是眼睛看到到按下的時間
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          goAt = performance.now()
          frame = 0
        })
      })
    }, delay)
  }

  const restart = (): void => {
    clearTimers()
    times = []
    phase = 'idle'
    render()
  }

  const onPress = (): void => {
    if (paused) return
    switch (phase) {
      case 'idle':
      case 'early':
      case 'result':
        startWaiting()
        break
      case 'waiting':
        clearTimers()
        phase = 'early'
        ctx.audio.play('fail')
        render()
        break
      case 'go': {
        const now = performance.now()
        lastMs = Math.max(1, Math.round(now - goAt))
        times.push(lastMs)
        ctx.audio.play('score')
        if (times.length >= ROUNDS) {
          phase = 'summary'
          ctx.audio.play('success')
        } else {
          phase = 'result'
        }
        render()
        break
      }
      default:
        break
    }
  }

  panel.addEventListener('mousedown', onPress)

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused || phase === 'summary') return
    // 暫停會取消目前這一回合的等待
    if (phase === 'waiting' || phase === 'go') {
      clearTimers()
      phase = 'idle'
      render()
    }
    paused = true
    dialog = Dialog({
      title: '暫停',
      content: ['休息一下，準備好再繼續。'],
      actions: [
        Button({ label: '回大廳', variant: 'secondary', onClick: () => ctx.exitToLobby() }),
        Button({
          label: '重新開始',
          variant: 'secondary',
          onClick: () => {
            closeDialog()
            restart()
          },
        }),
        Button({ label: '繼續', onClick: () => closeDialog() }),
      ],
    })
    dialog.open()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (e.repeat) return
      if (paused) closeDialog()
      else pause()
      return
    }
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault()
      onPress()
    }
  }
  window.addEventListener('keydown', onKeyDown)

  cleanup = () => {
    clearTimers()
    panel.removeEventListener('mousedown', onPress)
    window.removeEventListener('keydown', onKeyDown)
    dialog?.close()
    dialog = null
    root.remove()
  }

  render()
}

export function destroy(): void {
  cleanup?.()
  cleanup = null
}
