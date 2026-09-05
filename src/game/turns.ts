/**
 * แตกตาเดินทั้งตา (รวมกินหลายต่อ) จากตำแหน่งหนึ่ง
 * พอร์ตมาจาก makhosbot/infer.py เฉพาะส่วนที่ใช้จริง
 */

import { Board } from './board'

export interface Turn {
  /** ช่องที่ตัวหมากผ่าน: [จาก, กลาง..., ถึง] */
  path: number[]
  /** ข้อความสถานะกระดานหลังจบตา */
  text: string
  /** ช่องของหมากที่ถูกกินในตานี้ */
  captures: number[]
}

/**
 * ตาเดินที่ถูกกติกาทั้งหมดจากตำแหน่งนี้ — กินต่อได้จะไล่ให้จบเป็นตาเดียว
 */
export function fullTurns(board: Board, limit = 4000): Turn[] {
  const results: Turn[] = []

  const walk = (b: Board, path: number[], caps: number[]): void => {
    if (results.length >= limit) return
    for (const mv of b.moves.slice()) {
      const nb = b.copy()
      const done = nb.makeMove(mv.frm, mv.to)
      const ncaps = mv.cap !== -1 ? [...caps, mv.cap] : caps
      if (done) results.push({ path: [...path, mv.to], text: nb.text(), captures: ncaps })
      else walk(nb, [...path, mv.to], ncaps)
    }
  }

  for (const mv of board.moves.slice()) {
    const nb = board.copy()
    const done = nb.makeMove(mv.frm, mv.to)
    const caps = mv.cap !== -1 ? [mv.cap] : []
    if (done) results.push({ path: [mv.frm, mv.to], text: nb.text(), captures: caps })
    else walk(nb, [mv.frm, mv.to], caps)
  }
  return results
}

/**
 * หาตาที่พา `before` ไปเป็น `afterText`
 *
 * เอนจินบอกแค่ต้นทาง/ปลายทาง + ช่องที่กิน ซึ่งไม่พอจะรู้ว่ากระโดดทางไหนบ้าง
 * ฟังก์ชันนี้กู้เส้นทางกลับมา
 */
export function turnForResult(before: Board, afterText: string): Turn | null {
  return fullTurns(before).find((t) => t.text === afterText) ?? null
}
