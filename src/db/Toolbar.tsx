import { useRef, useState } from 'react'
import { Popover } from '../components/Popover'
import {
  addView, deleteView, makeView, updateView, typeInfo,
  type Column, type DbHandles, type DbSnapshot, type Filter, type View, type ViewType,
} from './schema'
import { OPS_BY_TYPE, filterKind, opNeedsValue } from './query'
import { newViewId } from '../lib/ids'

const VIEW_ICONS: Record<ViewType, string> = { table: '▦', board: '▥', calendar: '📅' }
const VIEW_LABELS: Record<ViewType, string> = { table: 'Tabella', board: 'Board', calendar: 'Calendario' }

function FilterRow({ f, columns, onChange, onRemove }: { f: Filter; columns: Column[]; onChange: (p: Partial<Filter>) => void; onRemove: () => void }) {
  const col = columns.find((c) => c.id === f.col) ?? columns[0]
  const kind = col.type === 'formula' ? 'text' : filterKind(col)
  const ops = OPS_BY_TYPE[kind] ?? OPS_BY_TYPE.text
  return (
    <div className="filter-row">
      <select value={f.col} onChange={(e) => {
        const nc = columns.find((c) => c.id === e.target.value)!
        const nk = nc.type === 'formula' ? 'text' : filterKind(nc)
        onChange({ col: nc.id, op: (OPS_BY_TYPE[nk] ?? OPS_BY_TYPE.text)[0].op, value: '' })
      }}>
        {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={f.op} onChange={(e) => onChange({ op: e.target.value as Filter['op'] })}>
        {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {opNeedsValue(f.op) && (
        kind === 'select' || kind === 'multiselect' ? (
          <select value={f.value} onChange={(e) => onChange({ value: e.target.value })}>
            <option value="">—</option>
            {(col.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        ) : kind === 'date' ? (
          <div className="filter-date">
            <input type="date" value={f.value === 'today' ? '' : f.value} onChange={(e) => onChange({ value: e.target.value })} />
            <button className={`chip-btn ${f.value === 'today' ? 'on' : ''}`} onClick={() => onChange({ value: f.value === 'today' ? '' : 'today' })}>Oggi</button>
          </div>
        ) : (
          <input type="text" inputMode={kind === 'number' ? 'decimal' : 'text'} value={f.value} placeholder="Valore" onChange={(e) => onChange({ value: e.target.value })} />
        )
      )}
      <button className="icon-btn danger" onClick={onRemove} aria-label="Rimuovi filtro">✕</button>
    </div>
  )
}

export function Toolbar({ db, snap, view, activeId, setActive, search, setSearch, onNewRow, onImport, onExport }: {
  db: DbHandles
  snap: DbSnapshot
  view: View
  activeId: string
  setActive: (id: string) => void
  search: string
  setSearch: (s: string) => void
  onNewRow: () => void
  onImport: () => void
  onExport: () => void
}) {
  const [open, setOpen] = useState<null | 'filter' | 'sort' | 'group' | 'props' | 'addview' | 'viewmenu' | 'more'>(null)
  const refs = {
    filter: useRef<HTMLButtonElement>(null), sort: useRef<HTMLButtonElement>(null), group: useRef<HTMLButtonElement>(null),
    props: useRef<HTMLButtonElement>(null), addview: useRef<HTMLButtonElement>(null), viewmenu: useRef<HTMLButtonElement>(null), more: useRef<HTMLButtonElement>(null),
  }
  const close = () => setOpen(null)
  const cols = snap.columns

  const addFilter = () => updateView(db, view.id, { filters: [...view.filters, { id: newViewId(), col: cols[0].id, op: OPS_BY_TYPE[filterKind(cols[0])][0].op, value: '' }] })
  const patchFilter = (id: string, p: Partial<Filter>) => updateView(db, view.id, { filters: view.filters.map((f) => (f.id === id ? { ...f, ...p } : f)) })

  const createView = (type: ViewType) => {
    const extra: Partial<View> = {}
    if (type === 'board') extra.groupBy = cols.find((c) => c.type === 'status' || c.type === 'select')?.id
    if (type === 'calendar') extra.dateCol = cols.find((c) => c.type === 'date')?.id
    const v = makeView(VIEW_LABELS[type], type, extra)
    addView(db, v)
    setActive(v.id)
    close()
  }

  const [renaming, setRenaming] = useState(view.name)

  return (
    <div className="db-toolbar">
      <div className="view-tabs" role="tablist">
        {snap.views.map((v) => (
          <span key={v.id} className={`view-tab-wrap ${v.id === activeId ? 'active' : ''}`}>
            <button role="tab" aria-selected={v.id === activeId} className={`view-tab ${v.id === activeId ? 'active' : ''}`} onClick={() => setActive(v.id)}>
              <span>{VIEW_ICONS[v.type]}</span> {v.name}
            </button>
            {v.id === activeId && (
              <button ref={refs.viewmenu} className="view-tab-caret" aria-label="Opzioni vista" title="Rinomina o elimina la vista" onClick={() => { setRenaming(v.name); setOpen('viewmenu') }}>⌄</button>
            )}
          </span>
        ))}
        <button ref={refs.addview} className="view-tab add" onClick={() => setOpen('addview')} aria-label="Aggiungi vista">＋</button>
      </div>
      <div className="toolbar-actions">
        <button ref={refs.filter} title="Filtri" aria-label="Filtri" className={`btn ${view.filters.length ? 'active' : ''}`} onClick={() => setOpen('filter')}>
          ⏷ <span className="lbl">Filtri</span>{view.filters.length > 0 && <span className="badge">{view.filters.length}</span>}
        </button>
        <button ref={refs.sort} title="Ordina" aria-label="Ordina" className={`btn ${view.sorts.length ? 'active' : ''}`} onClick={() => setOpen('sort')}>
          ↕ <span className="lbl">Ordina</span>{view.sorts.length > 0 && <span className="badge">{view.sorts.length}</span>}
        </button>
        {view.type === 'table' && (
          <button ref={refs.group} title="Raggruppa" aria-label="Raggruppa" className={`btn ${view.groupBy ? 'active' : ''}`} onClick={() => setOpen('group')}>▤ <span className="lbl">Raggruppa</span></button>
        )}
        <button ref={refs.props} title="Proprietà visibili" aria-label="Proprietà" className={`btn ${view.hidden.length ? 'active' : ''}`} onClick={() => setOpen('props')}>👁 <span className="lbl">Proprietà</span></button>
        <input className="db-search" type="search" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cerca nel database" />
        <button ref={refs.more} className="btn" onClick={() => setOpen('more')} aria-label="Altro">⋯</button>
        <button className="btn primary" title="Nuova riga" aria-label="Nuova riga" onClick={onNewRow}>＋ <span className="lbl">Nuova</span></button>
      </div>

      {open === 'filter' && (
        <Popover anchor={refs.filter} onClose={close} width={420} className="wide">
          <div className="menu-section">
            {view.filters.length === 0 && <div className="menu-empty">Nessun filtro</div>}
            {view.filters.length > 1 && (
              <div className="seg">
                <button className={view.filterMode === 'and' ? 'on' : ''} onClick={() => updateView(db, view.id, { filterMode: 'and' })}>Tutti (E)</button>
                <button className={view.filterMode === 'or' ? 'on' : ''} onClick={() => updateView(db, view.id, { filterMode: 'or' })}>Almeno uno (O)</button>
              </div>
            )}
            {view.filters.map((f) => (
              <FilterRow key={f.id} f={f} columns={cols} onChange={(p) => patchFilter(f.id, p)} onRemove={() => updateView(db, view.id, { filters: view.filters.filter((x) => x.id !== f.id) })} />
            ))}
            <button className="menu-item" onClick={addFilter}>＋ Aggiungi filtro</button>
          </div>
        </Popover>
      )}

      {open === 'sort' && (
        <Popover anchor={refs.sort} onClose={close} width={340} className="wide">
          <div className="menu-section">
            {view.sorts.length === 0 && <div className="menu-empty">Nessun ordinamento</div>}
            {view.sorts.map((s, i) => (
              <div key={i} className="filter-row">
                <select value={s.col} onChange={(e) => updateView(db, view.id, { sorts: view.sorts.map((x, j) => (j === i ? { ...x, col: e.target.value } : x)) })}>
                  {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={s.dir} onChange={(e) => updateView(db, view.id, { sorts: view.sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)) })}>
                  <option value="asc">Crescente</option><option value="desc">Decrescente</option>
                </select>
                <button className="icon-btn danger" onClick={() => updateView(db, view.id, { sorts: view.sorts.filter((_, j) => j !== i) })} aria-label="Rimuovi">✕</button>
              </div>
            ))}
            <button className="menu-item" onClick={() => updateView(db, view.id, { sorts: [...view.sorts, { col: cols.find((c) => !view.sorts.some((s) => s.col === c.id))?.id ?? cols[0].id, dir: 'asc' }] })}>＋ Aggiungi ordinamento</button>
          </div>
        </Popover>
      )}

      {open === 'group' && (
        <Popover anchor={refs.group} onClose={close} width={240}>
          <div className="menu-list">
            <button className="menu-item" onClick={() => { updateView(db, view.id, { groupBy: undefined }); close() }}>Nessun raggruppamento {!view.groupBy && <span className="menu-check">✓</span>}</button>
            {cols.filter((c) => c.type !== 'formula').map((c) => (
              <button key={c.id} className="menu-item" onClick={() => { updateView(db, view.id, { groupBy: c.id }); close() }}>
                <span className="th-icon">{typeInfo(c.type).icon}</span> {c.name} {view.groupBy === c.id && <span className="menu-check">✓</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {open === 'props' && (
        <Popover anchor={refs.props} onClose={close} width={260}>
          <div className="menu-list">
            {cols.map((c, i) => {
              const hidden = view.hidden.includes(c.id)
              return (
                <button key={c.id} className="menu-item" disabled={i === 0} onClick={() => updateView(db, view.id, { hidden: hidden ? view.hidden.filter((h) => h !== c.id) : [...view.hidden, c.id] })}>
                  <span className="th-icon">{typeInfo(c.type).icon}</span> {c.name}
                  <span className="menu-check">{i === 0 ? '🔒' : hidden ? '🙈' : '👁'}</span>
                </button>
              )
            })}
          </div>
        </Popover>
      )}

      {open === 'addview' && (
        <Popover anchor={refs.addview} onClose={close} width={200}>
          <div className="menu-label pad">Nuova vista</div>
          <div className="menu-list">
            {(['table', 'board', 'calendar'] as ViewType[]).map((t) => (
              <button key={t} className="menu-item" onClick={() => createView(t)}>{VIEW_ICONS[t]} {VIEW_LABELS[t]}</button>
            ))}
          </div>
        </Popover>
      )}

      {open === 'viewmenu' && (
        <Popover anchor={refs.viewmenu} onClose={() => { const n = renaming.trim(); if (n && n !== view.name) updateView(db, view.id, { name: n }); close() }} width={240}>
          <div className="menu-section">
            <input className="menu-input" value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="Nome vista"
              onKeyDown={(e) => { if (e.key === 'Enter') { const n = renaming.trim(); if (n) updateView(db, view.id, { name: n }); close() } }} />
          </div>
          <div className="menu-list">
            {snap.views.length > 1 && <button className="menu-item danger" onClick={() => { deleteView(db, view.id); setActive(snap.views.find((v) => v.id !== view.id)!.id); close() }}>🗑 Elimina vista</button>}
          </div>
        </Popover>
      )}

      {open === 'more' && (
        <Popover anchor={refs.more} onClose={close} width={220} align="right">
          <div className="menu-list">
            <button className="menu-item" onClick={() => { close(); onImport() }}>⬆ Importa CSV…</button>
            <button className="menu-item" onClick={() => { close(); onExport() }}>⬇ Esporta CSV</button>
          </div>
        </Popover>
      )}
    </div>
  )
}
