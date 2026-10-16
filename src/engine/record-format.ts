/**
 * รูปแบบไฟล์บันทึกเกม — ใช้ร่วมกันทั้งฝั่งเบราว์เซอร์ (src/engine/records.ts)
 * และฝั่ง dev server ที่เขียนไฟล์ลงดิสก์ (records-server.ts) ห้ามแตะ DOM ในนี้
 *
 * เก็บแค่ "ตาเดินล้วนๆ" (เส้นทางของแต่ละตา ในพิกัดของกระดานที่เห็นบนจอ
 * ซึ่งมิเรอร์แล้ว) ไม่เก็บคำวิเคราะห์ เพราะคำวิเคราะห์อ่านออกจากกระดานได้
 * ทั้งหมด ตอนเปิดดูก็แค่เล่นไล่ใหม่ (ดู `replayPlies` ใน match.ts)
 */

import { BLACK, SIZE, WHITE, type Side } from '../game/board'

export interface MatchRecord {
  v: 1
  /** เป็นชื่อไฟล์ด้วย: records/<id>.json */
  id: string
  startedAt: number
  updatedAt: number
  firstMover: Side
  /** เส้นทางของแต่ละตา: [จาก, กลาง..., ถึง] */
  moves: number[][]
  /** null = เกมยังไม่จบตอนบันทึกล่าสุด (เช่นปิดหน้าไปกลางเกม) */
  result: string | null
}

/** id กลายเป็นชื่อไฟล์ จึงต้องไม่มี / หรือ .. ให้หลุดออกนอกโฟลเดอร์ได้ */
export const isRecordId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id)

const pad = (n: number) => String(n).padStart(2, '0')

/** อ่านออกด้วยตาและเรียงตามเวลาเองเมื่อเรียงชื่อไฟล์ เช่น 20261016-195512-k3f9 */
export function newRecordId(t = Date.now()): string {
  const d = new Date(t)
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${date}-${time}-${Math.random().toString(36).slice(2, 6)}`
}

export function recordFileName(rec: MatchRecord): string {
  return `makhos-${rec.id}.json`
}

/**
 * อ่านไฟล์ที่ส่งออกไป — รับได้ทั้งเกมเดียวและ array หลายเกม
 * ตรวจแค่รูปร่างตรงนี้ ส่วนความถูกกติกาของแต่ละตาไปตรวจตอนเล่นไล่ใหม่
 */
export function parseRecords(json: string): MatchRecord[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('ไฟล์นี้ไม่ใช่ JSON')
  }
  const list = Array.isArray(data) ? data : [data]
  if (!list.length || !list.every(isRecord)) throw new Error('ไฟล์นี้ไม่ใช่บันทึกเกมหมากฮอสของแอปนี้')
  return list
}

export function isRecord(x: unknown): x is MatchRecord {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return (
    r.v === 1 &&
    typeof r.id === 'string' &&
    isRecordId(r.id) &&
    typeof r.startedAt === 'number' &&
    typeof r.updatedAt === 'number' &&
    (r.firstMover === BLACK || r.firstMover === WHITE) &&
    (r.result === null || typeof r.result === 'string') &&
    Array.isArray(r.moves) &&
    r.moves.every(
      (m) =>
        Array.isArray(m) &&
        m.length >= 2 &&
        m.every((i) => Number.isInteger(i) && i >= 0 && i < SIZE),
    )
  )
}
