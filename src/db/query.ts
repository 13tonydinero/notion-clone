import type { Column, DbSnapshot, Filter, FilterOp, Row, SummaryKind, View } from './schema'
import { runFormula, type FValue } from './formula'

export type CellValue = string | number | boolean | string[] | null | { error: string }

export interface EvalContext {
  columns: Column[]
  byName: Map<string, Column>
  cache: Map<string, CellValue>
}

export function makeContext(columns: Column[]): EvalContext {
  const byName = new Map<string, Column>()
  for (const c of columns) byName.set(c.name.toLowerCase(), c)
  return { columns, byName, cache: new Map() }
}

const isError = (v: unknown): v is { error: string } => typeof v === 'object' && v !== null && !Array.isArray(v) && 'error' in v

/** Valore "logico" di una cella (applica formule e colonne calcolate). */
export function cellValue(row: Row, col: Column, ctx: EvalContext, depth = 0): CellValue {
  if (col.type === 'created') return row.created ? new Date(row.created).toISOString().slice(0, 10) : null
  if (col.type === 'formula') {
    const key = `${row.id}:${col.id}`
    const hit = ctx.cache.get(key)
    if (hit !== undefined) return hit
    if (depth > 8) return { error: 'Riferimento circolare' }
    const res = runFormula(col.formula ?? '', {
      prop: (name) => {
        const c = ctx.byName.get(name.toLowerCase())
        if (!c) throw new Error(`Colonna "${name}" non trovata`)
        const v = cellValue(row, c, ctx, depth + 1)
        if (isError(v)) throw new Error(v.error)
        return plainValue(v, c)
      },
    })
    const out: CellValue = 'error' in res ? { error: res.error } : res.value
    ctx.cache.set(key, out)
    return out
  }
  const raw = row.cells[col.id]
  return (raw === undefined ? null : raw) as CellValue
}

/** Converte un valore di cella in un valore scalare utilizzabile dalle formule. */
function plainValue(v: CellValue, col: Column): FValue {
  if (v == null) return null
  if (Array.isArray(v)) return v.map((id) => optionLabel(col, id)).join(', ')
  if (isError(v)) return null
  if (col.type === 'select' || col.type === 'status') return optionLabel(col, v as string)
  return v as FValue
}

export const optionLabel = (col: Column, id: string) => col.options?.find((o) => o.id === id)?.label ?? ''

/** Testo mostrato per un valore (usato anche da filtri di testo, CSV e ricerca). */
export function displayValue(v: CellValue, col: Column): string {
  if (v == null) return ''
  if (isError(v)) return '#ERR'
  if (Array.isArray(v)) return v.map((id) => optionLabel(col, id)).filter(Boolean).join(', ')
  if (col.type === 'select' || col.type === 'status') return optionLabel(col, v as string)
  if (typeof v === 'boolean') return v ? 'Sì' : 'No'
  if (typeof v === 'number') return formatNumber(v, col.numberFormat)
  if (col.type === 'date' || col.type === 'created') return formatDate(String(v))
  return String(v)
}

export function formatNumber(n: number, fmt: Column['numberFormat'] = 'number'): string {
  if (!Number.isFinite(n)) return String(n)
  switch (fmt) {
    case 'euro': return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
    case 'percent': return new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 }).format(n / 100)
    case 'decimal2': return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    default: return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 }).format(n)
  }
}

