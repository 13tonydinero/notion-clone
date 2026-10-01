import { useSyncExternalStore } from 'react'

/** Piccolo store osservabile, persistito in localStorage. */
export function createPersistedStore<T extends object>(key: string, defaults: T) {
  let state: T = { ...defaults }
  try {
    const raw = localStorage.getItem(key)
    if (raw) state = { ...defaults, ...JSON.parse(raw) }
  } catch { /* storage non disponibile */ }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch }
      try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* ignore */ }
      listeners.forEach((l) => l())
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
    use(): T {
      return useSyncExternalStore((l) => {
        listeners.add(l)
        return () => { listeners.delete(l) }
      }, () => state)
    },
  }
}
