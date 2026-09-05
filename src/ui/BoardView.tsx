import { SIZE, pos } from '../game/board'
import { squareName } from '../game/notation'

interface Props {
  text: string
  path: number[]
  captures: number[]
  showNumbers: boolean
}

const FILES = 'abcdefgh'

/**
 * กระดาน 8x8 เป็น CSS grid ตัวเดียว พิกัดเขียนอยู่ในช่องริม (แบบเดียวกับ
 * กระดานออนไลน์ทั่วไป) จะได้ไม่ต้องมีแถวป้ายกำกับแยกมาดันขนาดกระดาน
 */
export function BoardView({ text, path, captures, showNumbers }: Props) {
  const pieces = text.slice(0, SIZE)
  const from = path[0]
  const to = path[path.length - 1]
  const via = new Set(path.slice(1, -1))

  const cells = []
  for (let r = 7; r >= 0; r--) {
    for (let c = 0; c < 8; c++) {
      const dark = (c + r) % 2 === 0
      const i = dark ? pos(c, r) : -1
      const p = i >= 0 ? pieces[i] : ' '
      const cls = ['cell', dark ? 'dark' : 'light']
      if (i >= 0) {
        if (i === from) cls.push('from')
        else if (i === to) cls.push('to')
        else if (via.has(i)) cls.push('via')
        if (captures.includes(i)) cls.push('cap')
      }
      cells.push(
        <div key={`${r}-${c}`} className={cls.join(' ')}>
          {c === 0 && <span className="coord rank">{r + 1}</span>}
          {r === 0 && <span className="coord file">{FILES[c]}</span>}
          {showNumbers && i >= 0 && <span className="coord sq">{squareName(i)}</span>}
          {p !== ' ' && (
            <div className={`piece ${p === 'w' || p === 'W' ? 'w' : 'b'}`}>
              {(p === 'W' || p === 'B') && <span className="crown">ฮ</span>}
            </div>
          )}
        </div>,
      )
    }
  }

  return <div className="board">{cells}</div>
}
