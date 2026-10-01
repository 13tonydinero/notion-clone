import { getSchema, type JSONContent } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import type { WorkspaceSession } from '../sync/session'
import { schemaExtensions } from '../editor/extensions'
import {
  addColumn, addOption, addRow, addView, defaultOptions, getDb, initDatabase, makeColumn, makeView,
  type Column, type DbHandles, type View,
} from '../db/schema'
import { parseInput } from '../db/input'
import { countBlueprint, type Blueprint, type BPBlock, type BPDatabase, type BPPage } from './blueprint'

let schemaCache: ReturnType<typeof getSchema> | null = null
const schema = () => (schemaCache ??= getSchema(schemaExtensions()))

const text = (t: string): JSONContent[] => (t ? [{ type: 'text', text: t }] : [])
const para = (t: string): JSONContent => ({ type: 'paragraph', content: text(t) })

function blockToNode(b: BPBlock, makeDb: (d: BPDatabase) => string): JSONContent[] {
  switch (b.type) {
    case 'heading': return [{ type: 'heading', attrs: { level: b.level }, content: text(b.text) }]
    case 'paragraph': return [para(b.text)]
    case 'bullets': return b.items.length ? [{ type: 'bulletList', content: b.items.map((i) => ({ type: 'listItem', content: [para(i)] })) }] : []
    case 'numbered': return b.items.length ? [{ type: 'orderedList', content: b.items.map((i) => ({ type: 'listItem', content: [para(i)] })) }] : []
    case 'todo': return b.items.length ? [{ type: 'taskList', content: b.items.map((i) => ({ type: 'taskItem', attrs: { checked: Boolean(i.checked) }, content: [para(i.text)] })) }] : []
    case 'callout': return [{ type: 'callout', attrs: { icon: b.icon || '💡' }, content: text(b.text) }]
    case 'quote': return [{ type: 'blockquote', content: [para(b.text)] }]
    case 'divider': return [{ type: 'horizontalRule' }]
    case 'table': {
      const width = Math.max(...b.rows.map((r) => r.length))
      return [{
        type: 'table',
        content: b.rows.map((row, ri) => ({
          type: 'tableRow',
          content: Array.from({ length: width }, (_, ci) => ({ type: ri === 0 ? 'tableHeader' : 'tableCell', content: [para(row[ci] ?? '')] })),
        })),
      }]
    }
    case 'database': return [{ type: 'databaseEmbed', attrs: { pageId: makeDb(b.database) } }]
  }
}

function fillDatabase(db: DbHandles, spec: BPDatabase) {
  const columns: Column[] = spec.columns.map((c, i) => {
    const col = makeColumn(c.name, i === 0 ? 'text' : c.type, { numberFormat: c.format, formula: c.formula })
    if (c.options && (col.type === 'select' || col.type === 'multiselect' || col.type === 'status')) col.options = []
    else if (col.type === 'status' && !c.options) col.options = defaultOptions('status')
    return col
  })
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c]))
  const colOf = (n?: string) => (n ? byName.get(n.toLowerCase()) : undefined)

  const views: View[] = (spec.views?.length ? spec.views : [{ type: 'table' as const }]).map((v) => {
    const extra: Partial<View> = {}
    if (v.type === 'board') extra.groupBy = (colOf(v.groupBy) ?? columns.find((c) => c.type === 'status' || c.type === 'select'))?.id
    if (v.type === 'calendar') extra.dateCol = (colOf(v.dateColumn) ?? columns.find((c) => c.type === 'date'))?.id
    if (v.type === 'table') {
      const sort = colOf((v as { sortBy?: string }).sortBy)
      if (sort) extra.sorts = [{ col: sort.id, dir: (v as { sortDir?: 'asc' | 'desc' }).sortDir ?? 'asc' }]
      const sums = (v as { summaries?: Record<string, string> }).summaries
      if (sums) {
        extra.summaries = {}
        for (const [n, k] of Object.entries(sums)) { const c = colOf(n); if (c) extra.summaries[c.id] = k as never }
      }
    }
    return makeView(v.name ?? { table: 'Tabella', board: 'Board', calendar: 'Calendario' }[v.type], v.type, extra)
  })
  initDatabase(db, { columns, views })

  // Opzioni dichiarate + eventuali valori usati nelle righe.
  spec.columns.forEach((c, i) => {
    const col = columns[i]
    for (const o of c.options ?? []) addOption(db, col.id, o)
  })
  for (const row of spec.rows) {
    const cells: Record<string, unknown> = {}
    for (const [name, raw] of Object.entries(row)) {
      const col = colOf(name)
      if (!col || raw == null || col.type === 'formula') continue
      if (col.type === 'select' || col.type === 'status' || col.type === 'multiselect') {
        const labels = (Array.isArray(raw) ? raw : [String(raw)]).filter(Boolean)
        const ids = labels.map((l) => addOption(db, col.id, l)?.id).filter(Boolean) as string[]
        if (ids.length) cells[col.id] = col.type === 'multiselect' ? ids : ids[0]
      } else if (col.type === 'number') {
        const n = typeof raw === 'number' ? raw : parseInput(col, String(raw)).value
        if (typeof n === 'number') cells[col.id] = n
      } else if (col.type === 'checkbox') cells[col.id] = typeof raw === 'boolean' ? raw : parseInput(col, String(raw)).value === true
      else if (col.type === 'date') { const d = parseInput(col, String(raw)).value; if (d) cells[col.id] = d }
      else cells[col.id] = String(raw)
    }
    addRow(db, cells)
  }
}

