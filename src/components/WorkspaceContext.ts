import { createContext, useContext } from 'react'
import type { WorkspaceSession } from '../sync/session'
import type { PageMeta } from '../types'

export interface WorkspaceCtx {
  session: WorkspaceSession
  pages: PageMeta[]
  openPage: (id: string) => void
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(WorkspaceContext)
  if (!v) throw new Error('WorkspaceContext mancante')
  return v
}
