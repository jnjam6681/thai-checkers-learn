import { Board, INITIAL, SIZE, WHITE, other } from '../src/game/board'
import { fullTurns, turnForResult } from '../src/game/turns'
import { analyzeMove } from '../src/game/analyze'
import { flipSquare, mirrorText, mirrorTurn } from '../src/game/mirror'

const b0 = new Board()
console.log('initial side', b0.side, 'moves', b0.moves.length)
console.log(b0.text().length === SIZE + 1 ? 'text len ok' : 'TEXT LEN BAD')

// decode ที่ได้จากการยิงจริง: client=W, reply "0409"
const dec = (msg: string, clientSide: string, board: Board) => {
  let frm = -1, to = -1
  const caps: number[] = []
  for (let k = 0; k + 1 < msg.length; k += 2) {
    const v = Number(msg.slice(k, k + 2))
    let p = v % SIZE
    if (clientSide === WHITE) p = SIZE - 1 - p
    if (v >= SIZE) caps.push(p)
    else if (board.pieces[p] !== ' ') frm = p
    else to = p
  }
  return { frm, to, caps }
}
console.log('decode 0409 ->', dec('0409', 'W', new Board()))

// เล่นสุ่ม 200 เกม เช็กว่าไม่พังและ analyze ทำงานได้
let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
let games = 0, plies = 0, wins = 0, draws = 0
for (let g = 0; g < 200; g++) {
  const b = new Board()
  let n = 0
  while (n < 300) {
    const turns = fullTurns(b)
    if (!turns.length) { wins++; break }
    if (b.isDraw()) { draws++; break }
    const t = turns[Math.floor(rnd() * turns.length)]
    const before = new Board(b.text())
    if (g < 3) {
      const a = analyzeMove(before, t)
      if (!a.notes.length) throw new Error('no notes')
      if (a.total < 1 || a.others.length !== a.total - 1) {
        throw new Error(`นับตาที่เลือกได้ผิด: total=${a.total} others=${a.others.length}`)
      }
    }
    if (!turnForResult(before, t.text)) throw new Error('turnForResult failed')
    b.applyMoveSequence(t.path)
    if (b.text() !== t.text) throw new Error(`mismatch\n${b.text()}\n${t.text}`)
    n++; plies++
  }
  games++
}
console.log(`random games ok: ${games} games, ${plies} plies, ${wins} decisive, ${draws} draws`)

// ตรวจการเข้ารหัสตาเดินขาส่ง (ยกมาจาก encodeOurMove)
const encode = (beforeText: string, afterText: string, clientSide: string, engineSide: string) => {
  let out = ''
  for (let i = 0; i < SIZE; i++) {
    if (beforeText[i] === afterText[i]) continue
    let v = clientSide === WHITE ? i : SIZE - 1 - i
    if (beforeText[i].toUpperCase() === engineSide) v += SIZE
    out += String(Math.floor(v / 10)) + String(v % 10)
  }
  return out
}
const bb = new Board()
bb.applyMoveSequence([27, 22])
console.log('encode black 27-22 as client=B:', encode(INITIAL, bb.text(), 'B', other('B')))


// การมิเรอร์ต้องให้เกมเดียวกันเป๊ะ: ตาที่เดินได้ในกระดานที่หมุนแล้ว ต้องเท่ากับ
// ตาที่เดินได้ในกระดานเดิมเมื่อหมุนทีละตา
// หมากวางเหมือนเดิมเป๊ะ ต่างแค่ตอนนี้เป็นตาของขาว — นี่แหละคือ "ขาวเดินก่อน"
if (mirrorText(INITIAL) !== INITIAL.slice(0, SIZE) + 'W') {
  throw new Error(`ตำแหน่งตั้งต้นหลังมิเรอร์ผิด: ${mirrorText(INITIAL)}`)
}
let checked = 0
seed = 999
for (let g = 0; g < 40; g++) {
  const b = new Board()
  for (let n = 0; n < 60; n++) {
    const turns = fullTurns(b)
    if (!turns.length) break
    const mb = new Board(mirrorText(b.text()))
    const got = fullTurns(mb).map((t) => t.path.join('-')).sort()
    const want = turns.map((t) => mirrorTurn(t).path.join('-')).sort()
    if (got.join('|') !== want.join('|')) throw new Error(`ตาเดินหลังมิเรอร์ไม่ตรง\n${b.text()}`)
    for (const t of turns) {
      const m = mirrorTurn(t)
      const nb = new Board(mb.text())
      nb.applyMoveSequence(m.path)
      if (nb.text() !== m.text) throw new Error('ผลลัพธ์หลังมิเรอร์ไม่ตรง')
      if (mirrorTurn(m).path.join() !== t.path.join()) throw new Error('มิเรอร์สองครั้งไม่กลับที่เดิม')
      if (flipSquare(flipSquare(t.path[0])) !== t.path[0]) throw new Error('flipSquare ไม่ involution')
    }
    checked += turns.length
    b.applyMoveSequence(turns[Math.floor(rnd() * turns.length)].path)
  }
}
console.log(`มิเรอร์ตรงกันทั้งหมด ${checked} ตา`)
