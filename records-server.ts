/**
 * ให้ dev server (และ `vite preview`) เขียนบันทึกเกมลงไฟล์ในโฟลเดอร์ records/
 *
 *   GET    /api/records       ทุกเกมบนดิสก์ (ไฟล์ที่อ่านไม่ออกข้ามไป)
 *   PUT    /api/records/:id   เขียน records/<id>.json ทับทั้งไฟล์
 *   DELETE /api/records/:id   ลบไฟล์
 *
 * id ต้องผ่าน `isRecordId` ก่อนกลายเป็นชื่อไฟล์ — กันการส่ง ../ ไปเขียนนอกโฟลเดอร์
 * เขียนลงไฟล์ชั่วคราวแล้ว rename ทับ ไฟล์จะได้ไม่ขาดครึ่งถ้า server ตายกลางทาง
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import { isRecord, isRecordId, type MatchRecord } from './src/engine/record-format'

const ROUTE = '/api/records'
const MAX_BODY = 1_000_000

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('ไฟล์ใหญ่เกิน'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** หนึ่งตาต่อหนึ่งบรรทัด — เปิดไฟล์อ่านเองหรือดู diff ได้ง่าย */
function format(rec: MatchRecord): string {
  const { moves, ...head } = rec
  const top = JSON.stringify(head, null, 2).slice(0, -2) // ตัด "\n}" ท้ายออก ต่อ moves เอง
  const lines = moves.map((m) => `    ${JSON.stringify(m)}`).join(',\n')
  return `${top},\n  "moves": [\n${lines}\n  ]\n}\n`
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function recordsServer(dir: string): Plugin {
  const fileOf = (id: string) => path.join(dir, `${id}.json`)

  async function list(): Promise<unknown[]> {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return [] // ยังไม่มีโฟลเดอร์ = ยังไม่เคยบันทึก
    }
    const out: unknown[] = []
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      try {
        const rec: unknown = JSON.parse(await readFile(path.join(dir, name), 'utf8'))
        if (isRecord(rec)) out.push(rec)
      } catch {
        /* ไฟล์เสียหรือถูกแก้มือจนพัง ข้ามไป ไม่ให้ทั้งรายการล่ม */
      }
    }
    return out
  }

  const handle: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (url !== ROUTE && !url.startsWith(`${ROUTE}/`)) return next()
    const id = decodeURIComponent(url.slice(ROUTE.length + 1))

    void (async () => {
      try {
        if (req.method === 'GET' && !id) return send(res, 200, await list())
        if (!isRecordId(id)) return send(res, 400, 'id ไม่ถูกต้อง')

        if (req.method === 'PUT') {
          let rec: unknown
          try {
            rec = JSON.parse(await readBody(req))
          } catch {
            return send(res, 400, 'ไม่ใช่ JSON')
          }
          if (!isRecord(rec) || rec.id !== id) return send(res, 400, 'ไม่ใช่บันทึกเกม')
          await mkdir(dir, { recursive: true })
          const tmp = `${fileOf(id)}.tmp`
          await writeFile(tmp, format(rec))
          await rename(tmp, fileOf(id))
          return send(res, 200, 'ok')
        }
        if (req.method === 'DELETE') {
          await rm(fileOf(id), { force: true })
          return send(res, 200, 'ok')
        }
        send(res, 405, 'method ไม่รองรับ')
      } catch (e) {
        send(res, 500, e instanceof Error ? e.message : String(e))
      }
    })()
  }

  return {
    name: 'makhos-records',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  }
}
