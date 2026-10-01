import { useState } from 'react'
import { CellChip } from './Cells'
import { setCell, updateView, type Column } from './schema'
import { cellValue, groupRows, displayValue } from './query'
import type { ViewCtx } from './viewTypes'

export function BoardView(ctx: ViewCtx) {
  const { db, snap, view, result } = ctx
  const groupCols = snap.columns.filter((c) => c.type === 'status' || c.type === 'select')
  const gcol = snap.columns.find((c) => c.id === view.groupBy && (c.type === 'status' || c.type === 'select')) ?? groupCols[0]
  const [dragOver, setDragOver] = useState<string | null>(null)

  if (!gcol) {
    return <div className="empty-state">Per usare la vista Board serve una proprietà di tipo <b>Stato</b> o <b>Selezione</b>. Aggiungila nella vista Tabella.</div>
  }
  const title = snap.columns[0]
  const props: Column[] = snap.columns.filter((c) => c.id !== title.id && c.id !== gcol.id && !view.hidden.includes(c.id)).slice(0, 3)
  const groups = groupRows(result.rows, gcol, result.ctx)

  const move = (rowId: string, key: string) => setCell(db, rowId, gcol.id, key || null)

  return (
    <div className="board">
      {groupCols.length > 1 && (
        <div className="board-groupby">
          Raggruppa per
          <select value={gcol.id} onChange={(e) => updateView(db, view.id, { groupBy: e.target.value })}>
            {groupCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="board-cols">
        {groups.map((g) => (
          <div
            key={g.key || '__none'}
            className={`board-col ${dragOver === g.key ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(g.key) }}
            onDragLeave={() => setDragOver((k) => (k === g.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const id = e.dataTransfer.getData('text/row')
              if (id) move(id, g.key)
            }}
          >
            <div className="board-col-head">
              {g.color ? <span className={`tag tag-${g.color}`}>{g.label}</span> : <span className="tag tag-gray">{g.label}</span>}
              <span className="group-count">{g.rows.length}</span>
            </div>
            <div className="board-cards">
              {g.rows.map((row) => (
                <div
                  key={row.id}
                  className="card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/row', row.id)}
                  onClick={() => ctx.openRow(row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && ctx.openRow(row.id)}
                >
                  <div className="card-title">{displayValue(cellValue(row, title, result.ctx), title) || <span className="untitled">Senza titolo</span>}</div>
                  <div className="card-props">
                    {props.map((c) => <CellChip key={c.id} col={c} value={cellValue(row, c, result.ctx)} />)}
                  </div>
                  <select className="card-move" value={g.key} aria-label="Sposta in colonna"
                    onClick={(e) => e.stopPropagation()} onChange={(e) => move(row.id, e.target.value)}>
                    {groups.map((o) => <option key={o.key || '__none'} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button className="add-card" onClick={() => ctx.newRow({ [gcol.id]: g.key || null }, { open: true })}>＋ Nuova</button>
          </div>
        ))}
      </div>
    </div>
  )
}
