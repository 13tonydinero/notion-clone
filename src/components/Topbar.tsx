import type { PageMeta, PresenceUser, ConnectionStatus } from '../types'

export function Topbar({ page, pages, presence, status, onMenu, onOpenPage, onShare, onAssistant }: {
  page: PageMeta | null
  pages: PageMeta[]
  presence: PresenceUser[]
  status: ConnectionStatus
  onMenu: () => void
  onOpenPage: (id: string) => void
  onShare: () => void
  onAssistant: () => void
}) {
  const crumbs: PageMeta[] = []
  let cur = page
  while (cur) { crumbs.unshift(cur); cur = cur.parent ? pages.find((p) => p.id === cur!.parent) ?? null : null }

  // Un avatar per persona (stesso nome+colore su più schede/dispositivi conta una volta sola).
  const seen = new Set<string>()
  const people = presence.filter((u) => { const k = `${u.name}|${u.color}`; if (seen.has(k)) return false; seen.add(k); return true })
  const onThisPage = (u: PresenceUser) => page && u.pageId === page.id

  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Apri menu">☰</button>
      <nav className="crumbs" aria-label="Percorso">
        {crumbs.map((c, i) => (
          <span key={c.id} className="crumb">
            {i > 0 && <span className="crumb-sep">/</span>}
            <button onClick={() => onOpenPage(c.id)}>{c.icon} {c.title || 'Senza titolo'}</button>
          </span>
        ))}
      </nav>
      <span className="spacer" />
      <div className="avatars" aria-label="Persone online">
        {people.map((u) => (
          <span key={u.clientId} className={`avatar ${onThisPage(u) ? 'here' : ''}`} style={{ background: u.color }} title={`${u.name}${u.self ? ' (tu)' : onThisPage(u) ? ' · su questa pagina' : ''}`}>
            {(u.name || '?').slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span className={`dot ${status}`} title={status} />
      <button className="btn" title="Assistente" aria-label="Assistente" onClick={onAssistant}>🤖 <span className="lbl">Assistente</span></button>
      <button className="btn primary" title="Condividi" aria-label="Condividi" onClick={onShare}>👥 <span className="lbl">Condividi</span></button>
    </header>
  )
}
