// Riconoscimento di date in italiano ("sabato", "12 ottobre", "tra 2 settimane", "12/10/2026"…).

const WEEKDAYS: Record<string, number> = {
  domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6,
}

/** Minuscolo e senza accenti, mantenendo la stessa lunghezza (così gli indici valgono anche sul testo originale). */
const fold = (s: string) => s.toLowerCase().replace(/[àáâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôö]/g, 'o').replace(/[ùúûü]/g, 'u')
const MONTHS: Record<string, number> = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5, luglio: 6, agosto: 7,
  settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5, lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11,
}

const pad = (n: number) => String(n).padStart(2, '0')
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (iso: string, n: number) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d) }

export interface FoundDate { iso: string; matched: string }

/** Cerca la prima data nel testo. `today` è ISO (YYYY-MM-DD). */
export function findDate(text: string, today: string): FoundDate | null {
  const found = findDateFolded(fold(text), today)
  if (!found) return null
  // `matched` deve essere il testo originale (con accenti e maiuscole) per poterlo rimuovere dal titolo.
  const idx = fold(text).indexOf(found.matched)
  return { iso: found.iso, matched: idx >= 0 ? text.slice(idx, idx + found.matched.length) : found.matched }
}

function findDateFolded(t: string, today: string): FoundDate | null {
  const now = fromISO(today)

  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t)
  if (m) return { iso: m[0], matched: m[0] }

  m = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(t)
  if (m) {
    const day = Number(m[1]), month = Number(m[2]) - 1
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear()
      let d = new Date(year, month, day)
      if (!m[3] && d < now) { year++; d = new Date(year, month, day) }
      return { iso: toISO(d), matched: m[0] }
    }
  }

  m = new RegExp(`\\b(\\d{1,2})\\s*(?:°|º)?\\s+(${Object.keys(MONTHS).filter((k) => k.length > 3).join('|')})(?:\\s+(\\d{4}))?\\b`).exec(t)
  if (m) {
    const month = MONTHS[m[2]]
    let year = m[3] ? Number(m[3]) : now.getFullYear()
    let d = new Date(year, month, Number(m[1]))
    if (!m[3] && d < now) { year++; d = new Date(year, month, Number(m[1])) }
    return { iso: toISO(d), matched: m[0] }
  }

  m = /\btra\s+(\d+|un|una|due|tre|quattro|cinque)\s+(giorn[oi]|settiman[ae]|mes[ei])\b/.exec(t)
  if (m) {
    const words: Record<string, number> = { un: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5 }
    const n = words[m[1]] ?? Number(m[1])
    const days = m[2].startsWith('giorn') ? n : m[2].startsWith('settiman') ? n * 7 : n * 30
    return { iso: addDays(today, days), matched: m[0] }
  }

  m = /\b(dopodomani|domani|oggi|stasera|stanotte)\b/.exec(t)
  if (m) return { iso: addDays(today, m[1] === 'dopodomani' ? 2 : m[1] === 'domani' ? 1 : 0), matched: m[0] }

  m = new RegExp(`\\b(${Object.keys(WEEKDAYS).join('|')})(\\s+prossimo|\\s+prossima)?\\b`).exec(t)
  if (m) {
    const target = WEEKDAYS[m[1]]
    let diff = (target - now.getDay() + 7) % 7
    if (diff === 0) diff = 7
    if (m[2]) diff += diff <= 2 ? 7 : 0
    return { iso: addDays(today, diff), matched: m[0] }
  }

  m = /\bprossima settimana\b/.exec(t)
  if (m) return { iso: addDays(today, 7), matched: m[0] }
  return null
}
