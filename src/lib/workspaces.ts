import { createPersistedStore } from './store'
import { newWorkspaceId } from './ids'

export interface WorkspaceEntry {
  id: string
  name: string
  icon: string
  createdAt: number
}

export const workspaces = createPersistedStore<{ list: WorkspaceEntry[]; lastOpened: string | null }>('nc:workspaces', {
  list: [],
  lastOpened: null,
})

export function addWorkspace(name: string, icon = '📘', id = newWorkspaceId()): WorkspaceEntry {
  const existing = workspaces.get().list.find((w) => w.id === id)
  if (existing) return existing
  const entry = { id, name, icon, createdAt: Date.now() }
  workspaces.set({ list: [...workspaces.get().list, entry] })
  return entry
}

export function updateWorkspaceEntry(id: string, patch: Partial<WorkspaceEntry>) {
  const list = workspaces.get().list
  if (!list.some((w) => w.id === id)) return
  workspaces.set({ list: list.map((w) => (w.id === id ? { ...w, ...patch } : w)) })
}

export function removeWorkspaceEntry(id: string) {
  workspaces.set({ list: workspaces.get().list.filter((w) => w.id !== id) })
}
