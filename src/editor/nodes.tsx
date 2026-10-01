import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { DatabaseView } from '../db/DatabaseView'
import { useWorkspace } from '../components/WorkspaceContext'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: { toggleCallout: () => ReturnType }
  }
}

/** Blocco "callout": riquadro evidenziato con icona. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      icon: {
        default: '💡',
        parseHTML: (el) => el.getAttribute('data-icon') || '💡',
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon }),
      },
    }
  },
  parseHTML() { return [{ tag: 'div[data-callout]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'callout' }), 0] },
  addCommands() {
    return { toggleCallout: () => ({ commands }) => commands.toggleNode(this.name, 'paragraph') }
  },
})

function DatabaseEmbedView({ node, deleteNode, selected }: NodeViewProps) {
  const { session, pages } = useWorkspace()
  const pageId = node.attrs.pageId as string
  const page = pages.find((p) => p.id === pageId)
  return (
    <NodeViewWrapper className={`db-embed ${selected ? 'selected' : ''}`} contentEditable={false}>
      <div className="db-embed-head">
        <span className="db-embed-icon">{page?.icon || '🗂️'}</span>
        <input
          className="db-embed-title"
          value={page?.title ?? ''}
          placeholder="Database senza titolo"
          onChange={(e) => session.updatePage(pageId, { title: e.target.value })}
        />
        <button className="icon-btn danger" title="Rimuovi database dalla pagina" aria-label="Rimuovi database"
          onClick={() => { if (confirm('Rimuovere questo database dalla pagina? I dati andranno nel cestino.')) { session.trashPage(pageId); deleteNode() } }}>🗑</button>
      </div>
      {page?.trashed ? <div className="empty-state">Questo database è nel cestino.</div> : <DatabaseView session={session} pageId={pageId} title={page?.title ?? ''} />}
    </NodeViewWrapper>
  )
}

/** Database incorporato: rimanda a una pagina di tipo database (campo `pageId`). */
export const DatabaseEmbed = Node.create({
  name: 'databaseEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { pageId: { default: null, parseHTML: (el) => el.getAttribute('data-page-id'), renderHTML: (a) => ({ 'data-page-id': a.pageId }) } }
  },
  parseHTML() { return [{ tag: 'div[data-db-embed]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-db-embed': '' })] },
  addNodeView() { return ReactNodeViewRenderer(DatabaseEmbedView) },
})

function PageLinkView({ node }: NodeViewProps) {
  const { pages, openPage } = useWorkspace()
  const page = pages.find((p) => p.id === node.attrs.pageId)
  return (
    <NodeViewWrapper className="page-link" contentEditable={false}>
      <button onClick={() => page && openPage(page.id)} disabled={!page || page.trashed}>
        <span>{page?.icon || '📄'}</span>
        <span className="page-link-title">{page ? page.title || 'Senza titolo' : 'Pagina non trovata'}</span>
        {page?.trashed && <span className="page-link-note">(nel cestino)</span>}
      </button>
    </NodeViewWrapper>
  )
}

/** Collegamento a una sotto-pagina. */
export const PageLink = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { pageId: { default: null, parseHTML: (el) => el.getAttribute('data-page-id'), renderHTML: (a) => ({ 'data-page-id': a.pageId }) } }
  },
  parseHTML() { return [{ tag: 'div[data-page-link]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-page-link': '' })] },
  addNodeView() { return ReactNodeViewRenderer(PageLinkView) },
})
