import type { WorkspaceSession } from '../sync/session'
import { addOption, getDb, initDatabase, makeColumn, makeView, type Column, type View } from '../db/schema'
import type { SlashItem } from './SlashCommand'

export type DbPreset = 'table' | 'board' | 'calendar' | 'budget'

export function presetSpec(kind: DbPreset): { columns: Column[]; views: View[] } {
  const name = makeColumn('Nome', 'text')
  const status = makeColumn('Stato', 'status')
  const date = makeColumn('Data', 'date')
  if (kind === 'board') {
    const owner = makeColumn('Responsabile', 'select')
    return { columns: [name, status, owner, date], views: [makeView('Board', 'board', { groupBy: status.id }), makeView('Tabella', 'table')] }
  }
  if (kind === 'calendar') {
    return { columns: [name, date, status], views: [makeView('Calendario', 'calendar', { dateCol: date.id }), makeView('Tabella', 'table')] }
  }
  if (kind === 'budget') {
    const cat = makeColumn('Categoria', 'select')
    const qty = makeColumn('Quantità', 'number')
    const price = makeColumn('Prezzo unitario', 'number', { numberFormat: 'euro' })
    const total = makeColumn('Totale', 'formula', { formula: 'prop("Quantità") * prop("Prezzo unitario")', numberFormat: 'euro' })
    const paid = makeColumn('Pagato', 'checkbox')
    return {
      columns: [name, cat, qty, price, total, paid],
      views: [makeView('Tabella', 'table', { summaries: { [total.id]: 'sum', [paid.id]: 'percent_checked' } })],
    }
  }
  return { columns: [name, status, date], views: [makeView('Tabella', 'table')] }
}

/** Crea un database incorporato e restituisce l'id della pagina che lo contiene. */
export function createInlineDatabase(session: WorkspaceSession, parent: string, kind: DbPreset): string {
  const titles: Record<DbPreset, string> = { table: 'Tabella dati', board: 'Board attività', calendar: 'Calendario', budget: 'Budget' }
  const icons: Record<DbPreset, string> = { table: '🗂️', board: '📋', calendar: '📅', budget: '💶' }
  const id = session.createPage({ title: titles[kind], icon: icons[kind], parent, type: 'database', inline: true })
  void session.withDoc(id, (doc) => {
    const db = getDb(doc)
    const spec = presetSpec(kind)
    initDatabase(db, spec)
    if (kind === 'budget') for (const l of ['Location', 'Bevande', 'Musica', 'Allestimento', 'Altro']) addOption(db, spec.columns[1].id, l)
    if (kind === 'board') for (const l of ['Io', 'Collega']) addOption(db, spec.columns[2].id, l)
  })
  return id
}

export function buildSlashItems(session: WorkspaceSession, pageId: string, openPage: (id: string) => void): SlashItem[] {
  const db = (title: string, hint: string, icon: string, kind: DbPreset): SlashItem => ({
    title, hint, icon, keywords: `database tabella dati ${kind}`,
    run: ({ editor, range }) => {
      const id = createInlineDatabase(session, pageId, kind)
      editor.chain().focus().deleteRange(range).insertContent([{ type: 'databaseEmbed', attrs: { pageId: id } }, { type: 'paragraph' }]).run()
    },
  })
  return [
    { title: 'Testo', hint: 'Paragrafo semplice', icon: '¶', keywords: 'paragrafo text', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run() },
    { title: 'Titolo 1', hint: 'Titolo grande', icon: 'H1', keywords: 'h1 heading titolo', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run() },
    { title: 'Titolo 2', hint: 'Titolo medio', icon: 'H2', keywords: 'h2 heading titolo', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run() },
    { title: 'Titolo 3', hint: 'Titolo piccolo', icon: 'H3', keywords: 'h3 heading titolo', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run() },
    { title: 'Elenco puntato', hint: 'Lista con pallini', icon: '•', keywords: 'bullet lista elenco', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
    { title: 'Elenco numerato', hint: 'Lista con numeri', icon: '1.', keywords: 'numbered lista elenco ordinato', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
    { title: 'Lista attività', hint: 'Checklist con caselle', icon: '☑', keywords: 'todo task checklist attivita', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
    { title: 'Citazione', hint: 'Evidenzia una frase', icon: '❝', keywords: 'quote citazione', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
    { title: 'Callout', hint: 'Riquadro con icona', icon: '💡', keywords: 'callout nota avviso', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCallout().run() },
    { title: 'Codice', hint: 'Blocco di codice', icon: '</>', keywords: 'code codice', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
    { title: 'Divisore', hint: 'Linea orizzontale', icon: '—', keywords: 'divider linea separatore hr', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
    { title: 'Tabella', hint: 'Tabella semplice nella pagina', icon: '▦', keywords: 'table tabella griglia', run: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    db('Database – tabella', 'Tabella avanzata con filtri, ordinamenti, formule', '🗂️', 'table'),
    db('Database – board', 'Kanban per stato', '📋', 'board'),
    db('Database – calendario', 'Eventi su calendario mensile', '📅', 'calendar'),
    db('Database – budget', 'Budget con totali e formule', '💶', 'budget'),
    {
      title: 'Sotto-pagina', hint: 'Crea una pagina dentro questa', icon: '📄', keywords: 'page pagina sottopagina link',
      run: ({ editor, range }) => {
        const id = session.createPage({ title: 'Nuova pagina', parent: pageId })
        editor.chain().focus().deleteRange(range).insertContent([{ type: 'pageLink', attrs: { pageId: id } }, { type: 'paragraph' }]).run()
        setTimeout(() => openPage(id), 0)
      },
    },
  ]
}

/** Crea una pagina-database a schermo intero già configurata. */
export function createDatabasePage(session: WorkspaceSession, parent: string | null, kind: DbPreset = 'table'): string {
  const id = session.createPage({ title: 'Nuovo database', icon: '🗂️', parent, type: 'database' })
  void session.withDoc(id, (doc) => initDatabase(getDb(doc), presetSpec(kind)))
  return id
}
