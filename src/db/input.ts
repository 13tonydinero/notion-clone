import type { Column } from './schema'
import { formatNumber } from './query'

/** Converte testo (incollato o importato) nel valore interno di una colonna. */
export function parseInput(col: Column, text: string): { value: unknown; newOptions?: string[] } {
  const t = text.trim()
  if (t === '') return { value: null }
  switch (col.type) {
    case 'number': {
      const n = Number(t.replace(/[€%\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
      return { value: Number.isFinite(n) ? n : null }
    }
    case 'checkbox': return { value: /^(s[iì]|true|vero|x|1|yes|✓|✔)$/i.test(t) }
    case 'date': {
      const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
      if (iso) return { value: `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}` }
      const it = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t)
      if (it) {
        const y = it[3].length === 2 ? `20${it[3]}` : it[3]
        return { value: `${y}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}` }
      }
      const d = new Date(t)
      return { value: Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    }
    case 'select': case 'status': {
      const o = col.options?.find((x) => x.label.toLowerCase() === t.toLowerCase())
      return o ? { value: o.id } : { value: null, newOptions: [t] }
    }
    case 'multiselect': {
      const labels = t.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      const ids: string[] = []
      const missing: string[] = []
      for (const l of labels) {
        const o = col.options?.find((x) => x.label.toLowerCase() === l.toLowerCase())
        if (o) ids.push(o.id)
        else missing.push(l)
      }
      return { value: ids.length ? ids : null, newOptions: missing.length ? missing : undefined }
    }
    case 'formula': case 'created': return { value: null }
    default: return { value: t }
  }
}

export const numberToInput = (n: unknown, _fmt?: Column['numberFormat']) => (typeof n === 'number' ? String(n) : '')
export const numberDisplay = (n: number, fmt?: Column['numberFormat']) => formatNumber(n, fmt)
