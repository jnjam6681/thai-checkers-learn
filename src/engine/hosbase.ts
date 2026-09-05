/**
 * ไคลเอนต์ของเอนจิน "Future" บน hosbase.com
 *
 * โปรโตคอล (ถอดจาก js/control_*.js ของเว็บ hosbase, ผ่าน makhosbot/engine.py):
 *
 *  * WebSocket ที่ wss://hosthai.zapto.org:2218/forevers/ และต้องส่ง header
 *    `Origin: https://hosbase.com` — เบราว์เซอร์ตั้งเองไม่ได้ เลยวิ่งผ่าน proxy
 *    ของ vite (ดู vite.config.ts)
 *  * ทุกเฟรมที่ส่ง = <client-id 22 หลัก><payload> โดย client-id คือรหัสประจำเกม
 *  * เปิดเกม: payload "W" หรือ "B" = สีที่ *ไคลเอนต์* ถือ เอนจินถืออีกสี
 *  * ตาเดินของไคลเอนต์: บอกเฉพาะช่องที่เปลี่ยน ช่องละ 2 หลัก
 *        v = (i ถ้าไคลเอนต์เป็นขาว, ไม่งั้น 31 - i) + (32 ถ้าช่องนั้นเดิมเป็นหมากของเอนจิน)
 *  * เอนจินตอบด้วยรหัสแบบเดียวกัน (p = v % 32, พลิกเป็น 31 - p เมื่อไคลเอนต์เป็นขาว,
 *    v >= 32 คือหมากของ *ไคลเอนต์* ที่ถูกกิน) หรือ "OD" (ขอเสมอ) / "NB"
 *
 * สังเกตว่าขาส่งกับขารับพลิกเลขคนละเงื่อนไข — เว็บจริงทำแบบนี้ และเซิร์ฟเวอร์
 * คาดหวังแบบนี้
 */

import { Board, SIZE, WHITE, other, type Side } from '../game/board'
import { turnForResult, type Turn } from '../game/turns'

export const OFFER_DRAW = 'OD'
export const NEW_AS_BLACK = 'NB'

export class EngineError extends Error {}
/** เซิร์ฟเวอร์ไล่เรากลับ — ปกติเพราะเปิดเกมถี่เกินไป */
export class EngineRefused extends EngineError {}

export interface EngineMove {
  frm: number
  to: number
  caps: number[]
  /** เส้นทางที่กู้กลับมาได้ ใช้ป้อนต่อให้อีกเอนจินและใช้วาดบนจอ */
  turn: Turn
  /** กระดานก่อนเดิน */
  before: Board
}

export type EngineReply = EngineMove | typeof OFFER_DRAW | typeof NEW_AS_BLACK

export const isEngineMove = (r: EngineReply): r is EngineMove => typeof r !== 'string'

// ---------------------------------------------------------------------------
// เพดานการใช้งาน
//
// hosbase เป็นบริการฟรีของคนคนเดียว คนเล่นจริงเปิดเกมไม่กี่เกมต่อชั่วโมง
// ตัวเลขพวกนี้บังคับให้ไคลเอนต์อัตโนมัติอยู่ในรูปแบบเดียวกัน ไม่ว่าโค้ดข้างบน
// จะสั่งอะไรมา — เก็บลง localStorage ด้วย รีโหลดหน้าเว็บก็ไม่รีเซ็ตตัวนับ
// ---------------------------------------------------------------------------

export const MIN_GAP = 5_000 // มิลลิวินาที ระหว่างการเปิดเกมใหม่
export const MAX_PER_HOUR = 40 // เพดานเกมใหม่ในหนึ่งชั่วโมงแบบเลื่อนหน้าต่าง
export const MIN_SEND_GAP = 400 // มิลลิวินาที ระหว่างเฟรมที่ส่งออกทุกชนิด

const STORE_KEY = 'hosbase.opened'

function loadOpened(): number[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    const now = Date.now()
    return arr.filter((t): t is number => typeof t === 'number' && now - t < 3_600_000)
  } catch {
    return []
  }
}

function saveOpened(list: number[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list))
  } catch {
    /* โหมดส่วนตัวบางตัวเขียนไม่ได้ ไม่เป็นไร */
  }
}

