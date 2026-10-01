import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceSession } from '../sync/session'
import { useDatabase } from './useDatabase'
import { Toolbar } from './Toolbar'
import { TableView } from './TableView'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { RowPeek } from './RowPeek'
import { addColumn, addOption, addRow, initDatabase, makeColumn, type Column, type ColType } from './schema'
import { cellValue, displayValue, queryView } from './query'
import { parseInput } from './input'
import { parseCSV, toCSV } from './csv'
import type { RemoteFocus } from './Cells'
import type { ViewCtx } from './viewTypes'

function inferType(values: string[]): ColType {
  const v = values.filter((x) => x.trim() !== '')
  if (!v.length) return 'text'
  if (v.every((x) => /^(s[iì]|no|true|false|vero|falso)$/i.test(x.trim()))) return 'checkbox'
  if (v.every((x) => /^-?\d+([.,]\d+)?$/.test(x.trim()))) return 'number'
  if (v.every((x) => /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/.test(x.trim()))) return 'date'
  const distinct = new Set(v.map((x) => x.trim().toLowerCase()))
  if (v.length >= 6 && distinct.size <= Math.min(8, Math.floor(v.length / 2))) return 'select'
  return 'text'
}

export function DatabaseView({ session, pageId, title }: { session: WorkspaceSession; pageId: string; title: string }) {
  const { db, handle, snap, loaded } = useDatabase(session, pageId)
  const [activeId, setActiveId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [peek, setPeek] = useState<string | null>(null)
  const [remoteCells, setRemoteCells] = useState<Map<string, RemoteFocus>>(new Map())
  const fileRef = useRef<HTMLInputElement>(null)

  // Presenze a livello di cella: chi sta modificando quale cella.
  useEffect(() => {
    const aw = handle?.provider?.awareness
    if (!aw) return
    const update = () => {
      const m = new Map<string, RemoteFocus>()
      aw.getStates().forEach((st, id) => {
        if (id === aw.clientID || !st.cell || !st.user) return
        m.set(st.cell as string, st.user as RemoteFocus)
      })
      setRemoteCells(m)
    }
    aw.on('change', update)
    update()
    return () => { aw.off('change', update); aw.setLocalStateField('cell', null) }
  }, [handle])

  const setFocusCell = useCallback((key: string | null) => handle?.provider?.awareness.setLocalStateField('cell', key), [handle])

  const view = snap?.views.find((v) => v.id === activeId) ?? snap?.views[0]
  const result = useMemo(() => (snap && view ? queryView(snap, view, search) : null), [snap, view, search])

  if (!db || !snap) return <div className="db-loading">Caricamento…</div>
  if (!snap.ready || !view || !result) {
    return (
      <div className="empty-state">
        {loaded ? (
          <>
            <p>Questo database non è ancora configurato.</p>
            <button className="btn primary" onClick={() => initDatabase(db)}>Crea struttura predefinita</button>
          </>
        ) : 'Caricamento…'}
      </div>
    )
  }

  const createOption = (colId: string, label: string) => addOption(db, colId, label)

  const newRow: ViewCtx['newRow'] = (cells = {}, opts = {}) => {
    // Default impliciti: i filtri "è <valore>" su select/checkbox popolano la nuova riga così non sparisce subito.
    const implicit: Record<string, unknown> = {}
    if (view.filterMode === 'and') {
      for (const f of view.filters) {
        const c = snap.columns.find((x) => x.id === f.col)
        if (!c) continue
        if ((c.type === 'select' || c.type === 'status') && f.op === 'is' && f.value) implicit[c.id] = f.value
        if (c.type === 'checkbox' && f.op === 'checked') implicit[c.id] = true
      }
    }
    const first = snap.columns.find((c) => c.type === 'status')
    const defaults: Record<string, unknown> = {}
    if (first?.options?.length && !(first.id in cells) && !(first.id in implicit)) defaults[first.id] = first.options[0].id
    const id = addRow(db, { ...defaults, ...implicit, ...cells }, { after: opts.after })
    if (opts.open) setPeek(id)
    return id
  }

  const ctx: ViewCtx = { db, snap, view, result, remoteCells, setFocusCell, openRow: setPeek, createOption, newRow }

  const exportCSV = () => {
    const header = snap.columns.map((c) => c.name)
    const rows = result.rows.map((r) => snap.columns.map((c) => displayValue(cellValue(r, c, result.ctx), c)))
    const blob = new Blob(['﻿' + toCSV([header, ...rows])], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(title || 'database').replace(/[^\p{L}\p{N}_-]+/gu, '_')}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const importCSV = async (file: File) => {
    const rows = parseCSV(await file.text())
    if (rows.length < 2) { alert('Il file CSV è vuoto.'); return }
    const [header, ...body] = rows
    db.doc.transact(() => {
      const colIds: (Column | null)[] = header.map((h, i) => {
        const name = h.trim() || `Colonna ${i + 1}`
        const existing = snap.columns.find((c) => c.name.toLowerCase() === name.toLowerCase())
        if (existing) return existing
        const col = makeColumn(name, inferType(body.map((r) => r[i] ?? '')))
        addColumn(db, col)
        return col
      })
      for (const r of body) {
        const cells: Record<string, unknown> = {}
        const needOptions: [Column, string[]][] = []
        colIds.forEach((col, i) => {
          if (!col || col.type === 'formula' || col.type === 'created') return
          const parsed = parseInput(col, r[i] ?? '')
          if (parsed.newOptions) needOptions.push([col, parsed.newOptions])
          else if (parsed.value != null) cells[col.id] = parsed.value
        })
        for (const [col, labels] of needOptions) {
          const ids = labels.map((l) => addOption(db, col.id, l)?.id).filter(Boolean) as string[]
          const prev = cells[col.id]
          if (col.type === 'multiselect') cells[col.id] = [...(Array.isArray(prev) ? prev : []), ...ids]
          else if (ids[0]) cells[col.id] = ids[0]
        }
        addRow(db, cells)
      }
    })
  }

  return (
    <div className="database">
      <Toolbar
        db={db} snap={snap} view={view} activeId={view.id} setActive={setActiveId}
        search={search} setSearch={setSearch}
        onNewRow={() => newRow({}, { open: view.type !== 'table' })}
        onImport={() => fileRef.current?.click()} onExport={exportCSV}
      />
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = '' }} />
      {view.type === 'table' && <TableView {...ctx} />}
      {view.type === 'board' && <BoardView {...ctx} />}
      {view.type === 'calendar' && <CalendarView {...ctx} />}
      {peek && <RowPeek ctx={ctx} rowId={peek} onClose={() => setPeek(null)} />}
    </div>
  )
}

