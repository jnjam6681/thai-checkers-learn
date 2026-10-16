/**
 * จับคู่เอนจิน hosbase สองตัวให้เล่นกันเอง
 *
 * เอนจินหนึ่งการเชื่อมต่อเล่นได้สีเดียว จึงต้องเปิดสองเกม:
 *
 *   engines.W = HosbaseEngine(clientSide = B)  -> เอนจินถือขาว เราป้อนตาของดำให้
 *   engines.B = HosbaseEngine(clientSide = W)  -> เอนจินถือดำ  เราป้อนตาของขาวให้
 *
 * แล้วส่งตาของแต่ละฝ่ายข้ามไปมา หมากฮอสไทยฝ่ายดำเดินก่อน engines.B จึงเป็นคน
 * ให้ตาแรกมาตั้งแต่ตอนเปิดเกม
 *
 * `live` คือกระดานจริงของแมตช์ และต้องเป็น *ตัวเดิม* ตลอดเกม ไม่ใช่สร้างใหม่
 * จากข้อความสถานะทุกตา เพราะกติกาเสมอ (ตำแหน่งซ้ำสามครั้ง) อ่านจาก
 * `Board.history` ซึ่งจะหายไปทันทีถ้าสร้างกระดานใหม่
 */

import { BLACK, Board, INITIAL, WHITE, other, type Side } from '../game/board'
import { analyzeMove, sideName, type MoveAnalysis } from '../game/analyze'
import { flipSquare, mirrorText, mirrorTurn } from '../game/mirror'
import { fullTurns, type Turn } from '../game/turns'
import { pathName } from '../game/notation'
import {
  HosbaseEngine,
  NEW_AS_BLACK,
  OFFER_DRAW,
  isEngineMove,
  quotaLeft,
  type EngineLike,
  type EngineMove,
} from './hosbase'
import { newRecordId, saveRecord, type MatchRecord } from './records'

export interface Ply {
  n: number
  side: Side
  turn: Turn
  beforeText: string
  analysis: MoveAnalysis
}

/** `replay` = เปิดดูเกมที่บันทึกไว้ ไม่มีการต่อเน็ต */
export type Phase = 'idle' | 'connecting' | 'ready' | 'thinking' | 'over' | 'error' | 'replay'

export interface MatchState {
  phase: Phase
  plies: Ply[]
  /** ตาที่กำลังดูอยู่: -1 = ตำแหน่งเริ่มเกม, ไม่งั้นคือ index ใน plies */
  viewIndex: number
  message: string
  error: string | null
  result: string | null
  quota: number
  /** เดินมากี่ตาแล้วโดยไม่มีการกินและไม่มีใครขึ้นฮอส */
  noProgress: number
  /** ฝ่ายที่เดินก่อนในเกมที่กำลังเล่นอยู่ */
  firstMover: Side
  /** บันทึกที่กำลังเปิดดูอยู่ (เฉพาะ phase `replay`) */
  replay: MatchRecord | null
}

/**
 * เพดานของเราเอง ไม่ใช่กติกาหมากฮอส — กันเกมที่เอนจินสองตัวเดินวนกันไม่จบ
 * โดยที่ตำแหน่งไม่ซ้ำเป๊ะจนเข้าเงื่อนไขเสมอสามครั้ง
 */
export const NO_PROGRESS_LIMIT = 60

const START: MatchState = {
  phase: 'idle',
  plies: [],
  viewIndex: -1,
  message: 'กด “เริ่มเกม” เพื่อเปิดเกมกับ hosbase สองเกม — ฝ่ายละหนึ่งเกม',
  error: null,
  result: null,
  quota: 0,
  noProgress: 0,
  firstMover: BLACK,
  replay: null,
}

function makePly(n: number, before: Board, turn: Turn): Ply {
  return { n, side: before.side, turn, beforeText: before.text(), analysis: analyzeMove(before, turn) }
}