/** เหลือโควตาเปิดเกมอีกกี่เกมในชั่วโมงนี้ */
export function quotaLeft(): number {
  return Math.max(0, MAX_PER_HOUR - loadOpened().length)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let lastConnect = 0
let lastSend = 0
/** ทุกการส่งเรียงคิวกันหมด กันไม่ให้สองเอนจินยิงพร้อมกัน */
let chain: Promise<unknown> = Promise.resolve()

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.catch(() => {})
  return run
}

function engineUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/hosbase`
}

/**
 * หน้าตาของเอนจินเท่าที่ `Match` ใช้ — แยกไว้เป็น interface เพื่อให้เทสต์
 * เสียบเอนจินปลอมที่เดินเองในเครื่องเข้าไปได้ ไม่ต้องยิง hosbase จริง
 */
export interface EngineLike {
  readonly clientSide: Side
  readonly engineSide: Side
  connect(): Promise<void>
  start(): Promise<EngineReply | null>
  playClientMove(squares: number[]): Promise<EngineReply>
  close(): void
}

export class HosbaseEngine implements EngineLike {
  readonly clientSide: Side
  readonly engineSide: Side
  board = new Board()

  private ws: WebSocket | null = null
  private cid = ''
  private sentText: string | null = null
  private waiters: { resolve: (s: string) => void; reject: (e: Error) => void }[] = []
  private closedError: Error | null = null

  /**
   * `clientSide` คือสีที่ *เรา* ป้อนตาเดินให้ เอนจินจะเล่นอีกสีหนึ่ง
   * นั่นคือสีที่เราอยากได้ตาเดินจากมัน
   */
  constructor(clientSide: Side, readonly timeout = 60_000) {
    this.clientSide = clientSide
    this.engineSide = other(clientSide)
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // ---------- การเชื่อมต่อ ----------

  async connect(): Promise<void> {
    const opened = loadOpened()
    if (opened.length >= MAX_PER_HOUR) {
      const oldest = Math.min(...opened)
      throw new EngineRefused(
        `เปิดเกมบน hosbase เกิน ${MAX_PER_HOUR} เกมต่อชั่วโมงไม่ได้ — เปิดไปแล้ว ` +
          `${opened.length} เกม เกมเก่าสุดเมื่อ ${Math.floor((Date.now() - oldest) / 60000)} นาทีที่แล้ว ` +
          `ถ้ามีอะไรวนซ้ำอยู่ให้แก้ตรงนั้น อย่าดันเพดานขึ้น`,
      )
    }
    const wait = MIN_GAP - (Date.now() - lastConnect)
    if (wait > 0) await sleep(wait)
    lastConnect = Date.now()
    opened.push(lastConnect)
    saveOpened(opened)

    const ws = new WebSocket(engineUrl())
    this.ws = ws
    this.closedError = null

    ws.onmessage = (ev) => {
      const w = this.waiters.shift()
      if (w) w.resolve(String(ev.data))
    }
    ws.onclose = (ev) => {
      const err =
        ev.code === 1008
          ? new EngineRefused(
              'hosbase ปิดการเชื่อมต่อด้วย policy violation — มันไล่ไคลเอนต์ที่เปิดเกมถี่เกินไป รอสักพักแล้วค่อยลองใหม่',
            )
          : new EngineError(`หลุดจากเอนจิน (code ${ev.code})`)
      this.closedError = err
      this.ws = null
      for (const w of this.waiters.splice(0)) w.reject(err)
    }

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onFail = () => {
        cleanup()
        reject(
          new EngineRefused(
            'hosbase ไม่ยอมเปิดเกมให้ — รอสักพัก การเปิดเกมติดๆ กันจะโดนปฏิเสธ ' +
              '(ถ้าเพิ่งเปิดหน้าเว็บ ตรวจว่ารันผ่าน `npm run dev` เพื่อให้ proxy ทำงาน)',
          ),
        )
      }
      const cleanup = () => {
        ws.removeEventListener('open', onOpen)
        ws.removeEventListener('error', onFail)
        ws.removeEventListener('close', onFail)
      }
      ws.addEventListener('open', onOpen)
      ws.addEventListener('error', onFail)
      ws.addEventListener('close', onFail)
    })

    this.cid = String(Date.now()) + String(Math.floor(Math.random() * 1e9)).padStart(9, '0')
    this.board = new Board()
    this.sentText = null
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  // ---------- โปรโตคอล ----------

  private exchange(payload: string): Promise<string> {
    return serialize(async () => {
      const ws = this.ws
      if (ws === null || ws.readyState !== WebSocket.OPEN) {
        throw this.closedError ?? new EngineError('ยังไม่ได้เชื่อมต่อ')
      }
      const gap = MIN_SEND_GAP - (Date.now() - lastSend)
      if (gap > 0) await sleep(gap)
      lastSend = Date.now()

      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = this.waiters.findIndex((w) => w.resolve === resolve)
          if (idx !== -1) this.waiters.splice(idx, 1)
          reject(new EngineError('เอนจินไม่ตอบภายในเวลาที่กำหนด'))
        }, this.timeout)
        const wrapped = {
          resolve: (s: string) => {
            clearTimeout(timer)
            resolve(s)
          },
          reject: (e: Error) => {
            clearTimeout(timer)
            reject(e)
          },
        }
        this.waiters.push(wrapped)
        ws.send(this.cid + payload)
      })
    })
  }

  /** diff ของกระดานก่อน/หลังตาเดินของไคลเอนต์ */
  private encodeOurMove(): string {
    if (this.sentText === null) throw new EngineError('ยังไม่มีสถานะตั้งต้น')
    const before = this.sentText
    const after = this.board.text()
    let out = ''
    for (let i = 0; i < SIZE; i++) {
      if (before[i] === after[i]) continue
      let v = this.clientSide === WHITE ? i : SIZE - 1 - i
      if (before[i].toUpperCase() === this.engineSide) v += SIZE
      out += String(Math.floor(v / 10)) + String(v % 10)
    }
    return out
  }

  private decodeEngineMove(msg: string): { frm: number; to: number; caps: number[] } {
    let frm = -1
    let to = -1
    const caps: number[] = []
    for (let k = 0; k + 1 < msg.length; k += 2) {
      const v = Number(msg.slice(k, k + 2))
      if (!Number.isFinite(v)) throw new EngineError(`อ่านคำตอบของเอนจินไม่ออก: ${msg}`)
      let p = v % SIZE
      if (this.clientSide === WHITE) p = SIZE - 1 - p
      if (v >= SIZE) caps.push(p)
      else if (this.board.pieces[p] !== ' ') frm = p
      else to = p
    }
    return { frm, to, caps }
  }

  private async talk(payload: string): Promise<EngineReply> {
    const reply = await this.exchange(payload)
    if (reply === OFFER_DRAW || reply === NEW_AS_BLACK) {
      this.sentText = this.board.text()
      return reply
    }
    const before = this.board.copy()
    const { frm, to, caps } = this.decodeEngineMove(reply)
    this.board.makeMoves(frm, to, caps)
    const turn = turnForResult(before, this.board.text())
    if (turn === null) {
      throw new EngineError(
        `ตาเดินของเอนจิน ${frm}->${to} caps=[${caps}] ไม่ถูกกติกาในตำแหน่งนี้ (คำตอบดิบ ${reply})`,
      )
    }
    this.sentText = this.board.text()
    return { frm, to, caps, turn, before }
  }

  // ---------- API ----------

  /**
   * เปิดเกมใหม่
   *
   * คืนตาแรกของเอนจินเมื่อเอนจินเป็นฝ่ายเดินก่อน (คือเราป้อนขาว) ไม่งั้นคืน null
   * — หมากฮอสไทยฝ่ายดำเดินก่อน พอเราป้อนดำ เซิร์ฟเวอร์แค่ตอบ "NB" แล้วรอ
   */
  async start(): Promise<EngineReply | null> {
    if (this.clientSide === WHITE) return this.talk('W')
    const reply = await this.exchange('B')
    if (reply !== NEW_AS_BLACK) throw new EngineError(`คำตอบตอนเปิดเกมผิดรูป: ${reply}`)
    this.board = new Board()
    this.sentText = this.board.text()
    return null
  }

  /** ป้อนหนึ่งตาเต็มของ clientSide ([จาก, กลาง..., ถึง]) แล้วรับตาตอบของเอนจิน */
  async playClientMove(squares: number[]): Promise<EngineReply> {
    this.board.applyMoveSequence(squares)
    return this.talk(this.encodeOurMove())
  }
}
