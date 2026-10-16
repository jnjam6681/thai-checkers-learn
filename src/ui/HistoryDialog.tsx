import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { replayPlies } from '../engine/match'
import {
  MAX_RECORDS,
  deleteRecord,
  listRecords,
  parseRecords,
  recordFileName,
  saveRecord,
  subscribeRecords,
  type MatchRecord,
} from '../engine/records'
import { sideName } from '../game/analyze'
import { WHITE } from '../game/board'

interface Props {
  open: boolean
  onClose: () => void
  /** คืนข้อความ error ถ้าเปิดไม่ได้ */
  onOpenRecord: (rec: MatchRecord) => string | null
  viewingId: string | null
  /** มีเกมเล่นค้างอยู่ — เปิดดูบันทึกแล้วเกมนั้นจะหยุด */
  gameLive: boolean
}

export const formatWhen = (t: number) =>
  new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

function download(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * รายการเกมที่บันทึกไว้ เป็น <dialog> ลอยทับหน้า — ไม่เอาไปแทรกในคอลัมน์
 * เพราะหน้านี้ห้ามมีอะไรขยับ
 */
export function HistoryDialog({ open, onClose, onOpenRecord, viewingId, gameLive }: Props) {
  const records = useSyncExternalStore(subscribeRecords, listRecords)
  const ref = useRef<HTMLDialogElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setMsg(null)
      setConfirmDel(null)
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open])

  const view = (rec: MatchRecord) => {
    const err = onOpenRecord(rec)
    if (err) setMsg({ kind: 'error', text: err })
    else onClose()
  }

  const importFile = async (file: File) => {
    try {
      const list = parseRecords(await file.text())
      // ตรวจทุกตาด้วยการเล่นไล่ใหม่ก่อนเก็บ บันทึกเสียไม่ต้องเข้ารายการ
      const good = list.filter((r) => {
        try {
          replayPlies(r.firstMover, r.moves)
          return true
        } catch {
          return false
        }
      })
      if (!good.length) throw new Error('ทุกเกมในไฟล์นี้มีตาที่ผิดกติกา — บันทึกเสีย')
      for (const r of good) saveRecord(r)
      if (good.length === 1 && list.length === 1) view(good[0])
      else {
        const bad = list.length - good.length
        setMsg({ kind: 'ok', text: `นำเข้า ${good.length} เกม` + (bad ? ` (ข้าม ${bad} เกมที่เสีย)` : '') })
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <dialog ref={ref} className="history" onClose={onClose} onCancel={onClose}>
      <div className="history-head">
        <h2>บันทึกเกม</h2>
        <span className="muted">{records.length} เกม</span>
        <div className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          นำเข้าไฟล์
        </button>
        <button
          className="btn"
          disabled={!records.length}
          onClick={() => download('makhos-all.json', records)}
          title="ส่งออกทุกเกมเป็นไฟล์เดียว"
        >
          ส่งออกทั้งหมด
        </button>
        <button className="btn icon" onClick={onClose} aria-label="ปิด">
          ✕
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importFile(f)
          }}
        />
      </div>

      <p className="history-note">
        ทุกเกมบันทึกเองอัตโนมัติทีละตา เก็บในเบราว์เซอร์นี้ (สูงสุด {MAX_RECORDS} เกม) เปิดดูได้โดยไม่ต้องต่อ
        hosbase ไม่ใช้โควตา — จะย้ายเครื่องให้ส่งออกเป็นไฟล์
        {gameLive && <b> · การเปิดดูจะหยุดเกมที่กำลังเล่นอยู่</b>}
      </p>

      {msg && <p className={`history-msg ${msg.kind}`}>{msg.text}</p>}

      <div className="history-list">
        {records.length === 0 && <p className="muted pad">ยังไม่มีเกมที่บันทึกไว้ — เล่นสักเกมแล้วจะขึ้นที่นี่</p>}
        {records.map((r) => (
          <div className={`history-row ${r.id === viewingId ? 'sel' : ''}`} key={r.id}>
            <div className="history-info">
              <div className="history-when">
                <span className={`pip ${r.firstMover === WHITE ? 'w' : 'b'}`} />
                {formatWhen(r.startedAt)}
                <span className="muted">
                  · {sideName(r.firstMover)}เดินก่อน · {r.moves.length} ตา
                </span>
              </div>
              <div className={`history-result ${r.result ? '' : 'muted'}`} title={r.result ?? undefined}>
                {r.result ?? 'ยังไม่จบ'}
              </div>
            </div>
            <button className="btn primary" onClick={() => view(r)}>
              ดู
            </button>
            <button className="btn" onClick={() => download(recordFileName(r), r)} title="ส่งออกเป็นไฟล์ .json">
              ส่งออก
            </button>
            {confirmDel === r.id ? (
              <button
                className="btn danger"
                onClick={() => {
                  deleteRecord(r.id)
                  setConfirmDel(null)
                }}
              >
                ยืนยันลบ
              </button>
            ) : (
              <button className="btn ghost" onClick={() => setConfirmDel(r.id)}>
                ลบ
              </button>
            )}
          </div>
        ))}
      </div>
    </dialog>
  )
}
