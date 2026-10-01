import { useSyncExternalStore } from 'react'

interface Store<T> { get(): T; subscribe(l: () => void): () => void }

/** Legge un valore derivato da uno store (il selettore deve restituire riferimenti stabili). */
export function useStoreValue<T extends object, R>(store: Store<T>, select: (s: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => select(store.get()))
}