export function formatDate(s: string): string {
  if (!s) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return s
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isEmpty = (v: CellValue) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

export const OPS_BY_TYPE: Record<string, { op: FilterOp; label: string }[]> = {
  text: [
    { op: 'contains', label: 'contiene' }, { op: 'not_contains', label: 'non contiene' },
    { op: 'is', label: 'è' }, { op: 'is_not', label: 'non è' }, { op: 'starts', label: 'inizia con' },
    { op: 'empty', label: 'è vuoto' }, { op: 'not_empty', label: 'non è vuoto' },
  ],
  number: [
    { op: 'eq', label: '=' }, { op: 'neq', label: '≠' }, { op: 'gt', label: '>' }, { op: 'gte', label: '≥' },
    { op: 'lt', label: '<' }, { op: 'lte', label: '≤' }, { op: 'empty', label: 'è vuoto' }, { op: 'not_empty', label: 'non è vuoto' },
  ],
  select: [
    { op: 'is', label: 'è' }, { op: 'is_not', label: 'non è' }, { op: 'empty', label: 'è vuoto' }, { op: 'not_empty', label: 'non è vuoto' },
  ],
  multiselect: [
    { op: 'contains', label: 'contiene' }, { op: 'not_contains', label: 'non contiene' },
    { op: 'empty', label: 'è vuoto' }, { op: 'not_empty', label: 'non è vuoto' },
  ],
  date: [
    { op: 'is', label: 'è' }, { op: 'before', label: 'prima del' }, { op: 'after', label: 'dopo il' },
    { op: 'on_or_before', label: 'entro il' }, { op: 'on_or_after', label: 'dal' },
    { op: 'empty', label: 'è vuoto' }, { op: 'not_empty', label: 'non è vuoto' },
  ],
  checkbox: [{ op: 'checked', label: 'è spuntato' }, { op: 'unchecked', label: 'non è spuntato' }],
}

export function filterKind(col: Column): keyof typeof OPS_BY_TYPE {
  switch (col.type) {
    case 'number': return 'number'
    case 'select': case 'status': return 'select'
    case 'multiselect': return 'multiselect'
    case 'date': case 'created': return 'date'
    case 'checkbox': return 'checkbox'
    default: return 'text'
  }
}

export const opNeedsValue = (op: FilterOp) => !['empty', 'not_empty', 'checked', 'unchecked'].includes(op)

export function matchesFilter(row: Row, f: Filter, ctx: EvalContext): boolean {
  const col = ctx.columns.find((c) => c.id === f.col)
  if (!col) return true
  const v = cellValue(row, col, ctx)
  if (isError(v)) return false
  const kind = col.type === 'formula' ? (typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'checkbox' : 'text') : filterKind(col)
  const val = f.value ?? ''
  switch (f.op) {
    case 'empty': return isEmpty(v)
    case 'not_empty': return !isEmpty(v)
    case 'checked': return v === true
    case 'unchecked': return v !== true
  }
  if (kind === 'number') {
    if (val === '') return true
    const a = typeof v === 'number' ? v : v == null ? null : Number(v)
    const b = Number(val.replace(',', '.'))
    if (a == null || Number.isNaN(a)) return f.op === 'neq'
    switch (f.op) {
      case 'eq': return a === b
      case 'neq': return a !== b
      case 'gt': return a > b
      case 'gte': return a >= b
      case 'lt': return a < b
      case 'lte': return a <= b
    }
    return true
  }
  if (kind === 'select') {
    if (!val) return true
    return f.op === 'is' ? v === val : v !== val
  }
  if (kind === 'multiselect') {
    if (!val) return true
    const has = Array.isArray(v) && v.includes(val)
    return f.op === 'contains' ? has : !has
  }
  if (kind === 'date') {
    const target = val === 'today' || val === '' ? todayISO() : val
    const d = v == null ? null : String(v).slice(0, 10)
    if (!d) return false
    switch (f.op) {
      case 'is': return d === target
      case 'before': return d < target
      case 'after': return d > target
      case 'on_or_before': return d <= target
      case 'on_or_after': return d >= target
    }
    return true
  }
  const text = displayValue(v, col).toLowerCase()
  const needle = val.toLowerCase()
  switch (f.op) {
    case 'contains': return text.includes(needle)
    case 'not_contains': return !text.includes(needle)
    case 'is': return text === needle
    case 'is_not': return text !== needle
    case 'starts': return text.startsWith(needle)
  }
  return true
}

function compareValues(a: CellValue, b: CellValue, col: Column): number {
  const ea = isEmpty(a) || isError(a)
  const eb = isEmpty(b) || isError(b)
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1 // i vuoti vanno sempre in fondo
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (col.type === 'select' || col.type === 'status') {
    const idx = (id: string) => col.options?.findIndex((o) => o.id === id) ?? 0
    return idx(a as string) - idx(b as string)
  }
  return displayValue(a, col).localeCompare(displayValue(b, col), 'it', { numeric: true, sensitivity: 'base' })
}

export interface ViewResult {
  rows: Row[]
  groups: Group[] | null
  ctx: EvalContext
}

export function queryView(db: DbSnapshot, view: View, search: string): ViewResult {
  const ctx = makeContext(db.columns)
  let rows = db.rows
  const active = view.filters.filter((f) => db.columns.some((c) => c.id === f.col))
  if (active.length) {
    rows = rows.filter((r) =>
      view.filterMode === 'or' ? active.some((f) => matchesFilter(r, f, ctx)) : active.every((f) => matchesFilter(r, f, ctx)),
    )
  }
  const q = search.trim().toLowerCase()
  if (q) {
    rows = rows.filter((r) =>
      db.columns.some((c) => displayValue(cellValue(r, c, ctx), c).toLowerCase().includes(q)),
    )
  }
  if (view.sorts.length) {
    const sorts = view.sorts.map((s) => ({ ...s, col: db.columns.find((c) => c.id === s.col) })).filter((s) => s.col)
    rows = [...rows].sort((a, b) => {
      for (const s of sorts) {
        const c = compareValues(cellValue(a, s.col!, ctx), cellValue(b, s.col!, ctx), s.col!)
        if (c !== 0) return s.dir === 'asc' ? c : -c
      }
      return 0
    })
  }
  let groups: ViewResult['groups'] = null
  const gcol = view.groupBy ? db.columns.find((c) => c.id === view.groupBy) : undefined
  if (gcol) groups = groupRows(rows, gcol, ctx)
  return { rows, groups, ctx }
}

export interface Group { key: string; label: string; color?: string; rows: Row[] }

export function groupRows(rows: Row[], col: Column, ctx: EvalContext): Group[] {
  const map = new Map<string, Row[]>()
  const order: string[] = []
  const push = (k: string, r: Row) => {
    if (!map.has(k)) { map.set(k, []); order.push(k) }
    map.get(k)!.push(r)
  }
  if (col.type === 'select' || col.type === 'status' || col.type === 'multiselect') {
    for (const o of col.options ?? []) { map.set(o.id, []); order.push(o.id) }
    map.set('', []); order.push('')
    for (const r of rows) {
      const v = cellValue(r, col, ctx)
      if (Array.isArray(v) && v.length) v.forEach((id) => push(map.has(id) ? id : '', r))
      else if (typeof v === 'string' && map.has(v)) push(v, r)
      else push('', r)
    }
    return order.map((k) => {
      const o = col.options?.find((x) => x.id === k)
      return { key: k, label: o?.label ?? 'Senza valore', color: o?.color, rows: map.get(k)! }
    })
  }
  for (const r of rows) {
    const v = cellValue(r, col, ctx)
    push(isEmpty(v) ? '' : displayValue(v, col), r)
  }
  return order
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'it', { numeric: true })))
    .map((k) => ({ key: k, label: k || 'Senza valore', rows: map.get(k)! }))
}

