/**
 * โมเดลกระดานหมากฮอส (Thai checkers)
 *
 * พอร์ตมาจาก makhosbot/board.py ซึ่งพอร์ตมาจาก js/control_*.js ของ hosbase
 * อีกที — ต้องให้ตรงกับเอนจินเป๊ะ ไม่งั้นการเข้ารหัสตาเดินจะเพี้ยน
 *
 * เลขช่อง (เฉพาะช่องทึบ 32 ช่อง, 0..31):
 *   row(i) = i / 4                       0 = แถวบ้านของขาว, 7 = แถวบ้านของดำ
 *   col(i) = (i % 4) * 2 + row(i) % 2    0..7
 *   pos(c, r) = c / 2 + r * 4
 *
 * เบี้ยขาว ('w') เดินไปทางแถวเลขมาก, เบี้ยดำ ('b') เดินไปทางแถวเลขน้อย
 * ฮอส ('W' / 'B') เลื่อนได้ทั้งแนวทแยง และเวลากินต้องลงช่องที่ติดกับตัวที่กิน
 * ทันที (กติกาไทย)
 */

export const EMPTY = ' '
export const WHITE = 'W'
export const BLACK = 'B'

export type Side = typeof WHITE | typeof BLACK

export const WHITE_MAN = 'w'
export const BLACK_MAN = 'b'
export const WHITE_KING = 'W'
export const BLACK_KING = 'B'

export const SIZE = 32
export const INITIAL = 'wwwwwwww' + ' '.repeat(16) + 'bbbbbbbb' + 'B'

const KING_DIRS: [number, number][] = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
]

export const row = (i: number) => Math.floor(i / 4)
export const col = (i: number) => (i % 4) * 2 + (Math.floor(i / 4) % 2)

export function pos(c: number, r: number): number {
  if (c < 0 || c >= 8 || r < 0 || r >= 8) return -1
  return Math.floor(c / 2) + r * 4
}

export const rel = (i: number, dc: number, dr: number) => pos(col(i) + dc, row(i) + dr)

export function sideOf(piece: string): Side | typeof EMPTY {
  if (piece === BLACK_MAN || piece === BLACK_KING) return BLACK
  if (piece === WHITE_MAN || piece === WHITE_KING) return WHITE
  return EMPTY
}

export function other(side: string): Side {
  return side === BLACK ? WHITE : BLACK
}

export const isKing = (piece: string) => piece === WHITE_KING || piece === BLACK_KING

export interface Move {
  frm: number
  to: number
  /** ช่องของตัวที่ถูกกิน, -1 ถ้าเป็นการเดินเปล่า */
  cap: number
}

export class Board {
  pieces: string[] = []
  side: Side = BLACK
  history: string[] = []
  moves: Move[] = []

  constructor(text: string = INITIAL) {
    this.reset(text)
  }

  // ---------- สถานะ ----------

  reset(text: string = INITIAL): void {
    this.pieces = text.slice(0, SIZE).split('')
    this.side = text[SIZE] as Side
    this.history = [this.text()]
    this.moves = []
    this.genMoves()
  }

  text(): string {
    return this.pieces.join('') + this.side
  }

  copy(): Board {
    const b: Board = Object.create(Board.prototype)
    b.pieces = this.pieces.slice()
    b.side = this.side
    b.history = this.history.slice()
    b.moves = this.moves.slice()
    return b
  }

  numPieces(): number {
    return this.pieces.filter((p) => p !== EMPTY).length
  }

  count(piece: string): number {
    return this.pieces.filter((p) => p === piece).length
  }

  // ---------- เดินหมาก ----------

  findMove(frm: number, to: number): Move | null {
    return this.moves.find((m) => m.frm === frm && m.to === to) ?? null
  }

  /**
   * เดินหนึ่งกระโดด คืน true เมื่อจบตา, false เมื่อตัวเดิมต้องกินต่อ
   */
  makeMove(frm: number, to: number): boolean {
    const m = this.findMove(frm, to)
    if (m === null) throw new Error(`ตาเดิน ${frm}->${to} ไม่ถูกกติกาใน ${this.text()}`)
    const piece = this.pieces[frm]
    this.pieces[frm] = EMPTY
    if (piece === BLACK_MAN && to < 4) this.pieces[to] = BLACK_KING
    else if (piece === WHITE_MAN && to >= 28) this.pieces[to] = WHITE_KING
    else this.pieces[to] = piece
    if (m.cap !== -1) this.pieces[m.cap] = EMPTY
    this.moves = []
    const promoted = this.pieces[to] !== piece
    if (m.cap !== -1 && !promoted) {
      this.genCapturesFor(to)
      if (this.moves.length) return false // ตัวเดิมกินต่อ
      this.moves = []
    }
    this.side = other(this.side)
    this.history.push(this.text())
    this.genMoves()
    return true
  }

