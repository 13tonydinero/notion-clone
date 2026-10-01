import { useMemo, useRef, useState } from 'react'
import { Popover } from './Popover'
import type { PageMeta, PresenceUser, ConnectionStatus } from '../types'
import type { WorkspaceSession } from '../sync/session'
import { workspaces } from '../lib/workspaces'
import { navigate } from '../lib/route'
import { createDatabasePage } from '../editor/slashItems'

const STATUS_TEXT: Record<ConnectionStatus, { label: string; cls: string }> = {
  connected: { label: 'Sincronizzato', cls: 'ok' },
  connecting: { label: 'Connessione…', cls: 'wait' },
  offline: { label: 'Offline · le modifiche restano su questo dispositivo', cls: 'off' },
  local: { label: 'Solo locale', cls: 'local' },
}

function PageRow({ page, depth, ctx }: { page: PageMeta; depth: number; ctx: TreeCtx }) {
  const kids = ctx.children(page.id)
  const [menu, setMenu] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const open = ctx.expanded.has(page.id)
  const here = ctx.presence.filter((u) => !u.self && u.pageId === page.id)
  return (
    <>
      <div className={`tree-row ${ctx.currentId === page.id ? 'active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <button className={`tree-chev ${kids.length ? '' : 'hidden'}`} onClick={() => ctx.toggle(page.id)} aria-label={open ? 'Comprimi' : 'Espandi'}>
          <span className={open ? 'open' : ''}>▸</span>
        </button>
        <button className="tree-link" onClick={() => ctx.open(page.id)}>
          <span className="tree-icon">{page.icon || (page.type === 'database' ? '🗂️' : '📄')}</span>
          <span className="tree-title">{page.title || 'Senza titolo'}</span>
          {here.length > 0 && <span className="tree-presence">{here.slice(0, 3).map((u) => <i key={u.clientId} style={{ background: u.color }} title={`${u.name} è qui`} />)}</span>}
        </button>
        <button ref={btn} className="tree-more" onClick={() => setMenu(true)} aria-label="Azioni pagina">⋯</button>
      </div>
      {menu && (
        <Popover anchor={btn} onClose={() => setMenu(false)} width={210}>
          <div className="menu-list">
            <button className="menu-item" onClick={() => { setMenu(false); ctx.addChild(page.id) }}>＋ Nuova sotto-pagina</button>
            <button className="menu-item" onClick={() => { setMenu(false); ctx.move(page, -1) }}>↑ Sposta su</button>
            <button className="menu-item" onClick={() => { setMenu(false); ctx.move(page, 1) }}>↓ Sposta giù</button>
            <button className="menu-item danger" onClick={() => { setMenu(false); ctx.trash(page) }}>🗑 Sposta nel cestino</button>
          </div>
        </Popover>
      )}
      {open && kids.map((k) => <PageRow key={k.id} page={k} depth={depth + 1} ctx={ctx} />)}
    </>
  )
}

interface TreeCtx {
  children: (id: string | null) => PageMeta[]
  expanded: Set<string>
  toggle: (id: string) => void
  open: (id: string) => void
  addChild: (id: string) => void
  move: (p: PageMeta, dir: -1 | 1) => void
  trash: (p: PageMeta) => void
  currentId: string | null
  presence: PresenceUser[]
}

export function Sidebar({ session, wsId, pages, currentId, status, presence, open, onClose, onOpenPage, onSearch, onTrash, onSettings, onAssistant, onShare, wsName, wsIcon }: {
  session: WorkspaceSession
  wsId: string
  pages: PageMeta[]
  currentId: string | null
  status: ConnectionStatus
  presence: PresenceUser[]
  open: boolean
  onClose: () => void
  onOpenPage: (id: string) => void
  onSearch: () => void
  onTrash: () => void
  onSettings: () => void
  onAssistant: () => void
  onShare: () => void
  wsName: string
  wsIcon: string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [wsMenu, setWsMenu] = useState(false)
  const wsBtn = useRef<HTMLButtonElement>(null)
  const list = workspaces.use().list

  const live = useMemo(() => pages.filter((p) => !p.trashed && !p.inline), [pages])
  const children = (id: string | null) => live.filter((p) => p.parent === id)
  const trashCount = pages.filter((p) => p.trashed && !p.inline).length

  const ctx: TreeCtx = {
    children, expanded, currentId, presence,
    toggle: (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }),
    open: (id) => { onOpenPage(id); onClose() },
    addChild: (id) => { const nid = session.createPage({ parent: id }); setExpanded((s) => new Set(s).add(id)); onOpenPage(nid); onClose() },
    move: (p, dir) => {
      const sibs = children(p.parent)
      const i = sibs.findIndex((x) => x.id === p.id)
      const j = i + dir
      if (j < 0 || j >= sibs.length) return
      // Riassegna l'ordine in modo esplicito per evitare valori uguali.
      const order = sibs.map((s) => s.id)
      ;[order[i], order[j]] = [order[j], order[i]]
      session.meta.doc.transact(() => order.forEach((id, idx) => session.updatePage(id, { order: idx + 1 })))
    },
    trash: (p) => {
      session.trashPage(p.id)
      if (currentId === p.id || session.descendants(p.id).includes(currentId ?? '')) navigate(`#/w/${wsId}`)
    },
  }
  // Espandi automaticamente gli antenati della pagina corrente.
  const ancestors = useMemo(() => {
    const out = new Set<string>()
    let cur = pages.find((p) => p.id === currentId)
    while (cur?.parent) { out.add(cur.parent); cur = pages.find((p) => p.id === cur!.parent) }
    return out
  }, [pages, currentId])
  const effectiveExpanded = useMemo(() => new Set([...expanded, ...ancestors]), [expanded, ancestors])
  ctx.expanded = effectiveExpanded

  const st = STATUS_TEXT[status]

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigazione">
        <button ref={wsBtn} className="ws-switch" onClick={() => setWsMenu(true)}>
          <span className="ws-icon">{wsIcon}</span>
          <span className="ws-name">{wsName || 'Workspace'}</span>
          <span className="ws-caret">⌄</span>
        </button>
        {wsMenu && (
          <Popover anchor={wsBtn} onClose={() => setWsMenu(false)} width={250}>
            <div className="menu-list">
              {list.map((w) => (
                <button key={w.id} className="menu-item" onClick={() => { setWsMenu(false); navigate(`#/w/${w.id}`) }}>
                  <span>{w.icon}</span> <span>{w.name}</span> {w.id === wsId && <span className="menu-check">✓</span>}
                </button>
              ))}
              <button className="menu-item" onClick={() => { setWsMenu(false); navigate('#/') }}>＋ Nuovo / altri workspace</button>
            </div>
          </Popover>
        )}
        <nav className="side-actions">
          <button onClick={onSearch}>🔍 <span>Cerca</span><kbd>Ctrl K</kbd></button>
          <button onClick={() => { onAssistant(); onClose() }}>🤖 <span>Assistente</span></button>
          <button onClick={() => { onShare(); onClose() }}>👥 <span>Condividi</span></button>
        </nav>
        <div className="tree-head">
          <span>Pagine</span>
          <button className="icon-btn" onClick={() => { const id = session.createPage({}); onOpenPage(id); onClose() }} title="Nuova pagina" aria-label="Nuova pagina">＋</button>
          <button className="icon-btn" onClick={() => { const id = createDatabasePage(session, null); onOpenPage(id); onClose() }} title="Nuovo database" aria-label="Nuovo database">🗂️</button>
        </div>
        <div className="tree">
          {children(null).map((p) => <PageRow key={p.id} page={p} depth={0} ctx={ctx} />)}
          {live.length === 0 && <div className="tree-empty">Nessuna pagina. Creane una con ＋ oppure chiedi all’assistente.</div>}
        </div>
        <div className="side-foot">
          <button onClick={onTrash}>🗑 <span>Cestino{trashCount ? ` (${trashCount})` : ''}</span></button>
          <button onClick={onSettings}>⚙️ <span>Impostazioni</span></button>
          <div className={`conn ${st.cls}`}><i /> {st.label}</div>
        </div>
      </aside>
    </>
  )
}
