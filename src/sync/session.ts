import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import { settings, displayName, wsBase } from '../lib/settings'
import { newPageId } from '../lib/ids'
import type { ConnectionStatus, PageMeta, PageType, PresenceUser } from '../types'

const GRACE_MS = 15_000

/** Un documento Yjs aperto: persistenza locale (IndexedDB) + sincronizzazione col server. */
export class DocHandle {
  readonly doc = new Y.Doc()
  provider: WebsocketProvider | null = null
  readonly idb: IndexeddbPersistence
  refs = 0
  dirty = false
  releaseTimer: ReturnType<typeof setTimeout> | null = null

  constructor(readonly session: WorkspaceSession, readonly docId: string) {
    const room = `${session.id}__${docId}`
    this.idb = new IndexeddbPersistence(`nc-${room}`, this.doc)
    const s = settings.get()
    if (s.syncEnabled) {
      this.provider = new WebsocketProvider(wsBase(s), room, this.doc, {
        params: s.password ? { password: s.password } : {},
        maxBackoffTime: 10_000,
      })
      this.provider.awareness.setLocalStateField('user', { name: displayName(s), color: s.userColor })
      this.provider.on('sync', (isSynced: boolean) => {
        if (isSynced) session.clearDirty(this)
      })
    }
    // Modifiche fatte mentre il server non è raggiungibile: vanno rimandate appena possibile.
    this.doc.on('update', (_u: Uint8Array, origin: unknown) => {
      if (origin === this.provider || origin === this.idb) return
      if (this.provider && !this.provider.wsconnected) session.markDirty(this)
    })
  }

  get synced() { return this.provider?.synced ?? false }
  whenReady(): Promise<void> { return this.idb.whenSynced.then(() => undefined) }
  destroy() {
    this.provider?.destroy()
    this.idb.destroy()
    this.doc.destroy()
  }
}

type Listener = () => void

export class WorkspaceSession {
  readonly meta: DocHandle
  readonly pages: Y.Map<Y.Map<unknown>>
  readonly info: Y.Map<unknown>
  private handles = new Map<string, DocHandle>()
  private listeners = new Set<Listener>()
  private status: ConnectionStatus = 'connecting'
  private pageSnapshot: PageMeta[] = []
  private presenceSnapshot: PresenceUser[] = []
  private dirtyKey: string

  constructor(readonly id: string) {
    this.dirtyKey = `nc:dirty:${id}`
    this.meta = new DocHandle(this, 'meta')
    this.meta.refs = 1
    this.pages = this.meta.doc.getMap('pages') as Y.Map<Y.Map<unknown>>
    this.info = this.meta.doc.getMap('info')

    this.pages.observeDeep(() => this.refreshPages())
    this.info.observe(() => this.emit())
    this.meta.idb.whenSynced.then(() => this.refreshPages())
    this.refreshPages()

    const p = this.meta.provider
    if (!settings.get().syncEnabled || !p) {
      this.status = 'local'
    } else {
      p.on('status', ({ status }: { status: string }) => {
        this.status = status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'offline'
        this.emit()
      })
      p.awareness.on('change', () => { this.refreshPresence(); this.emit() })
      // Il browser dichiara di essere offline: non serve aspettare il timeout del socket.
      window.addEventListener('offline', () => { this.status = 'offline'; this.emit() })
      window.addEventListener('online', () => p.connect())
    }
    this.flushDirtyFromPreviousRun()
  }

  // ---- sottoscrizioni -------------------------------------------------------
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  private emit() { this.listeners.forEach((l) => l()) }
  getStatus = () => this.status
  getPages = () => this.pageSnapshot
  getPresence = () => this.presenceSnapshot

  private refreshPages() {
    const out: PageMeta[] = []
    this.pages.forEach((m, id) => {
      const o = m.toJSON() as Partial<PageMeta>
      out.push({
        id,
        title: o.title ?? '',
        icon: o.icon ?? '',
        parent: o.parent ?? null,
        type: (o.type as PageType) ?? 'page',
        order: o.order ?? 0,
        inline: Boolean(o.inline),
        trashed: Boolean(o.trashed),
        createdAt: o.createdAt ?? 0,
        updatedAt: o.updatedAt ?? 0,
      })
    })
    out.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
    this.pageSnapshot = out
    this.emit()
  }

  private refreshPresence() {
    const aw = this.meta.provider?.awareness
    if (!aw) { this.presenceSnapshot = []; return }
    const users: PresenceUser[] = []
    aw.getStates().forEach((st, clientId) => {
      const u = st.user as { name: string; color: string } | undefined
      if (!u) return
      users.push({ clientId, name: u.name, color: u.color, pageId: (st.pageId as string) ?? null, self: clientId === aw.clientID })
    })
    this.presenceSnapshot = users
  }

  /** Dichiara su quale pagina stiamo lavorando (visibile ai colleghi). */
  setCurrentPage(pageId: string | null) {
    this.meta.provider?.awareness.setLocalStateField('pageId', pageId)
  }

  // ---- documenti delle pagine -----------------------------------------------
  acquire(docId: string): DocHandle {
    let h = this.handles.get(docId)
    if (!h) {
      h = new DocHandle(this, docId)
      this.handles.set(docId, h)
    }
    if (h.releaseTimer) { clearTimeout(h.releaseTimer); h.releaseTimer = null }
    h.refs++
    return h
  }

  release(docId: string) {
    const h = this.handles.get(docId)
    if (!h) return
    h.refs = Math.max(0, h.refs - 1)
    if (h.refs === 0) h.releaseTimer = setTimeout(() => { h.releaseTimer = null; this.tryDispose(h) }, GRACE_MS)
  }

