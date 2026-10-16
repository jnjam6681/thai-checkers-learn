/**
 * เทสต์ออฟไลน์: เสียบเอนจินปลอมที่เดินเองในเครื่องแทน hosbase แล้วดูว่า
 * `Match` ตัดสินจบเกมได้จริงทุกเกม
 *
 * บั๊กที่เจอตอนแรกคือ Match สร้าง `new Board(text)` ใหม่ทุกตา ทำให้
 * `Board.history` เหลือรายการเดียวเสมอ กติกาเสมอ "ตำแหน่งซ้ำสามครั้ง"
 * จึงไม่มีทางเข้าเงื่อนไข และเกมที่ควรเสมอก็เดินไปเรื่อยๆ ไม่จบ
 */

const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
})

const { Match, NO_PROGRESS_LIMIT } = await import('../src/engine/match')
const { listRecords, parseRecords, MAX_RECORDS } = await import('../src/engine/records')
const { BLACK, Board, WHITE, other } = await import('../src/game/board')
const { fullTurns } = await import('../src/game/turns')
const { turnForResult } = await import('../src/game/turns')
import type { EngineLike, EngineReply } from '../src/engine/hosbase'
import type { Side } from '../src/game/board'

let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

/** เอนจินปลอม: เดินสุ่มแบบมี seed แต่ให้คำตอบหน้าตาเหมือนของจริงทุกอย่าง */
class FakeEngine implements EngineLike {
  readonly engineSide: Side
  private board = new Board()
  constructor(readonly clientSide: Side) {
    this.engineSide = other(clientSide)
  }
  async connect(): Promise<void> {}
  async start(): Promise<EngineReply | null> {
    return this.clientSide === WHITE ? this.pick() : null
  }
  async playClientMove(squares: number[]): Promise<EngineReply> {
    this.board.applyMoveSequence(squares)
    return this.pick()
  }
  close(): void {}
  private pick(): EngineReply {
    const before = new Board(this.board.text())
    const turns = fullTurns(this.board)
    if (!turns.length) throw new Error('เอนจินปลอมเดินไม่ได้ แต่ Match ยังถามอยู่')
    const t = turns[Math.floor(rnd() * turns.length)]
    this.board.applyMoveSequence(t.path)
    const turn = turnForResult(before, t.text)!
    return { frm: t.path[0], to: t.path[t.path.length - 1], caps: t.captures, turn, before }
  }
}

const GAMES = 120
const HARD_CAP = 600
const results = new Map<string, number>()
let maxPlies = 0
let maxNoProgress = 0
const starts = new Map<string, number>()

for (let g = 0; g < GAMES; g++) {
  // สลับฝ่ายที่เดินก่อนไปมา ทั้งสองโหมดต้องจบเกมได้เหมือนกัน
  const firstMover = g % 2 === 0 ? BLACK : WHITE
  const m = new Match((side) => new FakeEngine(side))
  await m.start(firstMover)
  if (m.snapshot().phase === 'error') throw new Error(m.snapshot().error!)
  let n = 0
  while (m.snapshot().phase !== 'over' && n < HARD_CAP) {
    await m.next()
    if (m.snapshot().error) throw new Error(m.snapshot().error!)
    maxNoProgress = Math.max(maxNoProgress, m.snapshot().noProgress)
    n++
  }
  const s = m.snapshot()
  if (s.phase !== 'over') throw new Error(`เกมที่ ${g + 1} เดินไป ${n} ตาแล้วยังไม่จบ`)
  if (s.plies[0].side !== firstMover) {
    throw new Error(`ขอให้ฝ่าย ${firstMover} เดินก่อน แต่ตาแรกเป็นของ ${s.plies[0].side}`)
  }
  starts.set(firstMover, (starts.get(firstMover) ?? 0) + 1)
  maxPlies = Math.max(maxPlies, s.plies.length)
  const key = s.result!.startsWith('เสมอ') ? 'เสมอ' : 'มีผู้ชนะ'
  results.set(key, (results.get(key) ?? 0) + 1)

  // ตาทุกตาต้องถูกกติกาเมื่อเล่นไล่จากตำแหน่งเริ่มต้นใหม่
  const b = new Board(m.textAt(-1))
  for (const p of s.plies) {
    if (b.text() !== p.beforeText) throw new Error(`สถานะไม่ตรงที่ตา ${p.n}`)
    if (!fullTurns(b).some((t) => t.text === p.turn.text)) throw new Error(`ตา ${p.n} ผิดกติกา`)
    b.applyMoveSequence(p.turn.path)
  }
  if (s.noProgress > NO_PROGRESS_LIMIT) throw new Error('ตัวนับไม่มีความคืบหน้าเลยเพดาน')

  // เกมต้องถูกบันทึกครบทุกตาพร้อมผลแพ้ชนะ และผ่านไฟล์ส่งออกแล้วเปิดดูย้อนหลังได้ตรงเป๊ะ
  const rec = listRecords()[0]
  if (!rec || rec.moves.length !== s.plies.length || rec.result !== s.result) {
    throw new Error(`เกมที่ ${g + 1} บันทึกไม่ครบ`)
  }
  const [loaded] = parseRecords(JSON.stringify(rec))
  const viewer = new Match((side) => new FakeEngine(side))
  viewer.openRecord(loaded)
  const v = viewer.snapshot()
  if (v.phase !== 'replay' || v.noProgress !== s.noProgress) throw new Error(`เกมที่ ${g + 1} เปิดย้อนหลังไม่ได้`)
  if (viewer.textAt(-1) !== m.textAt(-1)) throw new Error(`เกมที่ ${g + 1} ตำแหน่งเริ่มไม่ตรง`)
  v.plies.forEach((p, i) => {
    const o = s.plies[i]
    if (p.turn.text !== o.turn.text || p.analysis.notes.join() !== o.analysis.notes.join()) {
      throw new Error(`เกมที่ ${g + 1} ตา ${i + 1} ย้อนหลังไม่ตรงกับตอนเล่น`)
    }
  })
}

if (listRecords().length !== Math.min(GAMES, MAX_RECORDS)) throw new Error('จำนวนบันทึกไม่ตรง')
const bad = JSON.parse(JSON.stringify(listRecords()[0]))
bad.moves[0] = [0, 31]
let rejected = false
try {
  new Match().openRecord(bad)
} catch {
  rejected = true
}
if (!rejected) throw new Error('บันทึกที่มีตาผิดกติกาต้องเปิดไม่ได้')

if (maxNoProgress === 0) throw new Error('ตัวนับ noProgress ไม่เคยขยับเลย')
console.log(
  `จบครบ ${GAMES} เกม, ยาวสุด ${maxPlies} ตา, ` +
    `ไม่มีความคืบหน้ายาวสุด ${maxNoProgress}/${NO_PROGRESS_LIMIT} ตา,`,
  Object.fromEntries(results),
  'เดินก่อน:',
  Object.fromEntries(starts),
)
