import * as Y from 'yjs'
import { newColId, newOptionId, newRowId, newViewId } from '../lib/ids'

export type ColType =
  | 'text' | 'number' | 'select' | 'multiselect' | 'status' | 'date'
  | 'checkbox' | 'url' | 'email' | 'phone' | 'formula' | 'created'

export const COL_TYPES: { type: ColType; label: string; icon: string }[] = [
  { type: 'text', label: 'Testo', icon: 'Aa' },
  { type: 'number', label: 'Numero', icon: '#' },
  { type: 'select', label: 'Selezione', icon: '◉' },
  { type: 'multiselect', label: 'Selezione multipla', icon: '☰' },
  { type: 'status', label: 'Stato', icon: '◐' },
  { type: 'date', label: 'Data', icon: '📅' },
  { type: 'checkbox', label: 'Casella', icon: '☑' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'email', label: 'Email', icon: '✉' },
  { type: 'phone', label: 'Telefono', icon: '☎' },
  { type: 'formula', label: 'Formula', icon: 'ƒ' },
  { type: 'created', label: 'Data creazione', icon: '🕓' },
]
export const typeInfo = (t: ColType) => COL_TYPES.find((c) => c.type === t) ?? COL_TYPES[0]

export const OPTION_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

export interface SelectOption { id: string; label: string; color: string }

export type NumberFormat = 'number' | 'euro' | 'percent' | 'decimal2'

export interface Column {
  id: string
  name: string
  type: ColType
  options?: SelectOption[]
  formula?: string
  numberFormat?: NumberFormat
  width?: number
}

export type FilterOp =
  | 'contains' | 'not_contains' | 'is' | 'is_not' | 'starts' | 'empty' | 'not_empty'
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'before' | 'after' | 'on_or_before' | 'on_or_after'
  | 'checked' | 'unchecked'

export interface Filter { id: string; col: string; op: FilterOp; value: string }
export interface Sort { col: string; dir: 'asc' | 'desc' }
export type SummaryKind = 'none' | 'count' | 'count_values' | 'count_empty' | 'sum' | 'avg' | 'min' | 'max' | 'checked' | 'percent_checked'
export type ViewType = 'table' | 'board' | 'calendar'

export interface View {
  id: string
  name: string
  type: ViewType
  filters: Filter[]
  filterMode: 'and' | 'or'
  sorts: Sort[]
  groupBy?: string
  dateCol?: string
  hidden: string[]
  summaries: Record<string, SummaryKind>
}

export interface Row {
  id: string
  order: number
  created: number
  cells: Record<string, unknown>
}

export interface DbSnapshot { columns: Column[]; rows: Row[]; views: View[]; ready: boolean }

export interface DbHandles {
  doc: Y.Doc
  columns: Y.Array<Y.Map<unknown>>
  rows: Y.Map<Y.Map<unknown>>
  views: Y.Array<Y.Map<unknown>>
  notes: Y.Map<Y.Text>
  meta: Y.Map<unknown>
}

export function getDb(doc: Y.Doc): DbHandles {
  return {
    doc,
    columns: doc.getArray('dbColumns'),
    rows: doc.getMap('dbRows'),
    views: doc.getArray('dbViews'),
    notes: doc.getMap('dbNotes'),
    meta: doc.getMap('dbMeta'),
  }
}

// ---- lettura -----------------------------------------------------------------
export function snapshot(db: DbHandles): DbSnapshot {
  const columns = db.columns.toArray().map((m) => m.toJSON() as Column)
  const rows: Row[] = []
  db.rows.forEach((m, id) => {
    const o = m.toJSON() as Record<string, unknown>
    const { _o, _c, ...cells } = o
    rows.push({ id, order: typeof _o === 'number' ? _o : 0, created: typeof _c === 'number' ? _c : 0, cells })
  })
  rows.sort((a, b) => a.order - b.order || a.created - b.created)
  const views = db.views.toArray().map((m) => normalizeView(m.toJSON() as Partial<View>))
  return { columns, rows, views, ready: columns.length > 0 }
}

