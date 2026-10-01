import { useEffect, useState } from 'react'

export interface Route {
  /** 'home' | 'workspace' | 'join' */
  name: 'home' | 'workspace' | 'join'
  wsId?: string
  pageId?: string
  joinName?: string
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  const params = new URLSearchParams(query)
  if (parts[0] === 'join' && parts[1]) return { name: 'join', wsId: parts[1], joinName: params.get('n') || undefined }
  if (parts[0] === 'w' && parts[1]) return { name: 'workspace', wsId: parts[1], pageId: parts[2] === 'p' ? parts[3] : undefined }
  return { name: 'home' }
}

export const workspaceHash = (wsId: string, pageId?: string | null) =>
  pageId ? `#/w/${wsId}/p/${pageId}` : `#/w/${wsId}`

export function navigate(hash: string, replace = false) {
  if (replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else location.hash = hash
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => {
      const next = parseHash(location.hash)
      setRoute((prev) => (prev.name === next.name && prev.wsId === next.wsId && prev.pageId === next.pageId && prev.joinName === next.joinName ? prev : next))
    }
    window.addEventListener('hashchange', on)
    // Gli effetti dei figli (es. <Join>) possono cambiare l'URL prima che questo listener esista.
    on()
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
