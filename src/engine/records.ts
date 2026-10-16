/**
 * บันทึกเกมที่เล่นไปแล้ว ไว้เปิดดูย้อนหลังโดยไม่ต้องต่อ hosbase
 *
 * เก็บแค่ "ตาเดินล้วนๆ" (เส้นทางของแต่ละตา ในพิกัดของกระดานที่เห็นบนจอ
 * ซึ่งมิเรอร์แล้ว) ไม่เก็บคำวิเคราะห์ เพราะคำวิเคราะห์อ่านออกจากกระดานได้
 * ทั้งหมด ตอนเปิดดูก็แค่เล่นไล่ใหม่ (ดู `replayPlies` ใน match.ts) — บันทึก
 * หนึ่งเกมจึงเหลือไม่กี่ KB และตรวจได้ด้วยว่าทุกตาถูกกติกาจริง
 *
 * ที่เก็บคือ localStorage ของเบราว์เซอร์ อยู่เครื่องเดียว ถ้าจะย้ายเครื่อง
 * ใช้ปุ่มส่งออก/นำเข้าไฟล์ .json แทน
 */

import { BLACK, SIZE, WHITE, type Side } from '../game/board'

export interface MatchRecord {
  v: 1
  id: string
  startedAt: number
  updatedAt: number
  firstMover: Side
  /** เส้นทางของแต่ละตา: [จาก, กลาง..., ถึง] */
  moves: number[][]
  /** null = เกมยังไม่จบตอนบันทึกล่าสุด (เช่นปิดหน้าไปกลางเกม) */
  result: string | null
}

const STORE_KEY = 'makhos.records.v1'
/** เก่ากว่านี้ทิ้ง กันพื้นที่ localStorage เต็ม (เกมยาวๆ ก็แค่ราวๆ 2 KB) */
export const MAX_RECORDS = 200

let cache: MatchRecord[] | null = null
const listeners = new Set<() => void>()

function load(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(isRecord) : []
  } catch {
    return []
  }
}

function persist(list: MatchRecord[]): void {
  cache = list
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list))
  } catch {
    /* โหมดส่วนตัวหรือพื้นที่เต็ม — ยังดูได้จนกว่าจะปิดหน้า */
  }
  for (const fn of listeners) fn()
}

// ---------- ให้ React อ่าน ----------

export const subscribeRecords = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** ใหม่สุดก่อน — คืน array ตัวเดิมจนกว่าจะมีการเขียน (useSyncExternalStore ต้องการแบบนี้) */
export const listRecords = (): MatchRecord[] => (cache ??= load())

// ---------- เขียน ----------

export function saveRecord(rec: MatchRecord): void {
  const rest = listRecords().filter((r) => r.id !== rec.id)
  persist([rec, ...rest].sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_RECORDS))
}

export function deleteRecord(id: string): void {
  persist(listRecords().filter((r) => r.id !== id))
}

export const newRecordId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ---------- ไฟล์ ----------

export function recordFileName(rec: MatchRecord): string {
  const d = new Date(rec.startedAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `makhos-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
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

function isRecord(x: unknown): x is MatchRecord {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return (
    r.v === 1 &&
    typeof r.id === 'string' &&
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
