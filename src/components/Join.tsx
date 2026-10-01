import { useEffect } from 'react'
import { addWorkspace } from '../lib/workspaces'
import { navigate, workspaceHash } from '../lib/route'

/** Apre un workspace condiviso: lo registra su questo dispositivo e lo apre. */
export function Join({ wsId, name }: { wsId: string; name?: string }) {
  useEffect(() => {
    addWorkspace(name ? decodeURIComponent(name) : 'Workspace condiviso', '👥', wsId)
    navigate(workspaceHash(wsId), true)
  }, [wsId, name])
  return <div className="db-loading">Apertura del workspace condiviso…</div>
}
