/**
 * ที่เก็บบันทึกเกมฝั่งเบราว์เซอร์ — ตัวจริงเป็นไฟล์ในโฟลเดอร์ records/ ของ
 * โปรเจกต์ เขียนผ่าน /api/records ของ dev server (ดู records-server.ts)
 *
 * React อ่านจาก `cache` ในหน่วยความจำแบบ synchronous การเขียนอัปเดต cache
 * ทันทีแล้วค่อยส่งไปเขียนไฟล์ตามหลัง เรียงคิวทีละคำขอ — บันทึกเกมเดียวกันถูก
 * เขียนทุกตา ถ้ายิงพร้อมกันแล้วตัวเก่าไปถึงทีหลัง ไฟล์จะย้อนกลับไปตาก่อนหน้า
 *
 * นอกเบราว์เซอร์ (เทสต์) ไม่มี server ให้คุย เก็บในหน่วยความจำอย่างเดียว
 */

import { isRecord, type MatchRecord } from './record-format'

export { newRecordId, parseRecords, recordFileName, type MatchRecord } from './record-format'

const API = '/api/records'
/** ที่เก็บเดิมก่อนย้ายมาเป็นไฟล์ — เจอแล้วย้ายขึ้นไฟล์ให้ครั้งเดียว */
const LEGACY_KEY = 'makhos.records.v1'

/**
 * `loading` ยังโหลดรายการไม่เสร็จ, `ok` เขียนไฟล์ได้, `error` คุยกับ server
 * ไม่ได้ (เช่นเปิดไฟล์จาก dist ตรงๆ) — เกมที่เล่นตอนนี้จะอยู่แค่ในหน้านี้
 */
export type StoreStatus = { state: 'loading' | 'ok' } | { state: 'error'; message: string }

let cache: MatchRecord[] = []
let status: StoreStatus = { state: 'loading' }
const listeners = new Set<() => void>()
const inBrowser = typeof window !== 'undefined'

const byNewest = (a: MatchRecord, b: MatchRecord) => b.startedAt - a.startedAt

function emit(): void {
  for (const fn of listeners) fn()
}

function setCache(list: MatchRecord[]): void {
  cache = list.sort(byNewest)
  emit()
}

function setStatus(s: StoreStatus): void {
  status = s
  emit()
}

// ---------- ให้ React อ่าน ----------

export const subscribeRecords = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** ใหม่สุดก่อน — คืน array ตัวเดิมจนกว่าจะมีการเขียน (useSyncExternalStore ต้องการแบบนี้) */
export const listRecords = (): MatchRecord[] => cache

export const recordsStatus = (): StoreStatus => status

// ---------- คุยกับ server ----------

let queue: Promise<unknown> = Promise.resolve()

/** เข้าคิวเรียงกันทีละคำขอ ผิดพลาดก็ไปต่อคำขอถัดไปได้ */
function enqueue(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job).then(
    () => {
      if (status.state === 'error') setStatus({ state: 'ok' })
    },
    (e: unknown) => setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) }),
  )
  queue = run
  return run
}

async function request(method: string, id?: string, body?: unknown): Promise<Response> {
  const res = await fetch(id ? `${API}/${encodeURIComponent(id)}` : API, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`เขียนไฟล์บันทึกไม่ได้ (${res.status} ${await res.text()})`)
  return res
}

const put = (rec: MatchRecord) => enqueue(async () => void (await request('PUT', rec.id, rec)))

async function init(): Promise<void> {
  try {
    const res = await request('GET')
    const data: unknown = await res.json()
    const onDisk = Array.isArray(data) ? data.filter(isRecord) : []
    // เกมที่บันทึกระหว่างรอโหลด (ใน cache) ใหม่กว่าของบนดิสก์เสมอ
    const merged = new Map(onDisk.map((r) => [r.id, r]))
    for (const r of cache) merged.set(r.id, r)
    const legacy = readLegacy()
    for (const r of legacy) {
      if (!merged.has(r.id)) {
        merged.set(r.id, r)
        void put(r)
      }
    }
    setCache([...merged.values()])
    setStatus({ state: 'ok' })
    // ลบของเดิมเมื่อทุกเกมขึ้นไฟล์ได้แล้วเท่านั้น
    if (legacy.length) {
      void queue.then(() => {
        if (status.state === 'ok') localStorage.removeItem(LEGACY_KEY)
      })
    }
  } catch (e) {
    setStatus({
      state: 'error',
      message:
        'ติดต่อ server ไม่ได้ บันทึกลงไฟล์ไม่ได้ — ต้องเปิดผ่าน npm run dev หรือ npm run preview ' +
        `(${e instanceof Error ? e.message : String(e)})`,
    })
  }
}

function readLegacy(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(isRecord) : []
  } catch {
    return []
  }
}

if (inBrowser) void init()
else status = { state: 'ok' }

// ---------- เขียน ----------

export function saveRecord(rec: MatchRecord): void {
  setCache([rec, ...cache.filter((r) => r.id !== rec.id)])
  if (inBrowser) void put(rec)
}

export function deleteRecord(id: string): void {
  setCache(cache.filter((r) => r.id !== id))
  if (inBrowser) void enqueue(async () => void (await request('DELETE', id)))
}
