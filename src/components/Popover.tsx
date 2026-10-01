import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  anchor: RefObject<HTMLElement | null> | HTMLElement | null
  onClose: () => void
  children: ReactNode
  width?: number
  align?: 'left' | 'right'
  className?: string
}

/** Menu flottante ancorato a un elemento; su schermi stretti diventa un "bottom sheet". */
export function Popover({ anchor, onClose, children, width = 260, align = 'left', className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null)

  useLayoutEffect(() => {
    const el = anchor instanceof HTMLElement ? anchor : anchor?.current
    if (!el || !ref.current) return
    const r = el.getBoundingClientRect()
    const h = ref.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'right' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, vw - width - 8))
    const below = vh - r.bottom - 8
    const above = r.top - 8
    let top: number
    let maxH: number
    if (h <= below || below >= above) { top = r.bottom + 4; maxH = Math.max(160, below - 4) }
    else { maxH = Math.max(160, above - 4); top = Math.max(8, r.top - Math.min(h, maxH) - 4) }
    setPos({ top, left, maxH })
  }, [anchor, width, align])

  useEffect(() => {
    const down = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      const a = anchor instanceof HTMLElement ? anchor : anchor?.current
      if (ref.current?.contains(t) || a?.contains(t)) return
      // Un popover annidato (portal) non deve chiudere quello padre.
      if ((t as HTMLElement).closest?.('.popover')) return
      onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('mousedown', down)
    document.addEventListener('touchstart', down)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('touchstart', down)
      document.removeEventListener('keydown', key, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={pos ? { top: pos.top, left: pos.left, width, maxHeight: pos.maxH } : { top: 0, left: 0, width, visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
