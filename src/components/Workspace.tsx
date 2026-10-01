import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession, usePages, useStatus, usePresence } from '../sync/hooks'
import { WorkspaceContext } from './WorkspaceContext'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { PageView } from './PageView'
import { SearchDialog } from './SearchDialog'
import { SettingsDialog } from './SettingsDialog'
import { ShareDialog } from './ShareDialog'
import { TrashDialog } from './TrashDialog'
import { ChatPanel } from '../ai/ChatPanel'
import { navigate, workspaceHash } from '../lib/route'
import { updateWorkspaceEntry, workspaces } from '../lib/workspaces'
import { useStoreValue } from '../lib/useStoreValue'
import { getServerInfo } from '../ai/assistant'
import { settings } from '../lib/settings'

export function Workspace({ wsId, pageId }: { wsId: string; pageId?: string }) {
  const session = useSession(wsId)
  const pages = usePages(session)
  const status = useStatus(session)
  const presence = usePresence(session)
  const [sidebar, setSidebar] = useState(false)
  const [dialog, setDialog] = useState<null | 'search' | 'settings' | 'share' | 'trash'>(null)
  const [chat, setChat] = useState(false)
  const entry = useStoreValue(workspaces, (s) => s.list.find((w) => w.id === wsId))
  const infoName = useInfoName(session)
  const savedPassword = settings.use().password
  const [needPassword, setNeedPassword] = useState(false)
  useEffect(() => { getServerInfo().then((i) => setNeedPassword(Boolean(i?.requiresPassword) && !savedPassword)) }, [savedPassword])

  useEffect(() => { workspaces.set({ lastOpened: wsId }) }, [wsId])
  // Il nome vero del workspace arriva dal documento condiviso (utile per chi entra da un link).
  useEffect(() => {
    if (infoName && entry && entry.name !== infoName) updateWorkspaceEntry(wsId, { name: infoName })
  }, [infoName, entry, wsId])

  const page = useMemo(() => pages.find((p) => p.id === pageId) ?? null, [pages, pageId])
  const live = useMemo(() => pages.filter((p) => !p.trashed && !p.inline), [pages])

  // Senza pagina selezionata apri la prima disponibile.
  useEffect(() => {
    if (!pageId && live.length) navigate(workspaceHash(wsId, live[0].id), true)
  }, [pageId, live, wsId])

  useEffect(() => { session.setCurrentPage(page?.id ?? null) }, [session, page?.id])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setDialog('search') }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  const openPage = useCallback((id: string) => navigate(workspaceHash(wsId, id)), [wsId])
  const ctx = useMemo(() => ({ session, pages, openPage }), [session, pages, openPage])

  const wsName = infoName || entry?.name || 'Workspace'
  const wsIcon = entry?.icon || '📘'

  return (
    <WorkspaceContext.Provider value={ctx}>
      <div className={`app-shell ${chat ? 'chat-open' : ''}`}>
        <Sidebar
          session={session} wsId={wsId} pages={pages} currentId={page?.id ?? null} status={status} presence={presence}
          open={sidebar} onClose={() => setSidebar(false)} onOpenPage={openPage}
          onSearch={() => { setDialog('search'); setSidebar(false) }} onTrash={() => { setDialog('trash'); setSidebar(false) }}
          onSettings={() => { setDialog('settings'); setSidebar(false) }} onAssistant={() => setChat(true)} onShare={() => setDialog('share')}
          wsName={wsName} wsIcon={wsIcon}
        />
        <main className="main">
          <Topbar page={page} pages={pages} presence={presence} status={status} onMenu={() => setSidebar(true)} onOpenPage={openPage} onShare={() => setDialog('share')} onAssistant={() => setChat((c) => !c)} />
          {needPassword && (
            <div className="banner warn">Il server richiede una password: senza non puoi sincronizzare con i colleghi. <button className="btn" onClick={() => setDialog('settings')}>Inseriscila</button></div>
          )}
          <div className="main-scroll">
            {page ? (
              <PageView key={page.id} page={page} />
            ) : (
              <div className="empty-workspace">
                <h2>{live.length ? 'Pagina non trovata' : 'Workspace vuoto'}</h2>
                <p>Crea una pagina, oppure descrivi il progetto all’assistente e preparerà tutto per te.</p>
                <div className="row">
                  <button className="btn primary" onClick={() => setChat(true)}>🤖 Crea con l’assistente</button>
                  <button className="btn" onClick={() => openPage(session.createPage({}))}>＋ Nuova pagina</button>
                </div>
              </div>
            )}
          </div>
        </main>
        {chat && <ChatPanel session={session} pages={pages} onOpenPage={(id) => { openPage(id); if (window.innerWidth < 900) setChat(false) }} onClose={() => setChat(false)} />}
        {dialog === 'search' && <SearchDialog pages={pages} onOpen={openPage} onClose={() => setDialog(null)} />}
        {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
        {dialog === 'share' && <ShareDialog session={session} name={wsName} onClose={() => setDialog(null)} />}
        {dialog === 'trash' && <TrashDialog session={session} pages={pages} onClose={() => setDialog(null)} />}
      </div>
    </WorkspaceContext.Provider>
  )
}

function useInfoName(session: import('../sync/session').WorkspaceSession): string {
  const [name, setName] = useState(() => session.workspaceName())
  useEffect(() => {
    const update = () => setName(session.workspaceName())
    session.info.observe(update)
    update()
    return () => session.info.unobserve(update)
  }, [session])
  return name
}
