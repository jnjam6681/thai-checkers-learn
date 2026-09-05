/**
 * อธิบายว่า "ตานี้เกิดอะไรขึ้นบนกระดาน"
 *
 * hosbase ตอบมาแค่ตาเดินเปล่าๆ ไม่มีเหตุผลแนบมา ไฟล์นี้จึงไม่พยายามเดาว่า
 * เอนจินคิดอะไร และ **ไม่ให้คะแนนตำแหน่งเอง** — รายงานเฉพาะข้อเท็จจริงที่
 * อ่านออกจากกฎหมากฮอสตรงๆ เท่านั้น: ตานี้บังคับไหม กินอะไร ขึ้นฮอสไหม
 * ตัวที่เดินกำลังโดนขู่อยู่หรือเปล่า เดินแล้วอีกฝ่ายถูกบังคับให้กินอะไรต่อ
 * และตาอื่นที่เดินได้มีอะไรบ้าง
 *
 * ทุกอย่างในนี้ตรวจสอบได้จากกระดาน ไม่มีการประเมินว่าตาไหนดีกว่าตาไหน
 */

import { Board, WHITE, other, sideOf, type Side } from './board'
import { fullTurns, type Turn } from './turns'
import { pathName, squareName } from './notation'

export const sideName = (s: Side) => (s === WHITE ? 'ขาว' : 'ดำ')

const key = (t: Turn) => t.path.join('-')

/**
 * ตาที่ `side` กินได้ในตำแหน่งนี้
 *
 * หมากฮอสบังคับกิน ถ้ารายการนี้ไม่ว่าง แปลว่า `side` *ต้อง* เลือกกินหนึ่งใน
 * นั้น เดินอย่างอื่นไม่ได้
 */
function captureTurns(b: Board, side: Side): Turn[] {
  const probe = new Board(b.pieces.join('') + side)
  return probe.isCaptureTurn() ? fullTurns(probe) : []
}

export interface MoveAnalysis {
  mover: Side
  path: number[]
  /** ตานี้เลือกได้ทั้งหมดกี่ตา */
  total: number
  captured: number
  /** ตานี้มีทางกินได้มากที่สุดกี่ตัว */
  maxCaptures: number
  promoted: boolean
  /** มีตาเดียวให้เดิน */
  forced: boolean
  /** กติกาบังคับให้กินในตานี้ */
  mandatoryCapture: boolean
  /** ตัวที่เดินกำลังโดนขู่อยู่ก่อนเดิน */
  escaped: boolean
  /** ช่องที่ฝั่งตรงข้ามกินได้อยู่ก่อนตานี้ */
  threatenedBefore: number[]
  /** ตากินที่ฝั่งตรงข้ามถูกบังคับให้เลือกหลังตานี้ (ว่าง = ไม่มีอะไรให้กิน) */
  replies: Turn[]
  /** ถ้าฝั่งตรงข้ามไม่แก้ ตาถัดไปเราจะกินได้ตามนี้ */
  threatens: Turn[]
  /** ตาอื่นที่เดินได้ในตานี้ */
  others: Turn[]
  notes: string[]
}

export function analyzeMove(before: Board, played: Turn): MoveAnalysis {
  const mover = before.side
  const opp = other(mover)
  const all = fullTurns(before)
  const after = new Board(played.text)

  const start = played.path[0]
  const end = played.path[played.path.length - 1]
  const threatenedBefore = [...new Set(captureTurns(before, opp).map((t) => t.captures).flat())]

  const a: MoveAnalysis = {
    mover,
    path: played.path,
    total: all.length,
    captured: played.captures.length,
    maxCaptures: all.reduce((m, t) => Math.max(m, t.captures.length), 0),
    promoted: before.pieces[start] !== after.pieces[end],
    forced: all.length === 1,
    mandatoryCapture: before.isCaptureTurn(),
    escaped: threatenedBefore.includes(start),
    threatenedBefore,
    replies: after.isCaptureTurn() ? fullTurns(after) : [],
    threatens: captureTurns(after, mover),
    others: all.filter((t) => key(t) !== key(played)),
    notes: [],
  }
  a.notes = explain(played, a)
  return a
}

