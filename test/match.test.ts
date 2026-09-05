/**
 * ทดสอบครบวง: ต่อผ่าน proxy ของ vite ไปหา hosbase จริง ให้เอนจินสองตัวเล่นกัน
 * ไม่กี่ตา แล้วตรวจว่าตาที่ได้ถูกกติกาทั้งหมด
 *
 *   npm run dev            # หน้าต่างหนึ่ง
 *   npm run test:match     # อีกหน้าต่าง
 */

const store = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  location: { protocol: 'http:', host: process.env.HOST ?? 'localhost:5173' },
})

const { Match } = await import('../src/engine/match')
const { pathName } = await import('../src/game/notation')
const { Board } = await import('../src/game/board')
const { fullTurns } = await import('../src/game/turns')

const PLIES = Number(process.env.PLIES ?? 10)
const FIRST = (process.env.FIRST ?? 'B') as 'B' | 'W'
const match = new Match()

await match.start(FIRST)
let s = match.snapshot()
if (s.phase === 'error') throw new Error(`เปิดเกมไม่ได้: ${s.error}`)
console.log(`เปิดเกมสำเร็จ (ฝ่าย ${FIRST} เดินก่อน):`, s.message)

for (let i = 0; i < PLIES; i++) {
  await match.next()
  s = match.snapshot()
  if (s.error) throw new Error(s.error)
  const p = s.plies[s.plies.length - 1]
  if (!p) break
  console.log(
    `${String(p.n).padStart(2)}. ${p.side === 'W' ? 'ขาว' : 'ดำ '} ` +
      `${pathName(p.turn.path, p.turn.captures.length > 0).padEnd(12)} ` +
      `[${p.analysis.total} ตาให้เลือก] ${p.analysis.notes[0]}`,
  )
  if (s.phase === 'over') { console.log('จบเกม:', s.result); break }
}

// ตรวจซ้ำว่าลำดับตาทั้งหมดถูกกติกาจริง เล่นไล่จากตำแหน่งเริ่มต้นใหม่
const b = new Board(match.textAt(-1))
if (match.snapshot().plies[0].side !== FIRST) throw new Error('ฝ่ายที่เดินก่อนไม่ตรงกับที่ขอ')
for (const p of match.snapshot().plies) {
  if (b.text() !== p.beforeText) throw new Error(`สถานะไม่ตรงที่ตา ${p.n}`)
  if (!fullTurns(b).some((t) => t.text === p.turn.text)) throw new Error(`ตา ${p.n} ผิดกติกา`)
  b.applyMoveSequence(p.turn.path)
}
console.log(`ตรวจแล้ว ${match.snapshot().plies.length} ตา ถูกกติกาทั้งหมด`)
match.stop()
process.exit(0)
