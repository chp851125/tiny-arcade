import type { Random } from '../../shared/random.ts'

export const CODE_LENGTH = 4
export const MAX_GUESSES = 10

/** 產生不重複的四位數字答案（可以 0 開頭） */
export function createSecret(rng: Random): string {
  return rng
    .shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    .slice(0, CODE_LENGTH)
    .join('')
}

export interface Hint {
  /** 數字和位置都對 */
  a: number
  /** 數字對但位置不對 */
  b: number
}

/** 比對猜測與答案（兩者都是不重複的四位數字） */
export function judge(secret: string, guess: string): Hint {
  let a = 0
  let b = 0
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) a += 1
    else if (secret.includes(guess[i] ?? '')) b += 1
  }
  return { a, b }
}

export function hasDuplicate(code: string): boolean {
  return new Set(code).size !== code.length
}