const progressed = (p: Ply) => p.turn.captures.length > 0 || p.analysis.promoted

/**
 * เล่นบันทึกไล่ใหม่ตั้งแต่ต้นเกม ได้คำวิเคราะห์กลับมาครบเหมือนตอนเล่นจริง
 * และตรวจไปด้วยว่าทุกตาถูกกติกา — บันทึกที่เสียหรือถูกแก้มือจะโยน error
 */
export function replayPlies(firstMover: Side, moves: number[][]): { plies: Ply[]; noProgress: number } {
  const board = new Board(firstMover === WHITE ? mirrorText(INITIAL) : INITIAL)
  const plies: Ply[] = []
  let noProgress = 0
  for (const path of moves) {
    const before = new Board(board.text())
    const turn = fullTurns(before).find(
      (t) => t.path.length === path.length && t.path.every((x, k) => x === path[k]),
    )
    if (!turn) {
      throw new Error(`ตาที่ ${plies.length + 1} (${pathName(path, false)}) ผิดกติกา — บันทึกนี้เสีย`)
    }
    const ply = makePly(plies.length + 1, before, turn)
    plies.push(ply)
    board.applyMoveSequence(path)
    noProgress = progressed(ply) ? 0 : noProgress + 1
  }
  return { plies, noProgress }
}

export class Match {
  private state: MatchState = { ...START, quota: quotaLeft() }
  private listeners = new Set<() => void>()
  private engines: Partial<Record<Side, EngineLike>> = {}
  private pending: EngineMove | null = null
  private busy = false
  /** กระดานจริงของแมตช์ — เก็บ history ไว้ตัดสินเสมอ */
  private live = new Board()
  /**
   * true เมื่อเลือกให้ขาวเดินก่อน — เอนจินยังเล่นเกม "ดำเดินก่อน" ของมันตามเดิม
   * เราหมุนกระดาน 180 องศาสลับสีตรงรอยต่อ กระดานที่ผู้ใช้เห็นจึงเป็นเกม
   * ขาวเดินก่อนจริงๆ (ดู src/game/mirror.ts)
   */
  private mirror = false
  /** บันทึกของเกมที่กำลังเล่น — null เมื่อไม่มีเกมที่ต้องบันทึก */
  private recordId: string | null = null
  private startedAt = 0

  /** เทสต์เสียบเอนจินปลอมเข้ามาทางนี้ */
  constructor(private makeEngine: (clientSide: Side) => EngineLike = (s) => new HosbaseEngine(s)) {}

  // ---------- ให้ React อ่านสถานะ ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  snapshot = (): MatchState => this.state

  private set(patch: Partial<MatchState>): void {
    this.state = { ...this.state, ...patch, quota: quotaLeft() }
    for (const fn of this.listeners) fn()
  }

  // ---------- ตำแหน่งที่กำลังดู ----------

  textAt(i: number): string {
    if (i >= 0) return this.state.plies[i].turn.text
    return this.state.firstMover === WHITE ? mirrorText(INITIAL) : INITIAL
  }

  // ---------- ควบคุมเกม ----------

