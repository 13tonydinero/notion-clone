import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { CellEditor, CellReadOnly } from './Cells'
import { deleteRows, duplicateRow, rowNotes, setCell, typeInfo } from './schema'
import { cellValue } from './query'
import type { ViewCtx } from './viewTypes'

/** Textarea collegata a un Y.Text: più persone possono scrivere nelle note della stessa riga in tempo reale. */
function NotesEditor({ ctx, rowId }: { ctx: ViewCtx; rowId: string }) {
  const { db } = ctx
  const [text, setText] = useState(() => db.notes.get(rowId)?.toString() ?? '')
  const area = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<[number, number] | null>(null)

  useEffect(() => {
    let current = db.notes.get(rowId) ?? null
    const onText = (e: Y.YTextEvent) => {
      if (e.transaction.local) return
      const el = area.current
      if (el && document.activeElement === el) {
        // Sposta il cursore locale in base alle modifiche remote.
        const shift = (pos: number) => {
          let idx = 0
          let out = pos
          for (const d of e.delta) {
            if (d.retain) idx += d.retain
            else if (d.insert) { const n = typeof d.insert === 'string' ? d.insert.length : 1; if (idx <= pos) out += n; idx += 0 }
            else if (d.delete) { if (idx < pos) out -= Math.min(d.delete, pos - idx) }
          }
          return out
        }
        pendingCaret.current = [shift(el.selectionStart), shift(el.selectionEnd)]
      }
      setText(current!.toString())
    }
    const bind = () => {
      const t = db.notes.get(rowId) ?? null
      if (t === current) return
      current?.unobserve(onText)
      current = t
      current?.observe(onText)
      setText(t?.toString() ?? '')
    }
    current?.observe(onText)
    db.notes.observe(bind)
    setText(current?.toString() ?? '')
    return () => { current?.unobserve(onText); db.notes.unobserve(bind) }
  }, [db, rowId])

  useLayoutEffect(() => {
    if (pendingCaret.current && area.current) {
      area.current.setSelectionRange(pendingCaret.current[0], pendingCaret.current[1])
      pendingCaret.current = null
    }
  })

  const onChange = (next: string) => {
    const t = rowNotes(db, rowId)
    const prev = t.toString()
    let start = 0
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++
    let endPrev = prev.length
    let endNext = next.length
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) { endPrev--; endNext-- }
    db.doc.transact(() => {
      if (endPrev > start) t.delete(start, endPrev - start)
      if (endNext > start) t.insert(start, next.slice(start, endNext))
    })
    setText(next)
  }

  return (
    <textarea ref={area} className="peek-notes" placeholder="Note della riga… (modificabili insieme in tempo reale)" value={text} onChange={(e) => onChange(e.target.value)} />
  )
}

export function RowPeek({ ctx, rowId, onClose }: { ctx: ViewCtx; rowId: string; onClose: () => void }) {
  const { db, snap, result } = ctx
  const row = snap.rows.find((r) => r.id === rowId)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  if (!row) return null
  const [title, ...rest] = snap.columns

  return (
    <div className="peek-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="peek" role="dialog" aria-label="Dettaglio riga">
        <div className="peek-bar">
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">✕</button>
          <span className="spacer" />
          <button className="btn" onClick={() => { const id = duplicateRow(db, rowId); if (id) ctx.openRow(id) }}>Duplica</button>
          <button className="btn danger" onClick={() => { if (confirm('Eliminare questa riga?')) { deleteRows(db, [rowId]); onClose() } }}>Elimina</button>
        </div>
        <input
          className="peek-title"
          placeholder="Senza titolo"
          defaultValue={(row.cells[title.id] as string) ?? ''}
          key={`${rowId}-${row.cells[title.id] ?? ''}`}
          onBlur={(e) => setCell(db, rowId, title.id, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="peek-props">
          {rest.map((col) => (
            <div key={col.id} className="peek-prop">
              <label className="peek-label"><span className="th-icon">{typeInfo(col.type).icon}</span>{col.name}</label>
              <div className="peek-value">
                {col.type === 'formula' || col.type === 'created'
                  ? <CellReadOnly col={col} value={cellValue(row, col, result.ctx)} />
                  : <CellEditor col={col} compact value={cellValue(row, col, result.ctx)} onChange={(v) => setCell(db, rowId, col.id, v)} onCreateOption={(l) => ctx.createOption(col.id, l)} />}
              </div>
            </div>
          ))}
        </div>
        <NotesEditor ctx={ctx} rowId={rowId} />
      </aside>
    </div>
  )
}
