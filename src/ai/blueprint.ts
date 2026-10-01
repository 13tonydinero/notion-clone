// Descrizione dichiarativa di un ambiente di lavoro: prodotta dal motore locale o da Claude
// e trasformata in pagine/database reali da `materialize.ts`.

export type BPColType = 'text' | 'number' | 'select' | 'multiselect' | 'status' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'formula'

export interface BPColumn {
  name: string
  type: BPColType
  options?: string[]
  formula?: string
  format?: 'number' | 'euro' | 'percent' | 'decimal2'
}

export interface BPView {
  type: 'table' | 'board' | 'calendar'
  name?: string
  groupBy?: string
  dateColumn?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  summaries?: Record<string, 'sum' | 'avg' | 'count' | 'percent_checked' | 'checked' | 'min' | 'max'>
}

export interface BPDatabase {
  title: string
  icon?: string
  columns: BPColumn[]
  rows: Record<string, string | number | boolean | string[] | null>[]
  views?: BPView[]
}

export type BPBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'todo'; items: { text: string; checked?: boolean }[] }
  | { type: 'callout'; icon?: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'divider' }
  | { type: 'table'; rows: string[][] }
  | { type: 'database'; database: BPDatabase }

export interface BPPage {
  title: string
  icon?: string
  blocks?: BPBlock[]
  database?: BPDatabase
  children?: BPPage[]
}

export interface Blueprint {
  title: string
  icon?: string
  summary?: string
  pages: BPPage[]
}

const COL_TYPES = new Set(['text', 'number', 'select', 'multiselect', 'status', 'date', 'checkbox', 'url', 'email', 'phone', 'formula'])
const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const arr = <T,>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v.slice(0, max) as T[]) : [])

function sanitizeDatabase(raw: unknown): BPDatabase | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const columns: BPColumn[] = arr<Record<string, unknown>>(o.columns, 20)
    .filter((c) => c && typeof c === 'object' && str(c.name).trim())
    .map((c) => ({
      name: str(c.name, 60).trim(),
      type: (COL_TYPES.has(str(c.type)) ? str(c.type) : 'text') as BPColType,
      options: Array.isArray(c.options) ? arr<unknown>(c.options, 30).map((x) => str(x, 40)).filter(Boolean) : undefined,
      formula: typeof c.formula === 'string' ? c.formula.slice(0, 500) : undefined,
      format: (['number', 'euro', 'percent', 'decimal2'].includes(str(c.format)) ? str(c.format) : undefined) as BPColumn['format'],
    }))
  if (!columns.length) return null
  const rows = arr<Record<string, unknown>>(o.rows, 200)
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const out: BPDatabase['rows'][number] = {}
      for (const [k, v] of Object.entries(r).slice(0, 30)) {
        if (Array.isArray(v)) out[k] = v.slice(0, 10).map((x) => str(x, 60))
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
        else if (v == null) out[k] = null
        else out[k] = str(v, 500)
      }
      return out
    })
  const views = arr<Record<string, unknown>>(o.views, 6)
    .filter((v) => v && ['table', 'board', 'calendar'].includes(str(v.type)))
    .map((v) => ({
      type: str(v.type) as BPView['type'],
      name: v.name ? str(v.name, 40) : undefined,
      groupBy: v.groupBy ? str(v.groupBy, 60) : undefined,
      dateColumn: v.dateColumn ? str(v.dateColumn, 60) : v.dateCol ? str(v.dateCol, 60) : undefined,
    }))
  return { title: str(o.title, 80) || 'Database', icon: str(o.icon, 8) || undefined, columns, rows, views: views.length ? views : undefined }
}

function sanitizeBlock(raw: unknown): BPBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  switch (b.type) {
    case 'heading': return { type: 'heading', level: ([1, 2, 3].includes(Number(b.level)) ? Number(b.level) : 2) as 1 | 2 | 3, text: str(b.text, 200) }
    case 'paragraph': return { type: 'paragraph', text: str(b.text, 2000) }
    case 'bullets': case 'numbered': return { type: b.type, items: arr<unknown>(b.items, 40).map((x) => str(x, 300)).filter(Boolean) }
    case 'todo': return { type: 'todo', items: arr<Record<string, unknown> | string>(b.items, 40).map((x) => (typeof x === 'string' ? { text: str(x, 300) } : { text: str(x?.text, 300), checked: Boolean(x?.checked) })).filter((x) => x.text) }
    case 'callout': return { type: 'callout', icon: str(b.icon, 8) || undefined, text: str(b.text, 1000) }
    case 'quote': return { type: 'quote', text: str(b.text, 1000) }
    case 'divider': return { type: 'divider' }
    case 'table': {
      const rows = arr<unknown[]>(b.rows, 40).map((r) => arr<unknown>(r, 12).map((c) => str(c, 200)))
      return rows.length && rows[0].length ? { type: 'table', rows } : null
    }
    case 'database': { const d = sanitizeDatabase(b.database); return d ? { type: 'database', database: d } : null }
  }
  return null
}

function sanitizePage(raw: unknown, depth: number): BPPage | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const title = str(p.title, 100).trim()
  if (!title) return null
  const page: BPPage = { title, icon: str(p.icon, 8) || undefined }
  if (p.database) { const d = sanitizeDatabase(p.database); if (d) page.database = d }
  if (!page.database) page.blocks = arr<unknown>(p.blocks, 60).map(sanitizeBlock).filter(Boolean) as BPBlock[]
  if (depth < 2 && p.children) page.children = arr<unknown>(p.children, 12).map((c) => sanitizePage(c, depth + 1)).filter(Boolean) as BPPage[]
  return page
}

/** Valida (e limita) un blueprint proveniente da una fonte non fidata, ad esempio la risposta di un LLM. */
export function sanitizeBlueprint(raw: unknown): Blueprint | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const pages = arr<unknown>(o.pages, 15).map((p) => sanitizePage(p, 0)).filter(Boolean) as BPPage[]
  const title = str(o.title, 100).trim()
  if (!title || !pages.length) return null
  return { title, icon: str(o.icon, 8) || undefined, summary: str(o.summary, 400) || undefined, pages }
}

export function countBlueprint(bp: Blueprint): { pages: number; databases: number; rows: number } {
  let pages = 0, databases = 0, rows = 0
  const db = (d: BPDatabase) => { databases++; rows += d.rows.length }
  const walk = (p: BPPage) => {
    pages++
    if (p.database) { pages--; db(p.database) }
    for (const b of p.blocks ?? []) if (b.type === 'database') db(b.database)
    p.children?.forEach(walk)
  }
  bp.pages.forEach(walk)
  return { pages, databases, rows }
}