  private tryDispose(h: DocHandle) {
    if (h.refs > 0) return
    if (h.dirty && h.provider) return // aspetta che le modifiche arrivino al server (clearDirty ritenta)
    this.handles.delete(h.docId)
    h.destroy()
  }

  /** Esegue una modifica su un documento senza tenerlo aperto nella UI. */
  async withDoc<T>(docId: string, fn: (doc: Y.Doc) => T): Promise<T> {
    const h = this.acquire(docId)
    try {
      await h.whenReady()
      return fn(h.doc)
    } finally {
      this.release(docId)
    }
  }

  // ---- modifiche ancora da sincronizzare (lavoro offline) -------------------
  private readDirty(): string[] {
    try { return JSON.parse(localStorage.getItem(this.dirtyKey) || '[]') } catch { return [] }
  }
  private writeDirty(ids: string[]) {
    try { localStorage.setItem(this.dirtyKey, JSON.stringify([...new Set(ids)])) } catch { /* ignore */ }
  }
  markDirty(h: DocHandle) {
    if (h.docId === 'meta') return
    h.dirty = true
    const ids = this.readDirty()
    if (!ids.includes(h.docId)) this.writeDirty([...ids, h.docId])
  }
  clearDirty(h: DocHandle) {
    if (!h.dirty && !this.readDirty().includes(h.docId)) return
    h.dirty = false
    this.writeDirty(this.readDirty().filter((i) => i !== h.docId))
    if (h.refs === 0 && !h.releaseTimer) this.tryDispose(h)
  }
  private flushDirtyFromPreviousRun() {
    // Riapre i documenti con modifiche non ancora inviate: il provider le sincronizza appena c'è connessione.
    for (const id of this.readDirty()) {
      const h = this.acquire(id)
      h.dirty = true
      this.release(id)
    }
  }

  // ---- operazioni sull'albero delle pagine ----------------------------------
  workspaceName(): string { return (this.info.get('name') as string) || '' }

  setWorkspaceInfo(name: string, icon?: string) {
    this.meta.doc.transact(() => {
      this.info.set('name', name)
      if (icon) this.info.set('icon', icon)
      if (!this.info.get('createdAt')) this.info.set('createdAt', Date.now())
    })
  }

  private nextOrder(parent: string | null): number {
    let max = 0
    for (const p of this.pageSnapshot) if (p.parent === parent && p.order > max) max = p.order
    return max + 1
  }

  createPage(opts: { title?: string; icon?: string; parent?: string | null; type?: PageType; inline?: boolean; id?: string } = {}): string {
    const id = opts.id ?? newPageId()
    const parent = opts.parent ?? null
    const now = Date.now()
    const order = this.nextOrder(parent)
    const m = new Y.Map<unknown>()
    this.meta.doc.transact(() => {
      this.pages.set(id, m)
      m.set('title', opts.title ?? '')
      m.set('icon', opts.icon ?? (opts.type === 'database' ? '🗂️' : '📄'))
      m.set('parent', parent)
      m.set('type', opts.type ?? 'page')
      m.set('order', order)
      m.set('inline', Boolean(opts.inline))
      m.set('trashed', false)
      m.set('createdAt', now)
      m.set('updatedAt', now)
    })
    return id
  }

  updatePage(id: string, patch: Partial<Pick<PageMeta, 'title' | 'icon' | 'parent' | 'order' | 'trashed'>>) {
    const m = this.pages.get(id)
    if (!m) return
    this.meta.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) if (m.get(k) !== v) m.set(k, v)
      m.set('updatedAt', Date.now())
    })
  }

  descendants(id: string): string[] {
    const out: string[] = []
    const walk = (pid: string) => {
      for (const p of this.pageSnapshot) if (p.parent === pid) { out.push(p.id); walk(p.id) }
    }
    walk(id)
    return out
  }

  trashPage(id: string) {
    this.meta.doc.transact(() => {
      for (const pid of [id, ...this.descendants(id)]) this.updatePage(pid, { trashed: true })
    })
  }

  restorePage(id: string) {
    const page = this.pageSnapshot.find((p) => p.id === id)
    this.meta.doc.transact(() => {
      // Se il genitore è nel cestino, riporta la pagina alla radice.
      const parent = page?.parent ? this.pageSnapshot.find((p) => p.id === page.parent) : null
      if (parent?.trashed) this.updatePage(id, { parent: null })
      for (const pid of [id, ...this.descendants(id)]) this.updatePage(pid, { trashed: false })
    })
  }

  deletePageForever(id: string) {
    this.meta.doc.transact(() => {
      for (const pid of [id, ...this.descendants(id)]) this.pages.delete(pid)
    })
  }

  destroy() {
    for (const h of this.handles.values()) h.destroy()
    this.handles.clear()
    this.meta.destroy()
  }
}

// ---- cache delle sessioni (una per workspace aperto) -------------------------
interface Entry { session: WorkspaceSession; users: number; timer?: ReturnType<typeof setTimeout> }
const sessions = new Map<string, Entry>()

/** Restituisce (creandola se serve) la sessione del workspace. Idempotente: sicuro da usare nel render. */
export function getSession(id: string): WorkspaceSession {
  let entry = sessions.get(id)
  if (!entry) {
    entry = { session: new WorkspaceSession(id), users: 0 }
    sessions.set(id, entry)
  }
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined }
  return entry.session
}

export function retainSession(id: string) {
  const entry = sessions.get(id)
  if (!entry) return
  entry.users++
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined }
}

export function releaseSession(id: string) {
  const entry = sessions.get(id)
  if (!entry) return
  entry.users--
  if (entry.users <= 0) {
    entry.timer = setTimeout(() => {
      if (entry.users <= 0) {
        entry.session.destroy()
        sessions.delete(id)
      }
    }, 5_000)
  }
}
