import { col, row, SIZE } from './board'

const FILES = 'abcdefgh'

/** ชื่อช่องแบบหมากรุก เช่น 27 -> "d7" */
export function squareName(i: number): string {
  if (i < 0 || i >= SIZE) return '??'
  return `${FILES[col(i)]}${row(i) + 1}`
}

/** เลขช่องแบบที่หมากฮอสไทยนิยมใช้: 1..32 ไล่จากมุมของฝ่ายดำ */
export function squareNumber(i: number): number {
  return i + 1
}

export function pathName(path: number[], captured: boolean): string {
  return path.map(squareName).join(captured ? 'x' : '-')
}
