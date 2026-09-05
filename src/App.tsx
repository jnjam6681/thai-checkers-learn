import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Match, type Ply } from './engine/match'
import { BoardView } from './ui/BoardView'
import { BLACK, SIZE, WHITE, other, type Side } from './game/board'
import { pathName, squareName } from './game/notation'
import { sideName } from './game/analyze'
import { MAX_PER_HOUR } from './engine/hosbase'

const match = new Match()

/** จำนวนหมากและฮอสของแต่ละฝ่ายในตำแหน่งนี้ */
function census(text: string, side: Side) {
  const p = text.slice(0, SIZE)
  const man = side === WHITE ? 'w' : 'b'
  const king = side
  let men = 0
  let kings = 0
  for (const ch of p) {
    if (ch === man) men++
    else if (ch === king) kings++
  }
  return { total: men + kings, kings }
}

export default function App() {
  const state = useSyncExternalStore(match.subscribe, match.snapshot)
  const [showNumbers, setShowNumbers] = useState(false)
  const [auto, setAuto] = useState(false)
  const [delay, setDelay] = useState(3000)
  const [firstMover, setFirstMover] = useState<Side>(BLACK)

  const ply = state.viewIndex >= 0 ? state.plies[state.viewIndex] : null
  const text = match.textAt(state.viewIndex)
  const a = ply?.analysis ?? null
  const busy = state.phase === 'connecting' || state.phase === 'thinking'
  const gameLive = busy || state.phase === 'ready'

  /**
   * เกมของ hosbase เปิดแล้วเปลี่ยนฝ่ายที่เดินก่อนกลางคันไม่ได้ ถ้ากำลังเล่นอยู่
   * การกดสลับฝ่ายจึงเป็นการเริ่มเกมใหม่ทันที ไม่งั้นปุ่มจะกดได้แต่ไม่มีผล
   * ซึ่งชวนงงกว่ามาก
   */
  const pickFirstMover = (s: Side) => {
    if (s === firstMover) return
    setFirstMover(s)
    if (gameLive) void match.start(s)
  }
  const live = state.plies.length - 1
  const atLive = state.viewIndex >= live
  const started = state.phase !== 'idle'
  const canStep = !busy && (!atLive || state.phase === 'ready')

  const step = useCallback(() => {
    if (canStep) void match.next()
  }, [canStep])

  // เล่นเอง: ตั้งเวลาใหม่ทีละรอบ ไม่ใช่ setInterval — จะได้ไม่มีทางยิงซ้อน
  useEffect(() => {
    if (!auto || state.phase !== 'ready') return
    const t = window.setTimeout(() => void match.next(), delay)
    return () => window.clearTimeout(t)
  }, [auto, delay, state.phase, state.plies.length, state.viewIndex])

  // ลูกศรซ้าย/ขวาและ space เดินหน้าถอยหลังได้เลย
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|select|textarea/i.test(e.target.tagName)) return
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        step()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        match.prev()
      } else if (e.key === 'Home') match.first()
      else if (e.key === 'End') match.last()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  // เลื่อนเฉพาะกล่อง log เอง — scrollIntoView จะลากทั้งหน้าตามไปด้วยถ้ากล่อง
  // อยู่ใต้ขอบจอ กลายเป็นหน้ากระโดดทุกครั้งที่เดิน
  const logRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const box = logRef.current
    const sel = box?.querySelector<HTMLElement>('.mv.sel')
    if (!box || !sel) return
    const s = sel.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    if (s.top < b.top) box.scrollTop += s.top - b.top
    else if (s.bottom > b.bottom) box.scrollTop += s.bottom - b.bottom
  }, [state.viewIndex, state.plies.length])

  const rows = useMemo(() => {
    const out: [Ply | null, Ply | null][] = []
    for (let i = 0; i < state.plies.length; i += 2) {
      out.push([state.plies[i] ?? null, state.plies[i + 1] ?? null])
    }
    return out
  }, [state.plies])

  const toMove = text[SIZE] as Side

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ⬖
          </span>
          <div>
            <h1>หมากฮอส · AI ปะทะ AI</h1>
            <p>เอนจิน Future ของ hosbase.com สองการเชื่อมต่อ เล่นกันเอง</p>
          </div>
        </div>
        <div className="quota" title={`เปิดเกมได้ ${MAX_PER_HOUR} เกมต่อชั่วโมง หนึ่งแมตช์ใช้ 2 เกม`}>
          <span className="quota-n">{state.quota}</span>
          <span className="quota-l">
            เกมที่เปิดได้
            <br />
            ในชั่วโมงนี้
          </span>
        </div>
      </header>

      <div className="setup">
        <button className="btn primary" onClick={() => void match.start(firstMover)} disabled={busy}>
          {started ? 'เริ่มใหม่' : 'เริ่มเกม'}
        </button>

        <div
          className="seg"
          role="group"
          aria-label="ใครเดินก่อน"
          title={
            'เลือกฝ่ายที่เดินก่อน — ถ้ากำลังเล่นอยู่ การสลับฝ่ายจะเริ่มเกมใหม่ทันที (ใช้โควตา 2 เกม)\n' +
            'hosbase ล็อกให้ดำเดินก่อนเสมอ เกมขาวเดินก่อนคือกระดานเดียวกันหมุน 180 องศา'
          }
        >
          <span className="seg-label">เดินก่อน</span>
          {([BLACK, WHITE] as Side[]).map((s) => (
            <button
              key={s}
              className={`seg-btn ${firstMover === s ? 'on' : ''}`}
              onClick={() => pickFirstMover(s)}
              disabled={busy}
            >
              <span className={`pip ${s === WHITE ? 'w' : 'b'}`} />
              {sideName(s)}
            </button>
          ))}
        </div>

        <div className="spacer" />

        {started && state.phase !== 'over' && (
          <button className="btn ghost" onClick={() => match.stop()}>
            หยุด
          </button>
        )}
      </div>

      <main className="grid">
        <section className="board-card">
          <Plate side={BLACK} text={text} toMove={toMove} />
          <BoardView
            text={text}
            path={ply?.turn.path ?? []}
            captures={ply?.turn.captures ?? []}
            showNumbers={showNumbers}
          />
          <Plate side={WHITE} text={text} toMove={toMove} />

          <div className="playback">
            <button className="btn icon" onClick={() => match.first()} disabled={state.viewIndex < 0} title="ต้นเกม (Home)">
              ⏮
            </button>
            <button className="btn icon" onClick={() => match.prev()} disabled={state.viewIndex < 0} title="ย้อนหนึ่งตา (←)">
              ◀
            </button>
            <span className="counter">
              {state.viewIndex + 1} <i>/</i> {state.plies.length}
            </span>
            <button className="btn icon primary" onClick={step} disabled={!canStep} title="เดินตาถัดไป (→)">
              ▶
            </button>
            <button className="btn icon" onClick={() => match.last()} disabled={atLive} title="ตาล่าสุด (End)">
              ⏭
            </button>

            <div className="spacer" />

            <label className={`toggle ${auto ? 'on' : ''}`} title="ให้เดินเองเรื่อยๆ">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              เล่นเอง
            </label>
            <select value={delay} onChange={(e) => setDelay(Number(e.target.value))} aria-label="ความเร็ว">
              <option value={2000}>2 วิ</option>
              <option value={3000}>3 วิ</option>
              <option value={6000}>6 วิ</option>
              <option value={12000}>12 วิ</option>
            </select>
            <button
              className={`btn icon ${showNumbers ? 'on' : ''}`}
              onClick={() => setShowNumbers((v) => !v)}
              title="โชว์ชื่อช่อง"
            >
              a1
            </button>
          </div>
        </section>

        <section className="side">
          <div className={`status ${state.error ? 'error' : state.result ? 'result' : 'info'}`}>
            <span className="status-main" title={state.error ?? state.result ?? state.message}>
              {busy && <span className="spinner" aria-hidden />}
              {state.error ?? state.result ?? state.message}
            </span>
            <span className="status-meta">
              {started && `ฝ่าย${sideName(state.firstMover)}เดินก่อน · `}
              เดินแล้ว {state.plies.length} ตา
              {state.noProgress > 0 && ` · นิ่ง ${state.noProgress} ตา`}
            </span>
          </div>

          <div className="card analysis">
            {a && ply ? (
              <>
                <div className="card-head">
                  <span className={`pip ${ply.side === WHITE ? 'w' : 'b'}`} />
                  <h2>
                    ตาที่ {ply.n} · ฝ่าย{sideName(ply.side)}
                  </h2>
                  <code className="move-big">
                    {pathName(ply.turn.path, ply.turn.captures.length > 0)}
                  </code>
                </div>

                <div className="chips">
                  <span className="chip">เดินได้ {a.total} ตา</span>
                  {a.forced && <span className="chip warn">ตาบังคับ</span>}
                  {a.mandatoryCapture && !a.forced && <span className="chip warn">บังคับกิน</span>}
                  {a.captured > 0 && (
                    <span className="chip good">
                      กิน {a.captured} · {ply.turn.captures.map(squareName).join(' ')}
                    </span>
                  )}
                  {a.promoted && <span className="chip gold">ขึ้นฮอส</span>}
                  {a.replies.length > 0 && (
                    <span className="chip danger">
                      โดนกินตอบ {Math.max(...a.replies.map((t) => t.captures.length))}
                    </span>
                  )}
                  {a.escaped && <span className="chip warn">ถอยหนีการกิน</span>}
                </div>

                <ul className="notes">
                  {a.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>

                {a.others.length > 0 && (
                  <div className="alts">
                    <h3>ตาอื่นที่เดินได้ในตานี้ · {a.others.length} ตา</h3>
                    <div className="alt-list">
                      {a.others.map((t, i) => (
                        <span className="alt" key={i}>
                          <code>{pathName(t.path, t.captures.length > 0)}</code>
                          {t.captures.length > 0 && <b className="tag danger">×{t.captures.length}</b>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty">
                <span className="empty-mark" aria-hidden>
                  ⬖
                </span>
                <h2>ยังไม่มีตาเดิน</h2>
                <p>
                  กด <b>เริ่มเกม</b> แล้วกด <b>▶</b> ทีละตา ระบบจะสรุปว่าตานั้นเกิดอะไรขึ้นบนกระดาน —
                  บังคับไหม กินอะไร อีกฝ่ายถูกบังคับให้กินอะไรต่อ และตานั้นมีอะไรให้เลือกอีกบ้าง
                </p>
                <p className="kbd-hint">
                  <kbd>←</kbd> <kbd>→</kbd> เดินหน้าถอยหลังได้จากคีย์บอร์ด
                </p>
              </div>
            )}
          </div>

          <div className="card moves">
            <div className="moves-head">
              <span>#</span>
              <span>{sideName(state.firstMover)}</span>
              <span>{sideName(other(state.firstMover))}</span>
            </div>
            <div className="moves-body" ref={logRef}>
              {rows.length === 0 && <p className="muted pad">ตาเดินจะขึ้นที่นี่</p>}
              {rows.map(([x, y], r) => (
                <div className="moves-row" key={r}>
                  <span className="no">{r + 1}</span>
                  <MoveCell p={x} index={r * 2} sel={state.viewIndex} />
                  <MoveCell p={y} index={r * 2 + 1} sel={state.viewIndex} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function MoveCell({ p, index, sel }: { p: Ply | null; index: number; sel: number }) {
  if (!p) return <span className="mv blank" />
  return (
    <button
      className={`mv ${index === sel ? 'sel' : ''}`}
      onClick={() => match.goto(index)}
      title={p.analysis.notes[0]}
    >
      <code>{pathName(p.turn.path, p.turn.captures.length > 0)}</code>
      {p.turn.captures.length > 0 && <b className="tag danger">×{p.turn.captures.length}</b>}
      {p.analysis.promoted && <b className="tag gold">ฮ</b>}
    </button>
  )
}

function Plate({ side, text, toMove }: { side: Side; text: string; toMove: Side }) {
  const { total, kings } = census(text, side)
  return (
    <div className={`plate ${toMove === side ? 'active' : ''}`}>
      <span className={`pip ${side === WHITE ? 'w' : 'b'}`} />
      <span className="pname">{sideName(side)}</span>
      <span className="pstat">
        {total} ตัว{kings > 0 && ` · ฮอส ${kings}`}
      </span>
      <span className="turnbadge">ถึงตา</span>
    </div>
  )
}