function normalizeView(v: Partial<View>): View {
  return {
    id: v.id ?? '',
    name: v.name ?? 'Vista',
    type: v.type ?? 'table',
    filters: v.filters ?? [],
    filterMode: v.filterMode ?? 'and',
    sorts: v.sorts ?? [],
    groupBy: v.groupBy,
    dateCol: v.dateCol,
    hidden: v.hidden ?? [],
    summaries: v.summaries ?? {},
  }
}

// ---- scrittura ---------------------------------------------------------------
const toYMap = (obj: Record<string, unknown>) => {
  const m = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) m.set(k, v)
  return m
}

export function defaultOptions(type: ColType): SelectOption[] | undefined {
  if (type === 'status') {
    return [
      { id: newOptionId(), label: 'Da fare', color: 'gray' },
      { id: newOptionId(), label: 'In corso', color: 'blue' },
      { id: newOptionId(), label: 'Fatto', color: 'green' },
    ]
  }
  if (type === 'select' || type === 'multiselect') return []
  return undefined
}

export function makeColumn(name: string, type: ColType, extra: Partial<Column> = {}): Column {
  return { id: newColId(), name, type, options: defaultOptions(type), ...extra }
}

export function makeView(name: string, type: ViewType, extra: Partial<View> = {}): View {
  return { id: newViewId(), name, type, filters: [], filterMode: 'and', sorts: [], hidden: [], summaries: {}, ...extra }
}

export function addColumn(db: DbHandles, col: Column) {
  const { options, ...rest } = col
  db.doc.transact(() => {
    const m = toYMap({ ...rest, options })
    db.columns.push([m])
  })
}

/** Crea la struttura di default di un database (Nome, Stato, Data + vista Tabella). */
export function initDatabase(db: DbHandles, spec?: { columns?: Column[]; views?: View[] }) {
  db.doc.transact(() => {
    if (db.columns.length > 0) return
    const columns = spec?.columns ?? [makeColumn('Nome', 'text'), makeColumn('Stato', 'status'), makeColumn('Data', 'date')]
    for (const c of columns) addColumn(db, c)
    const views = spec?.views?.length ? spec.views : [makeView('Tabella', 'table')]
    for (const v of views) db.views.push([toYMap({ ...v })])
    db.meta.set('initialized', true)
  })
}

export function updateColumn(db: DbHandles, colId: string, patch: Partial<Column>) {
  const idx = db.columns.toArray().findIndex((m) => m.get('id') === colId)
  if (idx < 0) return
  const m = db.columns.get(idx)
  db.doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) m.delete(k)
      else m.set(k, v)
    }
  })
}

export function deleteColumn(db: DbHandles, colId: string) {
  const idx = db.columns.toArray().findIndex((m) => m.get('id') === colId)
  if (idx <= 0) return // la prima colonna (titolo) non si elimina
  db.doc.transact(() => {
    db.columns.delete(idx, 1)
    db.rows.forEach((r) => r.delete(colId))
    db.views.forEach((v) => {
      const filters = ((v.get('filters') as Filter[]) ?? []).filter((f) => f.col !== colId)
      const sorts = ((v.get('sorts') as Sort[]) ?? []).filter((s) => s.col !== colId)
      v.set('filters', filters)
      v.set('sorts', sorts)
      if (v.get('groupBy') === colId) v.delete('groupBy')
      if (v.get('dateCol') === colId) v.delete('dateCol')
    })
  })
}

export function moveColumn(db: DbHandles, colId: string, dir: -1 | 1) {
  const arr = db.columns.toArray()
  const i = arr.findIndex((m) => m.get('id') === colId)
  const j = i + dir
  if (i < 1 || j < 1 || j >= arr.length) return // la colonna titolo resta prima
  const json = arr.map((m) => m.toJSON())
  db.doc.transact(() => {
    db.columns.delete(0, db.columns.length)
    const order = json.slice()
    ;[order[i], order[j]] = [order[j], order[i]]
    db.columns.push(order.map((o) => toYMap(o)))
  })
}

