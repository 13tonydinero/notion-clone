import { Dialog } from './Dialog'
import type { PageMeta } from '../types'
import type { WorkspaceSession } from '../sync/session'

export function TrashDialog({ session, pages, onClose }: { session: WorkspaceSession; pages: PageMeta[]; onClose: () => void }) {
  const trashed = pages.filter((p) => p.trashed && !p.inline && !(p.parent && pages.find((x) => x.id === p.parent)?.trashed))
  return (
    <Dialog title="Cestino" onClose={onClose}>
      {trashed.length === 0 && <p className="muted">Il cestino è vuoto.</p>}
      <div className="menu-list">
        {trashed.map((p) => (
          <div key={p.id} className="trash-row">
            <span>{p.icon || '📄'} {p.title || 'Senza titolo'}</span>
            <span className="spacer" />
            <button className="btn" onClick={() => session.restorePage(p.id)}>Ripristina</button>
            <button className="btn danger" onClick={() => { if (confirm('Eliminare definitivamente? L’operazione non si può annullare.')) session.deletePageForever(p.id) }}>Elimina</button>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
