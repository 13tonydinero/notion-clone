import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Callout, DatabaseEmbed, PageLink } from './nodes'

/** Estensioni che definiscono lo schema del documento (usate sia dall'editor sia per generare contenuto da codice). */
export function schemaExtensions(): Extensions {
  return [
    StarterKit.configure({
      undoRedo: false, // l'undo è gestito da Yjs (Collaboration)
      trailingNode: false, // evita paragrafi vuoti duplicati quando più persone aprono lo stesso documento
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    Callout,
    DatabaseEmbed,
    PageLink,
  ]
}

export const placeholderExtension = Placeholder.configure({
  placeholder: ({ node }) => (node.type.name === 'heading' ? 'Titolo' : "Scrivi, oppure premi “/” per i comandi…"),
})
