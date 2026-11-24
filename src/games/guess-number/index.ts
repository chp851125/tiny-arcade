import './guess-number.css'
import { Button, Dialog } from '../../design/index.ts'
import type { DialogHandle } from '../../design/index.ts'
import { createRandom } from '../../shared/random.ts'
import type { GameContext } from '../types.ts'
import { CODE_LENGTH, MAX_GUESSES, createSecret, hasDuplicate, judge } from './logic.ts'

/** 猜數字 1A2B：猜出不重複的四位數字，A＝位置也對，B＝只有數字對 */

let cleanup: (() => void) | null = null

export function mount(container: HTMLElement, ctx: GameContext): void {
  const rng = createRandom(Date.now())

  let secret = createSecret(rng)
  let input = ''
  let guesses: { code: string; a: number; b: number }[] = []
  let over = false
  let paused = false
  let notice = ''
  let dialog: DialogHandle | null = null

  // --- 畫面 ---
  const root = document.createElement('div')
  root.className = 'gn'

  const status = document.createElement('p')
  status.className = 'gn__status'
  status.setAttribute('aria-live', 'polite')

  const slotsEl = document.createElement('div')
  slotsEl.className = 'gn__slots'
  const slots = Array.from({ length: CODE_LENGTH }, () => {
    const slot = document.createElement('div')
    slot.className = 'gn__slot'
    slotsEl.append(slot)
    return slot
  })

  const history = document.createElement('div')
  history.className = 'gn__history'

  const pad = document.createElement('div')
  pad.className = 'gn__pad'
  for (let d = 0; d <= 9; d++) {
    pad.append(
      Button({ label: String(d), variant: 'secondary', onClick: () => addDigit(String(d)) }),
    )
  }

  const deleteButton = Button({ label: '刪除', variant: 'secondary', onClick: () => backspace() })
  const submitButton = Button({ label: '送出', onClick: () => submit() })
  const pauseButton = Button({ label: '暫停', variant: 'secondary', onClick: () => pause() })
  const againButton = Button({ label: '再來一局', onClick: () => restart() })
  const playingActions = document.createElement('div')
  playingActions.className = 'gn__actions'
  playingActions.append(deleteButton, submitButton, pauseButton)
  const overActions = document.createElement('div')
  overActions.className = 'gn__actions'
  overActions.append(againButton)

  root.append(status, slotsEl, history, pad, playingActions, overActions)
  container.append(root)

  // --- 流程 ---
  const render = (): void => {
    slots.forEach((slot, i) => {
      slot.textContent = input[i] ?? ''
      slot.classList.toggle('is-filled', i < input.length)
    })
    history.replaceChildren(
      ...guesses.map((g, i) => {
        const row = document.createElement('div')
        row.className = 'gn__row'
        const no = document.createElement('span')
        no.className = 'gn__row-no'
        no.textContent = String(i + 1)
        const code = document.createElement('span')
        code.className = 'gn__row-code'
        code.textContent = g.code
        const hint = document.createElement('span')
        hint.className = 'gn__row-hint'
        hint.textContent = `${g.a}A${g.b}B`
        row.classList.toggle('is-win', g.a === CODE_LENGTH)
        row.append(no, code, hint)
        return row
      }),
    )
    history.scrollTop = history.scrollHeight
    const last = guesses[guesses.length - 1]
    if (over) {
      status.textContent =
        last?.a === CODE_LENGTH ? `猜對了！用了 ${guesses.length} 次` : `沒機會了，答案是 ${secret}`
    } else {
      status.textContent =
        notice || `第 ${guesses.length + 1} / ${MAX_GUESSES} 次，輸入 ${CODE_LENGTH} 個不重複數字`
    }
    pad.hidden = over
    playingActions.hidden = over
    overActions.hidden = !over
  }

  const addDigit = (digit: string): void => {
    if (paused || over || input.length >= CODE_LENGTH) return
    if (input.includes(digit)) {
      notice = '數字不能重複'
    } else {
      notice = ''
      input += digit
      ctx.audio.play('click')
    }
    render()
  }

  const backspace = (): void => {
    if (paused || over) return
    notice = ''
    input = input.slice(0, -1)
    render()
  }

  const submit = (): void => {
    if (paused || over) return
    if (input.length < CODE_LENGTH || hasDuplicate(input)) {
      notice = `請輸入 ${CODE_LENGTH} 個不重複的數字`
      render()
      return
    }
    notice = ''
    const hint = judge(secret, input)
    guesses = [...guesses, { code: input, ...hint }]
    input = ''
    if (hint.a === CODE_LENGTH) {
      over = true
      ctx.audio.play('success')
    } else if (guesses.length >= MAX_GUESSES) {
      over = true
      ctx.audio.play('fail')
    } else {
      ctx.audio.play('score')
    }
    render()
  }

  const restart = (): void => {
    secret = createSecret(rng)
    input = ''
    guesses = []
    over = false
    notice = ''
    render()
  }

  const closeDialog = (): void => {
    dialog?.close()
    dialog = null
    paused = false
  }

  const pause = (): void => {
    if (paused || over) return
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
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1]
    if (digit) addDigit(digit)
    else if (e.code === 'Backspace') backspace()
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // 焦點在按鈕上時，Enter 會同時觸發按鈕點擊，這裡不重複處理
      if (!(e.target instanceof HTMLButtonElement)) submit()
    }
  }
  window.addEventListener('keydown', onKeyDown)

  cleanup = () => {
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