export function addRow(db: DbHandles, cells: Record<string, unknown> = {}, opts: { after?: string } = {}): string {
  const id = newRowId()
  const now = Date.now()
  let maxOrder = 0
  db.rows.forEach((r) => { const o = r.get('_o') as number; if (o > maxOrder) maxOrder = o })
  let order = maxOrder + 1
  if (opts.after) {
    const a = db.rows.get(opts.after)
    if (a) {
      const ao = (a.get('_o') as number) ?? 0
      let next = Infinity
      db.rows.forEach((r) => { const o = r.get('_o') as number; if (o > ao && o < next) next = o })
      order = next === Infinity ? ao + 1 : (ao + next) / 2
    }
  }
  db.doc.transact(() => {
    const m = new Y.Map<unknown>()
    db.rows.set(id, m)
    m.set('_o', order)
    m.set('_c', now)
    for (const [k, v] of Object.entries(cells)) if (v !== undefined && v !== null && v !== '') m.set(k, v)
  })
  return id
}

export function setCell(db: DbHandles, rowId: string, colId: string, value: unknown) {
  const r = db.rows.get(rowId)
  if (!r) return
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    if (r.has(colId)) r.delete(colId)
  } else if (JSON.stringify(r.get(colId)) !== JSON.stringify(value)) r.set(colId, value)
}

export function deleteRows(db: DbHandles, ids: string[]) {
  db.doc.transact(() => {
    for (const id of ids) { db.rows.delete(id); db.notes.delete(id) }
  })
}

export function duplicateRow(db: DbHandles, id: string): string | null {
  const r = db.rows.get(id)
  if (!r) return null
  const o = r.toJSON() as Record<string, unknown>
  const { _o, _c, ...cells } = o
  void _o; void _c
  return addRow(db, cells, { after: id })
}

export function addView(db: DbHandles, view: View) {
  db.views.push([toYMap({ ...view })])
}

export function updateView(db: DbHandles, viewId: string, patch: Partial<View>) {
  const m = db.views.toArray().find((v) => v.get('id') === viewId)
  if (!m) return
  db.doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) m.delete(k)
      else m.set(k, v)
    }
  })
}

export function deleteView(db: DbHandles, viewId: string) {
  if (db.views.length <= 1) return
  const idx = db.views.toArray().findIndex((v) => v.get('id') === viewId)
  if (idx >= 0) db.views.delete(idx, 1)
}

export function rowNotes(db: DbHandles, rowId: string): Y.Text {
  let t = db.notes.get(rowId)
  if (!t) {
    t = new Y.Text()
    db.notes.set(rowId, t)
  }
  return t
}

// ---- opzioni di selezione ------------------------------------------------------
export function addOption(db: DbHandles, colId: string, label: string): SelectOption | null {
  const idx = db.columns.toArray().findIndex((m) => m.get('id') === colId)
  if (idx < 0) return null
  const m = db.columns.get(idx)
  const options = ((m.get('options') as SelectOption[]) ?? []).slice()
  const existing = options.find((o) => o.label.toLowerCase() === label.toLowerCase())
  if (existing) return existing
  const opt = { id: newOptionId(), label, color: OPTION_COLORS[(options.length + 1) % OPTION_COLORS.length] }
  options.push(opt)
  m.set('options', options)
  return opt
}

export function updateOption(db: DbHandles, colId: string, optId: string, patch: Partial<SelectOption>) {
  const m = db.columns.toArray().find((c) => c.get('id') === colId)
  if (!m) return
  const options = ((m.get('options') as SelectOption[]) ?? []).map((o) => (o.id === optId ? { ...o, ...patch } : o))
  m.set('options', options)
}

export function removeOption(db: DbHandles, colId: string, optId: string) {
  const m = db.columns.toArray().find((c) => c.get('id') === colId)
  if (!m) return
  db.doc.transact(() => {
    m.set('options', ((m.get('options') as SelectOption[]) ?? []).filter((o) => o.id !== optId))
    db.rows.forEach((r) => {
      const v = r.get(colId)
      if (v === optId) r.delete(colId)
      else if (Array.isArray(v) && v.includes(optId)) {
        const next = v.filter((x) => x !== optId)
        if (next.length) r.set(colId, next)
        else r.delete(colId)
      }
    })
  })
}
