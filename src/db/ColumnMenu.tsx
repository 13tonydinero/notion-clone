import { useMemo, useRef, useState } from 'react'
import { Popover } from '../components/Popover'
import {
  COL_TYPES, OPTION_COLORS, addOption, deleteColumn, moveColumn, removeOption, updateColumn, updateOption, updateView,
  type Column, type ColType, type DbHandles, type DbSnapshot, type View,
} from './schema'
import { cellValue, displayValue, makeContext } from './query'
import { parseInput } from './input'

/** Cambia il tipo di una colonna provando a convertire i valori esistenti. */
export function changeColumnType(db: DbHandles, snap: DbSnapshot, col: Column, type: ColType) {
  if (col.type === type) return
  const ctx = makeContext(snap.columns)
  const texts = snap.rows.map((r) => ({ id: r.id, text: displayValue(cellValue(r, col, ctx), col) }))
  db.doc.transact(() => {
    const isSelectKind = type === 'select' || type === 'multiselect' || type === 'status'
    const patch: Partial<Column> = { type, options: isSelectKind ? [] : undefined }
    if (type === 'status') patch.options = [] // le opzioni vengono create dai valori esistenti
    updateColumn(db, col.id, patch)
    const probe: Column = { ...col, type, options: [] }
    for (const { id, text } of texts) {
      const r = db.rows.get(id)
      if (!r) continue
      if (!text) { r.delete(col.id); continue }
      if (isSelectKind) {
        const labels = type === 'multiselect' ? text.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [text]
        const ids = labels.map((l) => addOption(db, col.id, l)?.id).filter(Boolean) as string[]
        if (ids.length) r.set(col.id, type === 'multiselect' ? ids : ids[0])
        else r.delete(col.id)
      } else {
        const { value } = parseInput(probe, text)
        if (value === null || value === undefined) r.delete(col.id)
        else r.set(col.id, value)
      }
    }
    if (type === 'status' && !(db.columns.toArray().find((m) => m.get('id') === col.id)?.get('options') as unknown[])?.length) {
      for (const l of ['Da fare', 'In corso', 'Fatto']) addOption(db, col.id, l)
    }
  })
}

interface Props {
  col: Column
  isTitle: boolean
  db: DbHandles
  snap: DbSnapshot
  view: View
  anchor: HTMLElement | null
  onClose: () => void
}

