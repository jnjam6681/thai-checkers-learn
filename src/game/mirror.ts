/**
 * หมุนกระดาน 180 องศาแล้วสลับสี
 *
 * hosbase ล็อกไว้ว่าฝ่ายดำเดินก่อนเสมอ เปลี่ยนไม่ได้ แต่ตำแหน่งตั้งต้นของ
 * หมากฮอสสมมาตร เกม "ขาวเดินก่อน" จึงเป็นภาพหมุน 180 องศาของเกม
 * "ดำเดินก่อน" พอดี — ไม่ใช่การแกล้งเปลี่ยนป้ายชื่อ แต่เป็นเกมเดียวกันจริงๆ
 *
 * การหมุน 180 องศาคือ (คอลัมน์, แถว) -> (7-คอลัมน์, 7-แถว) ซึ่งบนเลขช่องของ
 * เราคือ i -> 31-i พอดี และแมปช่องทึบไปเป็นช่องทึบเสมอ
 */

import { EMPTY, SIZE, other } from './board'
import type { Turn } from './turns'

export const flipSquare = (i: number) => SIZE - 1 - i

const swapPiece = (ch: string) =>
  ch === 'w' ? 'b' : ch === 'b' ? 'w' : ch === 'W' ? 'B' : ch === 'B' ? 'W' : EMPTY

export function mirrorText(text: string): string {
  let out = ''
  for (let i = SIZE - 1; i >= 0; i--) out += swapPiece(text[i])
  return out + other(text[SIZE])
}

export function mirrorTurn(t: Turn): Turn {
  return {
    path: t.path.map(flipSquare),
    text: mirrorText(t.text),
    captures: t.captures.map(flipSquare),
  }
}