  /** เดินทั้งตาจาก [จาก, กลาง..., ถึง] */
  applyMoveSequence(squares: number[]): void {
    for (let k = 0; k + 1 < squares.length; k++) this.makeMove(squares[k], squares[k + 1])
  }

  /** เดินทั้งตาจากปลายทาง + รายการช่องที่ถูกกิน (รูปแบบที่ hosbase ตอบกลับมา) */
  makeMoves(frm: number, to: number, caps: number[]): void {
    if (frm !== -1 && to !== -1) {
      const piece = this.pieces[frm]
      this.pieces[frm] = EMPTY
      if (piece === BLACK_MAN && to < 4) this.pieces[to] = BLACK_KING
      else if (piece === WHITE_MAN && to >= 28) this.pieces[to] = WHITE_KING
      else this.pieces[to] = piece
    }
    for (const c of caps) this.pieces[c] = EMPTY
    this.side = other(this.side)
    this.history.push(this.text())
    this.genMoves()
  }

  // ---------- สร้างรายการตาเดิน ----------

  private genMoves(): void {
    this.moves = []
    if (!this.genCaptures()) this.genQuiet()
  }

  private genCaptures(): boolean {
    let found = false
    for (let i = 0; i < SIZE; i++) {
      if (sideOf(this.pieces[i]) === this.side && this.genCapturesFor(i)) found = true
    }
    return found
  }

  private genCapturesFor(i: number): boolean {
    const piece = this.pieces[i]
    if (piece === BLACK_MAN) {
      const a = this.add(i, rel(i, -2, -2), rel(i, -1, -1))
      const b = this.add(i, rel(i, 2, -2), rel(i, 1, -1))
      return a || b
    }
    if (piece === WHITE_MAN) {
      const a = this.add(i, rel(i, -2, 2), rel(i, -1, 1))
      const b = this.add(i, rel(i, 2, 2), rel(i, 1, 1))
      return a || b
    }
    let found = false
    for (const [dc, dr] of KING_DIRS) {
      let victim = rel(i, dc, dr)
      while (victim !== -1 && this.pieces[victim] === EMPTY) victim = rel(victim, dc, dr)
      const landing = victim !== -1 ? rel(victim, dc, dr) : -1
      if (this.add(i, landing, victim)) found = true
    }
    return found
  }

  private genQuiet(): boolean {
    let found = false
    for (let i = 0; i < SIZE; i++) {
      if (sideOf(this.pieces[i]) === this.side && this.genQuietFor(i)) found = true
    }
    return found
  }

  private genQuietFor(i: number): boolean {
    const piece = this.pieces[i]
    if (piece === BLACK_MAN) {
      const a = this.add(i, rel(i, -1, -1))
      const b = this.add(i, rel(i, 1, -1))
      return a || b
    }
    if (piece === WHITE_MAN) {
      const a = this.add(i, rel(i, -1, 1))
      const b = this.add(i, rel(i, 1, 1))
      return a || b
    }
    let found = false
    for (const [dc, dr] of KING_DIRS) {
      let to = rel(i, dc, dr)
      while (this.add(i, to)) {
        to = rel(to, dc, dr)
        found = true
      }
    }
    return found
  }

  private add(frm: number, to: number, cap?: number): boolean {
    if (frm === -1 || to === -1) return false
    if (sideOf(this.pieces[frm]) !== this.side) return false
    if (this.pieces[to] !== EMPTY) return false
    if (cap !== undefined) {
      if (cap === -1 || sideOf(this.pieces[cap]) !== other(this.side)) return false
    }
    this.moves.push({ frm, to, cap: cap === undefined ? -1 : cap })
    return true
  }

  // ---------- สถานะเกม ----------

  isCaptureTurn(): boolean {
    return this.moves.length > 0 && this.moves[0].cap !== -1
  }

  isBegin(): boolean {
    return this.text() === INITIAL
  }

  isLose(): boolean {
    return this.moves.length === 0 && !this.isBegin()
  }

  private isRepeat(): boolean {
    const last = this.history[this.history.length - 1]
    return this.history.filter((h) => h === last).length >= 3
  }

  private is1on1(): boolean {
    if (this.isCaptureTurn() || this.history.length < 2) return false
    for (const h of this.history.slice(-2)) {
      const b = h.slice(0, SIZE)
      const c = (ch: string) => b.split('').filter((x) => x === ch).length
      if (c(BLACK_KING) !== 1 || c(WHITE_KING) !== 1 || c(EMPTY) !== SIZE - 2) return false
    }
    return true
  }

  isDraw(): boolean {
    return this.isRepeat() || this.is1on1()
  }
}