export function ColumnMenu({ col, isTitle, db, snap, view, anchor, onClose }: Props) {
  const [name, setName] = useState(col.name)
  const [formula, setFormula] = useState(col.formula ?? '')
  const [newOpt, setNewOpt] = useState('')
  const anchorRef = useRef(anchor)
  anchorRef.current = anchor
  const hasOptions = col.type === 'select' || col.type === 'multiselect' || col.type === 'status'
  const formulaPreview = useMemo(() => {
    if (col.type !== 'formula' || !formula.trim() || !snap.rows[0]) return null
    const ctx = makeContext(snap.columns.map((c) => (c.id === col.id ? { ...c, formula } : c)))
    const v = cellValue(snap.rows[0], { ...col, formula }, ctx)
    return v && typeof v === 'object' && !Array.isArray(v) && 'error' in v ? `⚠ ${v.error}` : `= ${displayValue(v, col) || '(vuoto)'}`
  }, [col, formula, snap])

  const commitName = () => { const n = name.trim(); if (n && n !== col.name) updateColumn(db, col.id, { name: n }) }
  const setSort = (dir: 'asc' | 'desc') => { updateView(db, view.id, { sorts: [{ col: col.id, dir }] }); onClose() }

  return (
    <Popover anchor={anchorRef} onClose={() => { commitName(); onClose() }} width={288} className="column-menu">
      <div className="menu-section">
        <input className="menu-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') { commitName(); onClose() } }} aria-label="Nome proprietà" />
        {!isTitle && (
          <select className="menu-select" value={col.type} onChange={(e) => changeColumnType(db, snap, col, e.target.value as ColType)}>
            {COL_TYPES.map((t) => <option key={t.type} value={t.type}>{t.icon}  {t.label}</option>)}
          </select>
        )}
      </div>

      {col.type === 'number' && (
        <div className="menu-section">
          <label className="menu-label">Formato</label>
          <select className="menu-select" value={col.numberFormat ?? 'number'} onChange={(e) => updateColumn(db, col.id, { numberFormat: e.target.value as Column['numberFormat'] })}>
            <option value="number">Numero</option><option value="decimal2">2 decimali</option>
            <option value="euro">Euro (€)</option><option value="percent">Percentuale</option>
          </select>
        </div>
      )}

      {col.type === 'formula' && (
        <div className="menu-section">
          <label className="menu-label">Formula</label>
          <textarea className="menu-textarea" rows={3} value={formula} placeholder={'prop("Prezzo") * prop("Quantità")'} spellCheck={false}
            onChange={(e) => setFormula(e.target.value)} onBlur={() => updateColumn(db, col.id, { formula })} />
          {formulaPreview && <div className={`menu-hint ${formulaPreview.startsWith('⚠') ? 'err' : ''}`}>{formulaPreview}</div>}
          <div className="menu-hint">Funzioni: if, round, sum, min, max, concat, upper, lower, datediff, today… Operatori: + - * / % ^ == != &lt; &gt; && ||</div>
          <select className="menu-select" value={col.numberFormat ?? 'number'} onChange={(e) => updateColumn(db, col.id, { numberFormat: e.target.value as Column['numberFormat'] })}>
            <option value="number">Formato numero</option><option value="decimal2">2 decimali</option>
            <option value="euro">Euro (€)</option><option value="percent">Percentuale</option>
          </select>
        </div>
      )}

      {hasOptions && (
        <div className="menu-section">
          <label className="menu-label">Opzioni</label>
          <div className="option-editor">
            {(col.options ?? []).map((o) => (
              <div key={o.id} className="option-row">
                <select className={`color-dot tag-${o.color}`} value={o.color} onChange={(e) => updateOption(db, col.id, o.id, { color: e.target.value })} aria-label="Colore">
                  {OPTION_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="menu-input small" defaultValue={o.label} onBlur={(e) => e.target.value.trim() && updateOption(db, col.id, o.id, { label: e.target.value.trim() })} />
                <button className="icon-btn danger" title="Rimuovi opzione" onClick={() => removeOption(db, col.id, o.id)}>✕</button>
              </div>
            ))}
            <div className="option-row">
              <input className="menu-input small" placeholder="Nuova opzione…" value={newOpt} onChange={(e) => setNewOpt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newOpt.trim()) { addOption(db, col.id, newOpt.trim()); setNewOpt('') } }} />
              <button className="icon-btn" onClick={() => { if (newOpt.trim()) { addOption(db, col.id, newOpt.trim()); setNewOpt('') } }}>＋</button>
            </div>
          </div>
        </div>
      )}

      <div className="menu-list">
        <button className="menu-item" onClick={() => setSort('asc')}>↑ Ordina crescente</button>
        <button className="menu-item" onClick={() => setSort('desc')}>↓ Ordina decrescente</button>
        {!isTitle && (
          <>
            <button className="menu-item" onClick={() => { updateView(db, view.id, { hidden: [...view.hidden, col.id] }); onClose() }}>🙈 Nascondi in questa vista</button>
            <button className="menu-item" onClick={() => moveColumn(db, col.id, -1)}>← Sposta a sinistra</button>
            <button className="menu-item" onClick={() => moveColumn(db, col.id, 1)}>→ Sposta a destra</button>
            <button className="menu-item danger" onClick={() => { if (confirm(`Eliminare la proprietà “${col.name}” e tutti i suoi valori?`)) { deleteColumn(db, col.id); onClose() } }}>🗑 Elimina proprietà</button>
          </>
        )}
      </div>
    </Popover>
  )
}
