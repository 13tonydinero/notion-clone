import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import type { PageMeta } from '../types'

export function SearchDialog({ pages, onOpen, onClose }: { pages: PageMeta[]; onOpen: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    return pages.filter((p) => !p.trashed && (p.title || 'senza titolo').toLowerCase().includes(t)).slice(0, 30)
  }, [pages, q])
  const path = (p: PageMeta) => {
    const names: string[] = []
    let cur = p.parent ? pages.find((x) => x.id === p.parent) : undefined
    while (cur) { names.unshift(cur.title || 'Senza titolo'); cur = cur.parent ? pages.find((x) => x.id === cur!.parent) : undefined }
    return names.join(' / ')
  }
  return (
    <Dialog title="Cerca pagine" onClose={onClose}>
      <input ref={ref} className="search-input" placeholder="Cerca per titolo…" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
          if (e.key === 'Enter' && results[sel]) { onOpen(results[sel].id); onClose() }
        }} />
      <div className="menu-list search-results">
        {results.map((p, i) => (
          <button key={p.id} className={`menu-item ${i === sel ? 'active' : ''}`} onClick={() => { onOpen(p.id); onClose() }}>
            <span>{p.icon || '📄'}</span> <span>{p.title || 'Senza titolo'}</span>
            <small className="muted"> {p.type === 'database' ? 'database' : ''} {path(p)}</small>
          </button>
        ))}
        {!results.length && <div className="menu-empty">Nessun risultato</div>}
      </div>
    </Dialog>
  )
}
