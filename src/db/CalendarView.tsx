import { useMemo, useState } from 'react'
import { cellValue, displayValue, todayISO } from './query'
import { updateView } from './schema'
import type { ViewCtx } from './viewTypes'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

export function CalendarView(ctx: ViewCtx) {
  const { db, snap, view, result } = ctx
  const dateCols = snap.columns.filter((c) => c.type === 'date' || c.type === 'created')
  const dcol = snap.columns.find((c) => c.id === view.dateCol && (c.type === 'date' || c.type === 'created')) ?? dateCols[0]
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const title = snap.columns[0]

  const byDay = useMemo(() => {
    const map = new Map<string, typeof result.rows>()
    if (!dcol) return map
    for (const r of result.rows) {
      const v = cellValue(r, dcol, result.ctx)
      if (typeof v === 'string' && v) {
        const k = v.slice(0, 10)
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(r)
      }
    }
    return map
  }, [result, dcol])

  if (!dcol) return <div className="empty-state">Per usare il Calendario serve una proprietà di tipo <b>Data</b>.</div>

  const first = new Date(cursor.y, cursor.m, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: { date: string; day: number; inMonth: boolean }[] = []
  const prevDays = new Date(cursor.y, cursor.m, 0).getDate()
  for (let i = offset - 1; i >= 0; i--) {
    const d = prevDays - i
    const pm = cursor.m === 0 ? 11 : cursor.m - 1
    cells.push({ date: iso(cursor.m === 0 ? cursor.y - 1 : cursor.y, pm, d), day: d, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: iso(cursor.y, cursor.m, d), day: d, inMonth: true })
  while (cells.length % 7 !== 0) {
    const d = cells.length - offset - daysInMonth + 1
    const nm = cursor.m === 11 ? 0 : cursor.m + 1
    cells.push({ date: iso(cursor.m === 11 ? cursor.y + 1 : cursor.y, nm, d), day: d, inMonth: false })
  }
  const today = todayISO()
  const shift = (n: number) => setCursor((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const monthLabel = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="btn" onClick={() => shift(-1)} aria-label="Mese precedente">‹</button>
        <button className="btn" onClick={() => shift(1)} aria-label="Mese successivo">›</button>
        <button className="btn" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}>Oggi</button>
        <h3>{monthLabel}</h3>
        {dateCols.length > 1 && (
          <select value={dcol.id} onChange={(e) => updateView(db, view.id, { dateCol: e.target.value })}>
            {dateCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((c) => {
          const rows = byDay.get(c.date) ?? []
          return (
            <div key={c.date} className={`cal-day ${c.inMonth ? '' : 'out'} ${c.date === today ? 'today' : ''}`}>
              <div className="cal-day-head">
                <span className="cal-num">{c.day}</span>
                {dcol.type === 'date' && <button className="cal-add" title="Aggiungi" aria-label={`Aggiungi il ${c.date}`} onClick={() => ctx.newRow({ [dcol.id]: c.date }, { open: true })}>＋</button>}
              </div>
              {rows.slice(0, 4).map((r) => (
                <button key={r.id} className="cal-event" onClick={() => ctx.openRow(r.id)}>
                  {displayValue(cellValue(r, title, result.ctx), title) || 'Senza titolo'}
                </button>
              ))}
              {rows.length > 4 && <div className="cal-more">+{rows.length - 4} altri</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