  /** `firstMover` มีผลตอนเริ่มเกมเท่านั้น */
  async start(firstMover: Side = BLACK): Promise<void> {
    if (this.busy) return
    // เกมเดิมที่ยังเล่นค้างอยู่ ปิดบันทึกให้เรียบร้อยก่อนว่าหยุดกลางคัน
    if (this.state.phase === 'ready') this.stop()
    this.busy = true
    this.stopEngines()
    this.pending = null
    this.mirror = firstMover === WHITE
    this.live = new Board(this.mirror ? mirrorText(INITIAL) : INITIAL)
    this.recordId = newRecordId()
    this.startedAt = Date.now()
    this.set({
      ...START,
      firstMover,
      phase: 'connecting',
      message: `กำลังเปิดเกมกับ hosbase (ฝ่าย${sideName(firstMover)}เดินก่อน)…`,
    })
    try {
      const black = this.makeEngine(WHITE) // เราป้อนขาว เอนจินถือดำ
      await black.connect()
      const first = await black.start()
      if (first === null || !isEngineMove(first)) {
        throw new Error(`เอนจินฝ่ายดำไม่ยอมเดินตาแรก (${String(first)})`)
      }
      this.engines[BLACK] = black
      this.pending = first

      this.set({ message: 'กำลังเปิดเกมที่สอง… (เว้นระยะ 5 วิ กันโดน rate limit)' })
      const white = this.makeEngine(BLACK) // เราป้อนดำ เอนจินถือขาว
      await white.connect()
      const ack = await white.start()
      if (ack !== null) throw new Error(`เอนจินฝ่ายขาวตอบผิดรูป (${String(ack)})`)
      this.engines[WHITE] = white

      this.set({ phase: 'ready', message: 'พร้อมแล้ว — กด ▶ ทีละตาเพื่อดูเกม' })
    } catch (e) {
      this.fail(e)
    } finally {
      this.busy = false
    }
  }

  stop(): void {
    this.stopEngines()
    this.set({
      phase: 'over',
      message: 'ปิดการเชื่อมต่อแล้ว',
      result: this.state.result ?? 'หยุดกลางคัน',
    })
    this.record()
  }

  // ---------- บันทึก / ดูย้อนหลัง ----------

  /**
   * เขียนเกมที่กำลังเล่นลงบันทึก — เรียกทุกตาที่เดิน และตอนจบ/หยุด/พัง
   * ปิดหน้าไปกลางเกมก็ยังมีบันทึกถึงตาล่าสุด
   */
  private record(): void {
    const s = this.state
    if (!this.recordId || s.plies.length === 0) return
    saveRecord({
      v: 1,
      id: this.recordId,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      firstMover: s.firstMover,
      moves: s.plies.map((p) => p.turn.path),
      result: s.result ?? (s.error ? `หยุดเพราะข้อผิดพลาด — ${s.error}` : null),
    })
  }

  /**
   * เปิดดูเกมที่บันทึกไว้ ถ้ามีเกมเล่นอยู่จะถูกหยุด (เกมนั้นบันทึกไว้แล้ว
   * แต่เล่นต่อไม่ได้ เพราะเกมฝั่ง hosbase ปิดไปแล้ว) โยน error ถ้าบันทึกเสีย
   */
  openRecord(rec: MatchRecord): void {
    if (this.busy) return
    const { plies, noProgress } = replayPlies(rec.firstMover, rec.moves)
    if (this.state.phase === 'ready') this.stop()
    this.stopEngines()
    this.pending = null
    this.recordId = null
    this.set({
      ...START,
      phase: 'replay',
      plies,
      viewIndex: -1,
      noProgress,
      firstMover: rec.firstMover,
      replay: rec,
      result: rec.result ?? 'เกมนี้ยังไม่จบตอนบันทึก',
      message: 'ดูย้อนหลัง',
    })
  }

  closeReplay(): void {
    if (this.state.phase !== 'replay') return
    this.set({ ...START, firstMover: this.state.firstMover })
  }

  private stopEngines(): void {
    for (const e of Object.values(this.engines)) e?.close()
    this.engines = {}
  }

  /** ก้าวไปข้างหน้าหนึ่งตา — ถ้ายังย้อนดูอยู่ก็แค่เลื่อนมุมมอง ไม่ยิงเน็ต */
  async next(): Promise<void> {
    const s = this.state
    if (s.viewIndex < s.plies.length - 1) {
      this.set({ viewIndex: s.viewIndex + 1 })
      return
    }
    await this.advance()
  }

  prev(): void {
    this.set({ viewIndex: Math.max(-1, this.state.viewIndex - 1) })
  }

  goto(i: number): void {
    this.set({ viewIndex: Math.max(-1, Math.min(this.state.plies.length - 1, i)) })
  }

