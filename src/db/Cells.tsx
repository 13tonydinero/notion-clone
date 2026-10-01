import { useEffect, useRef, useState } from 'react'
import { Popover } from '../components/Popover'
import { OPTION_COLORS, type Column, type SelectOption } from './schema'
import { displayValue, type CellValue } from './query'

export interface RemoteFocus { name: string; color: string }

interface CellProps {
  col: Column
  value: CellValue
  onChange: (v: unknown) => void
  onCreateOption?: (label: string) => SelectOption | null
  /** Identificatore per navigare tra celle con Invio e per le presenze. */
  cellKey?: string
  onFocusCell?: (key: string | null) => void
  onPasteGrid?: (text: string) => boolean
  onEnterNext?: () => void
  compact?: boolean
}

export function Tag({ option }: { option: SelectOption }) {
  return <span className={`tag tag-${option.color}`}>{option.label}</span>
}

/** Input testuale che invia le modifiche mentre si scrive (con debounce) così i colleghi le vedono in tempo reale. */
function TextInput({ value, onChange, type = 'text', inputMode, cellKey, onFocusCell, onPasteGrid, onEnterNext, placeholder, align, format, className }: {
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'decimal' | 'text' | 'email' | 'tel' | 'url'
  cellKey?: string
  onFocusCell?: (k: string | null) => void
  onPasteGrid?: (text: string) => boolean
  onEnterNext?: () => void
  placeholder?: string
  align?: 'right'
  format?: (v: string) => string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  const [isFocused, setIsFocused] = useState(false)
  const focused = useRef(false)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ draft, onChange })
  latest.current = { draft, onChange }

  useEffect(() => { if (!focused.current || !dirty.current) setDraft(value) }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const flush = () => {
    clearTimeout(timer.current)
    if (dirty.current) { dirty.current = false; latest.current.onChange(latest.current.draft) }
  }
  return (
    <input
      className={`cell-input ${className ?? ''}`}
      data-cell={cellKey}
      type={type}
      inputMode={inputMode}
      value={!isFocused && format ? format(draft) : draft}
      placeholder={placeholder}
      style={align ? { textAlign: align } : undefined}
      onFocus={() => { focused.current = true; setIsFocused(true); onFocusCell?.(cellKey ?? null) }}
      onBlur={() => { focused.current = false; setIsFocused(false); flush(); setDraft(value); onFocusCell?.(null) }}
      onChange={(e) => {
        setDraft(e.target.value)
        dirty.current = true
        latest.current.draft = e.target.value
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, 300)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { flush(); onEnterNext?.(); (e.target as HTMLInputElement).blur() }
        if (e.key === 'Escape') { dirty.current = false; setDraft(value); (e.target as HTMLInputElement).blur() }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text')
        if (onPasteGrid && /[\t\n]/.test(text.trim()) && onPasteGrid(text)) e.preventDefault()
      }}
    />
  )
}

function OptionPicker({ col, selected, multi, onPick, onCreate, onClose, anchor }: {
  col: Column
  selected: string[]
  multi: boolean
  onPick: (ids: string[]) => void
  onCreate?: (label: string) => SelectOption | null
  onClose: () => void
  anchor: React.RefObject<HTMLElement | null>
}) {
  const [q, setQ] = useState('')
  const options = col.options ?? []
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
  const exact = options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase())
  const toggle = (id: string) => {
    if (multi) onPick(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    else { onPick(selected[0] === id ? [] : [id]); onClose() }
  }
  const create = () => {
    const label = q.trim()
    if (!label || !onCreate) return
    const opt = onCreate(label)
    if (!opt) return
    if (multi) onPick([...selected, opt.id])
    else { onPick([opt.id]); onClose() }
    setQ('')
  }
  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <input
        autoFocus
        className="menu-search"
        placeholder={onCreate ? 'Cerca o crea…' : 'Cerca…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { if (filtered.length === 1 && !onCreate) toggle(filtered[0].id); else if (!exact) create(); else if (filtered[0]) toggle(filtered[0].id) }
        }}
      />
      <div className="menu-list">
        {filtered.map((o) => (
          <button key={o.id} className="menu-item" onClick={() => toggle(o.id)}>
            <Tag option={o} />
            {selected.includes(o.id) && <span className="menu-check">✓</span>}
          </button>
        ))}
        {q.trim() && !exact && onCreate && (
          <button className="menu-item" onClick={create}>Crea <b>{q.trim()}</b></button>
        )}
        {!filtered.length && !q.trim() && <div className="menu-empty">Nessuna opzione</div>}
      </div>
    </Popover>
  )
}

