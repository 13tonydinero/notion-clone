import { Fragment, useCallback, useRef, useState } from 'react'
import { Popover } from '../components/Popover'
import { CellEditor } from './Cells'
import { ColumnMenu } from './ColumnMenu'
import {
  addColumn, deleteRows, duplicateRow, makeColumn, setCell, typeInfo, updateColumn, updateView, addOption,
  type Column, type Row, type SummaryKind,
} from './schema'
import { SUMMARY_LABELS, cellValue, computeSummary, summaryOptions } from './query'
import { parseInput } from './input'
import type { ViewCtx } from './viewTypes'

const TITLE_MIN = 220

function SummaryCell({ col, rows, ctx, kind, onPick }: { col: Column; rows: Row[]; ctx: ViewCtx['result']['ctx']; kind: SummaryKind; onPick: (k: SummaryKind) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const value = computeSummary(kind, col, rows, ctx)
  return (
    <>
      <button ref={ref} className="summary-btn" onClick={() => setOpen(true)}>
        {kind === 'none' ? <span className="summary-hint">Calcola</span> : <><span className="summary-label">{SUMMARY_LABELS[kind]}</span> <b>{value}</b></>}
      </button>
      {open && (
        <Popover anchor={ref} onClose={() => setOpen(false)} width={200}>
          <div className="menu-list">
            {summaryOptions(col).map((k) => (
              <button key={k} className="menu-item" onClick={() => { onPick(k); setOpen(false) }}>
                {SUMMARY_LABELS[k]} {k === kind && <span className="menu-check">✓</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  )
}

export function TableView(ctx: ViewCtx) {
  const { db, snap, view, result, remoteCells } = ctx
  const [menuCol, setMenuCol] = useState<{ id: string; el: HTMLElement } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [liveWidth, setLiveWidth] = useState<Record<string, number>>({})
  const [typeMenu, setTypeMenu] = useState<HTMLElement | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const columns = snap.columns.filter((c, i) => i === 0 || !view.hidden.includes(c.id))
  const widthOf = (c: Column, i: number) => liveWidth[c.id] ?? c.width ?? (i === 0 ? 260 : c.type === 'checkbox' ? 90 : c.type === 'date' ? 150 : 180)

  const startResize = (e: React.PointerEvent, col: Column, i: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widthOf(col, i)
    let w = startW
    const move = (ev: PointerEvent) => {
      w = Math.max(i === 0 ? TITLE_MIN - 100 : 80, startW + ev.clientX - startX)
      setLiveWidth((prev) => ({ ...prev, [col.id]: w }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      updateColumn(db, col.id, { width: Math.round(w) })
      setLiveWidth((prev) => { const n = { ...prev }; delete n[col.id]; return n })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const focusCell = (rowId: string, colId: string) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${CSS.escape(`${rowId}:${colId}`)}"]`)
    el?.focus()
  }
  const enterNext = (rowIdx: number, rows: Row[], colId: string) => () => {
    const next = rows[rowIdx + 1]
    if (next) setTimeout(() => focusCell(next.id, colId), 0)
  }

  /** Incolla una griglia (es. copiata da Excel) a partire dalla cella indicata. */
  const pasteGrid = useCallback((rows: Row[], startRow: number, startCol: number) => (text: string) => {
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    db.doc.transact(() => {
      grid.forEach((cells, ri) => {
        let rowId = rows[startRow + ri]?.id
        if (!rowId) rowId = ctx.newRow({}, {})
        cells.forEach((txt, ci) => {
          const col = columns[startCol + ci]
          if (!col || col.type === 'formula' || col.type === 'created') return
          let parsed = parseInput(col, txt)
          if (parsed.newOptions?.length) {
            const ids = parsed.newOptions.map((l) => addOption(db, col.id, l)?.id).filter(Boolean) as string[]
            parsed = { value: col.type === 'multiselect' ? [...(Array.isArray(parsed.value) ? parsed.value : []), ...ids] : ids[0] ?? null }
          }
          setCell(db, rowId!, col.id, parsed.value)
        })
      })
    })
    return true
  }, [db, columns, ctx])

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allIds = result.rows.map((r) => r.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))

  const renderRows = (rows: Row[], groupDefaults?: Record<string, unknown>) => (
    <>
      {rows.map((row, ri) => (
        <tr key={row.id} className={selected.has(row.id) ? 'selected' : ''}>
          <td className="gutter">
            <input type="checkbox" className="row-check" checked={selected.has(row.id)} onChange={() => toggleSel(row.id)} aria-label="Seleziona riga" />
          </td>
          {columns.map((col, ci) => {
            const key = `${row.id}:${col.id}`
            const remote = remoteCells.get(key)
            return (
              <td key={col.id} className={`cell ${ci === 0 ? 'sticky-col' : ''} ${remote ? 'remote' : ''}`}
                style={remote ? ({ '--rc': remote.color } as React.CSSProperties) : undefined} data-remote={remote?.name}>
                <div className="cell-inner">
                  <CellEditor
                    col={col}
                    value={cellValue(row, col, result.ctx)}
                    cellKey={key}
                    onChange={(v) => setCell(db, row.id, col.id, v)}
                    onCreateOption={(label) => ctx.createOption(col.id, label)}
                    onFocusCell={ctx.setFocusCell}
                    onPasteGrid={pasteGrid(rows, ri, ci)}
                    onEnterNext={enterNext(ri, rows, col.id)}
                  />
                  {ci === 0 && (
                    <button className="row-open" onClick={() => ctx.openRow(row.id)} title="Apri riga" aria-label="Apri riga">⤢</button>
                  )}
                </div>
              </td>
            )
          })}
          <td className="cell-end" />
        </tr>
      ))}
      <tr className="add-row">
        <td className="gutter" />
        <td colSpan={columns.length + 1}>
          <button className="add-row-btn" onClick={() => ctx.newRow(groupDefaults ?? {}, { open: false })}>＋ Nuova riga</button>
        </td>
      </tr>
    </>
  )

  const groupDefaultsFor = (key: string): Record<string, unknown> => {
    const gcol = snap.columns.find((c) => c.id === view.groupBy)
    if (!gcol || !key) return {}
    if (gcol.type === 'select' || gcol.type === 'status') return { [gcol.id]: key }
    if (gcol.type === 'multiselect') return { [gcol.id]: [key] }
    if (gcol.type === 'text') return { [gcol.id]: key }
    return {}
  }

  const totalWidth = 40 + columns.reduce((a, c, i) => a + widthOf(c, i), 0) + 60

  return (
    <div className="table-wrap">
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} selezionat{selected.size === 1 ? 'a' : 'e'}</span>
          <button onClick={() => { selected.forEach((id) => duplicateRow(db, id)); setSelected(new Set()) }}>Duplica</button>
          <button className="danger" onClick={() => { if (confirm(`Eliminare ${selected.size} righe?`)) { deleteRows(db, [...selected]); setSelected(new Set()) } }}>Elimina</button>
          <button onClick={() => setSelected(new Set())}>Annulla</button>
        </div>
      )}
      <div className="table-scroll">
        <table ref={tableRef} className="db-table" style={{ width: totalWidth }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {columns.map((c, i) => <col key={c.id} style={{ width: widthOf(c, i) }} />)}
            <col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="gutter">
                <input type="checkbox" className="row-check always" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))} aria-label="Seleziona tutto" />
              </th>
              {columns.map((c, i) => {
                const sorted = view.sorts.find((s) => s.col === c.id)
                return (
                  <th key={c.id} className={i === 0 ? 'sticky-col' : ''}>
                    <button className="th-btn" onClick={(e) => setMenuCol({ id: c.id, el: e.currentTarget.parentElement as HTMLElement })}>
                      <span className="th-icon">{typeInfo(c.type).icon}</span>
                      <span className="th-name">{c.name}</span>
                      {sorted && <span className="th-sort">{sorted.dir === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                    <span className="resizer" onPointerDown={(e) => startResize(e, c, i)} />
                  </th>
                )
              })}
              <th className="th-add">
                <button className="th-btn" onClick={(e) => setTypeMenu(e.currentTarget)} title="Aggiungi proprietà" aria-label="Aggiungi proprietà">＋</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {result.groups
              ? result.groups.map((g) => {
                  const isCollapsed = collapsed.has(g.key)
                  const opt = snap.columns.find((c) => c.id === view.groupBy)?.options?.find((o) => o.id === g.key)
                  return (
                    <Fragment key={g.key || '__none'}>
                      <tr className="group-row">
                        <td colSpan={columns.length + 2}>
                          <button className="group-toggle" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n })}>
                            <span className={`chev ${isCollapsed ? '' : 'open'}`}>▸</span>
                            {opt ? <span className={`tag tag-${opt.color}`}>{opt.label}</span> : <b>{g.label}</b>}
                            <span className="group-count">{g.rows.length}</span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed && renderRows(g.rows, groupDefaultsFor(g.key))}
                    </Fragment>
                  )
                })
              : renderRows(result.rows)}
          </tbody>
          <tfoot>
            <tr>
              <td className="gutter" />
              {columns.map((c, i) => (
                <td key={c.id} className={i === 0 ? 'sticky-col' : ''}>
                  <SummaryCell col={c} rows={result.rows} ctx={result.ctx} kind={view.summaries[c.id] ?? 'none'}
                    onPick={(k) => updateView(db, view.id, { summaries: { ...view.summaries, [c.id]: k } })} />
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {menuCol && (() => {
        const col = snap.columns.find((c) => c.id === menuCol.id)
        return col ? <ColumnMenu col={col} isTitle={snap.columns[0].id === col.id} db={db} snap={snap} view={view} anchor={menuCol.el} onClose={() => setMenuCol(null)} /> : null
      })()}
      {typeMenu && (
        <Popover anchor={typeMenu} onClose={() => setTypeMenu(null)} width={230} align="right">
          <div className="menu-label pad">Nuova proprietà</div>
          <div className="menu-list">
            {(['text', 'number', 'select', 'multiselect', 'status', 'date', 'checkbox', 'url', 'email', 'phone', 'formula', 'created'] as const).map((t) => (
              <button key={t} className="menu-item" onClick={() => {
                const info = typeInfo(t)
                addColumn(db, makeColumn(info.label, t, t === 'formula' ? { formula: '' } : {}))
                setTypeMenu(null)
              }}>
                <span className="th-icon">{typeInfo(t).icon}</span> {typeInfo(t).label}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