function explain(played: Turn, a: MoveAnalysis): string[] {
  const notes: string[] = []
  const name = pathName(played.path, a.captured > 0)
  const at = (list: number[]) => list.map(squareName).join(', ')
  const end = played.path[played.path.length - 1]

  // --- ตานี้ทำอะไร ---
  if (a.forced) {
    notes.push(
      `ตาบังคับ — ${name} เป็นตาเดียวที่เดินได้ ไม่มีอะไรให้เลือก` +
        (a.captured > 0 ? ` (กิน ${at(played.captures)})` : ''),
    )
  } else if (a.mandatoryCapture) {
    notes.push(
      `กติกาบังคับกิน ตานี้กิน ${a.captured} ตัวที่ ${at(played.captures)}` +
        (a.total > 1 ? ` — มีทางกินให้เลือก ${a.total} ทาง` : ''),
    )
    if (a.maxCaptures > a.captured) {
      const most = a.others.find((t) => t.captures.length === a.maxCaptures)!
      notes.push(
        `กินได้มากที่สุด ${a.maxCaptures} ตัวที่ ${pathName(most.path, true)} แต่เอนจินไม่เอาทางนั้น — ` +
          `หมากฮอสไทยไม่ได้บังคับให้กินมากที่สุด เลือกทางไหนก็ได้`,
      )
    }
  } else {
    notes.push(`เดินเปล่า ${name} — ตานี้ไม่มีอะไรให้กิน เลือกได้ ${a.total} ตา`)
  }

  if (a.promoted) notes.push(`ถึงแถวสุดท้ายที่ ${squareName(end)} ได้เป็นฮอส`)

  // --- ตัวที่โดนขู่อยู่ก่อนเดิน ---
  if (a.escaped) {
    notes.push(`ตัวที่ ${squareName(played.path[0])} กำลังจะโดนกินอยู่พอดี ตานี้ถอยมันออกจากเส้นที่โดน`)
  } else if (a.threatenedBefore.length > 0 && a.captured === 0) {
    notes.push(`ก่อนเดินตานี้ ฝั่งตรงข้ามกินได้ที่ ${at(a.threatenedBefore)} และเอนจินเลือกไม่ไปยุ่งกับมัน`)
  }

  // --- หลังเดินแล้วเป็นยังไง ---
  if (a.replies.length > 0) {
    const most = a.replies.reduce((m, t) => (t.captures.length > m.captures.length ? t : m))
    notes.push(
      `หลังตานี้ฝ่าย${sideName(other(a.mover))}ถูกบังคับให้กิน — เลือกได้ ${a.replies.length} ทาง ` +
        `มากที่สุด ${most.captures.length} ตัวที่ ${pathName(most.path, true)}`,
    )
  } else {
    notes.push(`หลังตานี้ฝ่าย${sideName(other(a.mover))}ยังไม่มีอะไรให้กิน เดินได้ตามปกติ`)
  }

  if (a.threatens.length > 0 && a.replies.length === 0) {
    const most = a.threatens.reduce((m, t) => (t.captures.length > m.captures.length ? t : m))
    notes.push(
      `ตำแหน่งใหม่ขู่กินไว้ ${a.threatens.length} ทาง ถ้าอีกฝ่ายไม่แก้ ตาหน้ากินได้ที่ ` +
        `${pathName(most.path, true)}`,
    )
  }

  // --- แถวบ้าน ---
  const home = a.mover === WHITE ? [0, 1, 2, 3] : [28, 29, 30, 31]
  if (home.includes(played.path[0])) {
    const left = home.filter((i) => sideOf(new Board(played.text).pieces[i]) === a.mover).length
    notes.push(`ถอนหมากออกจากแถวบ้าน เหลือกันแถวหลังอยู่ ${left} ตัว`)
  }

  // --- ฮอสบนกระดาน ---
  const p = new Board(played.text).pieces
  const mine = p.filter((x) => x === a.mover).length
  const theirs = p.filter((x) => x === other(a.mover)).length
  if (mine + theirs > 0) {
    notes.push(`ตอนนี้ฮอสฝ่าย${sideName(a.mover)} ${mine} ตัว ฝ่าย${sideName(other(a.mover))} ${theirs} ตัว`)
  }

  return notes
}