export interface MaterializeResult { rootId: string; pages: number; databases: number; rows: number }

/**
 * Trasforma un blueprint in pagine e database reali dentro il workspace.
 * Crea una pagina radice con l'indice e sotto di essa tutte le pagine del progetto.
 */
export async function applyBlueprint(session: WorkspaceSession, bp: Blueprint, parent: string | null = null): Promise<MaterializeResult> {
  const rootId = session.createPage({ title: bp.title, icon: bp.icon || '📘', parent })
  const tasks: Promise<unknown>[] = []

  const makeInlineDb = (host: string, spec: BPDatabase): string => {
    const id = session.createPage({ title: spec.title, icon: spec.icon || '🗂️', parent: host, type: 'database', inline: true })
    tasks.push(session.withDoc(id, (doc) => doc.transact(() => fillDatabase(getDb(doc), spec))))
    return id
  }

  const createPage = (p: BPPage, parentId: string): string => {
    const id = session.createPage({ title: p.title, icon: p.icon, parent: parentId, type: p.database ? 'database' : 'page' })
    if (p.database) {
      const spec = p.database
      tasks.push(session.withDoc(id, (doc) => doc.transact(() => fillDatabase(getDb(doc), spec))))
    } else {
      const content: JSONContent[] = []
      for (const b of p.blocks ?? []) content.push(...blockToNode(b, (d) => makeInlineDb(id, d)))
      if (!content.length) content.push(para(''))
      // Le sotto-pagine vengono create prima, così possiamo linkarle in fondo.
      const kids = (p.children ?? []).map((c) => createPage(c, id))
      for (const kid of kids) content.push({ type: 'pageLink', attrs: { pageId: kid } })
      tasks.push(writeContent(session, id, content))
      return id
    }
    for (const c of p.children ?? []) createPage(c, id)
    return id
  }

  const childIds = bp.pages.map((p) => createPage(p, rootId))
  const rootContent: JSONContent[] = []
  if (bp.summary) rootContent.push({ type: 'callout', attrs: { icon: bp.icon || '📘' }, content: text(bp.summary) })
  rootContent.push({ type: 'heading', attrs: { level: 2 }, content: text('Indice') })
  for (const id of childIds) rootContent.push({ type: 'pageLink', attrs: { pageId: id } })
  rootContent.push(para(''))
  tasks.push(writeContent(session, rootId, rootContent))

  await Promise.all(tasks)
  return { rootId, ...countBlueprint(bp) }
}

function writeContent(session: WorkspaceSession, pageId: string, content: JSONContent[]) {
  return session.withDoc(pageId, (doc) => {
    const fragment = doc.getXmlFragment('content')
    doc.transact(() => {
      if (fragment.length === 0) prosemirrorJSONToYXmlFragment(schema(), { type: 'doc', content }, fragment)
    })
  })
}

export { addColumn, addView }
