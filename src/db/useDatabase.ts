import { useEffect, useMemo, useState } from 'react'
import type { DocHandle, WorkspaceSession } from '../sync/session'
import { getDb, snapshot, type DbHandles, type DbSnapshot } from './schema'

/** Apre il documento di un database e restituisce uno snapshot reattivo. */
export function useDatabase(session: WorkspaceSession, pageId: string) {
  const [handle, setHandle] = useState<DocHandle | null>(null)
  useEffect(() => {
    const h = session.acquire(pageId)
    setHandle(h)
    return () => { setHandle(null); session.release(pageId) }
  }, [session, pageId])

  const db: DbHandles | null = useMemo(() => (handle ? getDb(handle.doc) : null), [handle])
  const [snap, setSnap] = useState<DbSnapshot | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!db || !handle) { setSnap(null); setLoaded(false); return }
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setSnap(snapshot(db)))
    }
    setSnap(snapshot(db))
    const targets = [db.columns, db.rows, db.views]
    targets.forEach((t) => t.observeDeep(update))
    handle.whenReady().then(() => { setSnap(snapshot(db)); setLoaded(true) })
    return () => { cancelAnimationFrame(raf); targets.forEach((t) => t.unobserveDeep(update)) }
  }, [db, handle])

  return { db, handle, snap, loaded }
}