export function CellEditor({ col, value, onChange, onCreateOption, cellKey, onFocusCell, onPasteGrid, onEnterNext, compact }: CellProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  switch (col.type) {
    case 'text':
      return <TextInput value={(value as string) ?? ''} onChange={(v) => onChange(v)} cellKey={cellKey} onFocusCell={onFocusCell} onPasteGrid={onPasteGrid} onEnterNext={onEnterNext} />
    case 'url': case 'email': case 'phone': {
      const s = (value as string) ?? ''
      const href = col.type === 'url' ? (/^https?:\/\//.test(s) ? s : `https://${s}`) : col.type === 'email' ? `mailto:${s}` : `tel:${s}`
      return (
        <div className="cell-with-link">
          <TextInput value={s} onChange={(v) => onChange(v)} cellKey={cellKey} onFocusCell={onFocusCell} onPasteGrid={onPasteGrid} onEnterNext={onEnterNext}
            type={col.type === 'email' ? 'email' : col.type === 'phone' ? 'tel' : 'text'} inputMode={col.type === 'phone' ? 'tel' : col.type === 'email' ? 'email' : 'url'} />
          {s && <a className="cell-link" href={href} target="_blank" rel="noreferrer noopener" title="Apri">↗</a>}
        </div>
      )
    }
    case 'number': {
      const n = typeof value === 'number' ? value : null
      return (
        <TextInput
          value={n == null ? '' : String(n)}
          inputMode="decimal"
          align="right"
          cellKey={cellKey}
          onFocusCell={onFocusCell}
          onPasteGrid={onPasteGrid}
          onEnterNext={onEnterNext}
          format={(v) => (v === '' ? '' : displayValue(Number(v), col))}
          onChange={(v) => {
            const num = Number(v.replace(',', '.'))
            onChange(v.trim() === '' || Number.isNaN(num) ? null : num)
          }}
        />
      )
    }
    case 'checkbox':
      return (
        <label className="cell-check">
          <input type="checkbox" data-cell={cellKey} checked={value === true} onChange={(e) => onChange(e.target.checked)} onFocus={() => onFocusCell?.(cellKey ?? null)} onBlur={() => onFocusCell?.(null)} />
        </label>
      )
    case 'date':
      return (
        <input
          className="cell-input cell-date"
          data-cell={cellKey}
          type="date"
          value={(value as string) ?? ''}
          onFocus={() => onFocusCell?.(cellKey ?? null)}
          onBlur={() => onFocusCell?.(null)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
    case 'select': case 'status': case 'multiselect': {
      const multi = col.type === 'multiselect'
      const ids = (multi ? (Array.isArray(value) ? value : []) : value ? [value as string] : []) as string[]
      const opts = ids.map((id) => col.options?.find((o) => o.id === id)).filter(Boolean) as SelectOption[]
      return (
        <>
          <button ref={anchor} className={`cell-select ${compact ? 'compact' : ''}`} data-cell={cellKey} onClick={() => { setOpen(true); onFocusCell?.(cellKey ?? null) }}>
            {opts.length ? opts.map((o) => <Tag key={o.id} option={o} />) : <span className="cell-placeholder">{compact ? 'Vuoto' : ''}</span>}
          </button>
          {open && (
            <OptionPicker
              col={col}
              anchor={anchor}
              selected={ids}
              multi={multi}
              onCreate={onCreateOption}
              onPick={(next) => onChange(multi ? next : next[0] ?? null)}
              onClose={() => { setOpen(false); onFocusCell?.(null) }}
            />
          )}
        </>
      )
    }
    case 'formula': case 'created':
      return <CellReadOnly col={col} value={value} />
  }
}

export function CellReadOnly({ col, value }: { col: Column; value: CellValue }) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'error' in value) {
    return <span className="cell-readonly cell-error" title={value.error}>#ERR</span>
  }
  if (col.type === 'checkbox' || typeof value === 'boolean') return <span className="cell-readonly">{value ? '☑' : '☐'}</span>
  return <span className={`cell-readonly ${typeof value === 'number' ? 'num' : ''}`}>{displayValue(value, col)}</span>
}

/** Rappresentazione compatta di un valore (carte della board, calendario…). */
export function CellChip({ col, value }: { col: Column; value: CellValue }) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null
  if (col.type === 'select' || col.type === 'status' || col.type === 'multiselect') {
    const ids = Array.isArray(value) ? value : [value as string]
    return <>{ids.map((id) => { const o = col.options?.find((x) => x.id === id); return o ? <Tag key={id} option={o} /> : null })}</>
  }
  return <span className="chip-text">{displayValue(value, col)}</span>
}

export const colorSwatches = OPTION_COLORS