export const SUMMARY_LABELS: Record<SummaryKind, string> = {
  none: 'Nessuno', count: 'Conteggio righe', count_values: 'Valori compilati', count_empty: 'Vuoti',
  sum: 'Somma', avg: 'Media', min: 'Minimo', max: 'Massimo', checked: 'Spuntati', percent_checked: '% spuntati',
}

export function summaryOptions(col: Column): SummaryKind[] {
  const base: SummaryKind[] = ['none', 'count', 'count_values', 'count_empty']
  if (col.type === 'number' || col.type === 'formula') return [...base, 'sum', 'avg', 'min', 'max']
  if (col.type === 'checkbox') return [...base, 'checked', 'percent_checked']
  return base
}

export function computeSummary(kind: SummaryKind, col: Column, rows: Row[], ctx: EvalContext): string {
  if (kind === 'none') return ''
  const vals = rows.map((r) => cellValue(r, col, ctx))
  const nums = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const fmt = (n: number) => formatNumber(n, col.numberFormat)
  switch (kind) {
    case 'count': return String(rows.length)
    case 'count_values': return String(vals.filter((v) => !isEmpty(v)).length)
    case 'count_empty': return String(vals.filter(isEmpty).length)
    case 'sum': return fmt(nums.reduce((a, b) => a + b, 0))
    case 'avg': return nums.length ? fmt(nums.reduce((a, b) => a + b, 0) / nums.length) : ''
    case 'min': return nums.length ? fmt(Math.min(...nums)) : ''
    case 'max': return nums.length ? fmt(Math.max(...nums)) : ''
    case 'checked': return String(vals.filter((v) => v === true).length)
    case 'percent_checked': return rows.length ? `${Math.round((vals.filter((v) => v === true).length / rows.length) * 100)}%` : ''
  }
}