  first(): void {
    this.goto(-1)
  }

  last(): void {
    this.goto(this.state.plies.length - 1)
  }

  /** ขอตาถัดไปจากเอนจินแล้วเดินลงกระดาน */
  private async advance(): Promise<void> {
    if (this.busy) return
    if (this.state.phase !== 'ready') return
    this.busy = true
    try {
      if (this.finished()) return

      let move = this.pending
      this.pending = null
      if (move === null) {
        const side = this.live.side
        // engines เก็บตามสีในโลกของเอนจิน ซึ่งสลับกับสีบนจอเมื่อมิเรอร์
        const engine = this.engines[this.mirror ? other(side) : side]
        const last = this.state.plies[this.state.plies.length - 1]
        if (!engine || !last) throw new Error('ยังไม่ได้เปิดเกม')
        this.set({ phase: 'thinking', message: `กำลังถามเอนจินฝ่าย${sideName(side)}…` })
        const reply = await engine.playClientMove(
          this.mirror ? last.turn.path.map(flipSquare) : last.turn.path,
        )
        if (reply === OFFER_DRAW) {
          this.over('เอนจินขอเสมอ (OD)')
          return
        }
        if (reply === NEW_AS_BLACK) {
          this.over('เอนจินขอเริ่มเกมใหม่ (NB)')
          return
        }
        move = reply
      }

      // แปลงจากโลกของเอนจินมาเป็นกระดานที่ผู้ใช้เห็น
      const engineBefore = this.mirror ? mirrorText(move.before.text()) : move.before.text()
      const turn = this.mirror ? mirrorTurn(move.turn) : move.turn

      // ถ้าสถานะของเรากับของเอนจินหลุดจากกัน ต้องหยุดตรงนี้ ไม่ใช่เดินผิดต่อไป
      if (engineBefore !== this.live.text()) {
        throw new Error('กระดานของเรากับของเอนจินไม่ตรงกันแล้ว — หยุดก่อนจะเดินผิด')
      }

      const ply = makePly(this.state.plies.length + 1, new Board(this.live.text()), turn)
      this.live.applyMoveSequence(turn.path)

      const plies = [...this.state.plies, ply]
      this.set({
        phase: 'ready',
        plies,
        viewIndex: plies.length - 1,
        noProgress: progressed(ply) ? 0 : this.state.noProgress + 1,
        message: 'พร้อม — กด ▶ เพื่อดูตาถัดไป',
      })
      if (!this.finished()) this.record()
    } catch (e) {
      this.fail(e)
    } finally {
      this.busy = false
    }
  }

  /** เกมจบหรือยัง ตัดสินจากกระดานจริง (ที่มี history ครบ) */
  private finished(): boolean {
    const b = this.live
    if (b.isLose()) {
      const winner = b.side === WHITE ? 'ดำ' : 'ขาว'
      this.over(`ฝ่าย${winner}ชนะ — ฝ่าย${sideName(b.side)}เดินไม่ได้แล้ว`)
      return true
    }
    if (b.isDraw()) {
      this.over('เสมอ — ตำแหน่งซ้ำสามครั้ง หรือเหลือฮอสต่อฮอส')
      return true
    }
    if (this.state.noProgress >= NO_PROGRESS_LIMIT) {
      this.over(
        `เสมอ — เดินมา ${NO_PROGRESS_LIMIT} ตาโดยไม่มีการกินและไม่มีใครขึ้นฮอส ` +
          '(เพดานของแอปนี้เอง ไม่ใช่กติกาหมากฮอส)',
      )
      return true
    }
    return false
  }

  private over(result: string): void {
    this.stopEngines()
    this.set({ phase: 'over', result, message: 'จบเกม' })
    this.record()
  }

  private fail(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e)
    this.stopEngines()
    this.set({ phase: 'error', error: msg, message: 'เกิดข้อผิดพลาด' })
    this.record()
  }
}
