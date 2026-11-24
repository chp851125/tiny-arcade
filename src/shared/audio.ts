export type SoundName = 'click' | 'score' | 'success' | 'fail' | 'explosion' | 'jump'

/** 全站音量，保守設定 */
const MASTER_VOLUME = 0.25

let context: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let unlockBound = false

/** 第一次使用者互動後才建立 AudioContext（瀏覽器規定） */
function ensureContext(): AudioContext | null {
  if (context) return context
  const Ctor = window.AudioContext
  context = new Ctor()
  master = context.createGain()
  master.gain.value = muted ? 0 : MASTER_VOLUME
  master.connect(context.destination)
  return context
}

/** 綁定一次性的互動監聽，第一次點擊或按鍵時初始化並解除暫停 */
export function initAudio(): void {
  if (unlockBound) return
  unlockBound = true
  const unlock = (): void => {
    const ctx = ensureContext()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export function isMuted(): boolean {
  return muted
}

/** 全站靜音開關 */
export function setMuted(value: boolean): void {
  muted = value
  if (master) master.gain.value = muted ? 0 : MASTER_VOLUME
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

interface ToneOptions {
  type: OscillatorType
  from: number
  to: number
  start: number
  duration: number
  volume: number
}

function tone(ctx: AudioContext, o: ToneOptions): void {
  if (!master) return
  const t0 = ctx.currentTime + o.start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = o.type
  osc.frequency.setValueAtTime(o.from, t0)
  if (o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.duration)
  gain.gain.setValueAtTime(o.volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + o.duration)
  osc.connect(gain).connect(master)
  osc.start(t0)
  osc.stop(t0 + o.duration + 0.02)
}

function noise(ctx: AudioContext, duration: number, volume: number): void {
  if (!master) return
  const length = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1800, ctx.currentTime)
  filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  src.connect(filter).connect(gain).connect(master)
  src.start()
}

/** 播放音效；尚未互動、已靜音或瀏覽器不支援時不做事 */
export function playSound(name: SoundName): void {
  if (muted || !context || context.state !== 'running') return
  const ctx = context
  switch (name) {
    case 'click':
      tone(ctx, { type: 'square', from: 700, to: 500, start: 0, duration: 0.05, volume: 0.5 })
      break
    case 'score':
      tone(ctx, { type: 'square', from: 660, to: 660, start: 0, duration: 0.07, volume: 0.5 })
      tone(ctx, { type: 'square', from: 990, to: 990, start: 0.07, duration: 0.1, volume: 0.5 })
      break
    case 'success':
      ;[523, 659, 784, 1047].forEach((f, i) =>
        tone(ctx, {
          type: 'triangle',
          from: f,
          to: f,
          start: i * 0.1,
          duration: 0.18,
          volume: 0.6,
        }),
      )
      break
    case 'fail':
      ;[400, 320, 240].forEach((f, i) =>
        tone(ctx, {
          type: 'sawtooth',
          from: f,
          to: f * 0.9,
          start: i * 0.14,
          duration: 0.2,
          volume: 0.4,
        }),
      )
      break
    case 'explosion':
      noise(ctx, 0.5, 0.9)
      tone(ctx, { type: 'sine', from: 140, to: 40, start: 0, duration: 0.4, volume: 0.8 })
      break
    case 'jump':
      tone(ctx, { type: 'square', from: 300, to: 700, start: 0, duration: 0.12, volume: 0.4 })
      break
  }
}
