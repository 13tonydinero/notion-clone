import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { getSession, releaseSession, retainSession, type WorkspaceSession } from './session'
import type { ConnectionStatus, PageMeta, PresenceUser } from '../types'

export function useSession(wsId: string): WorkspaceSession {
  const session = useMemo(() => getSession(wsId), [wsId])
  useEffect(() => {
    retainSession(wsId)
    return () => releaseSession(wsId)
  }, [wsId])
  return session
}

export function usePages(s: WorkspaceSession): PageMeta[] {
  return useSyncExternalStore(s.subscribe, s.getPages)
}
export function useStatus(s: WorkspaceSession): ConnectionStatus {
  return useSyncExternalStore(s.subscribe, s.getStatus)
}
export function usePresence(s: WorkspaceSession): PresenceUser[] {
  return useSyncExternalStore(s.subscribe, s.getPresence)
}
