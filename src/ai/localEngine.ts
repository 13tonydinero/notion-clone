// Assistente locale (funziona completamente offline): riconosce l'intento in italiano/inglese
// e produce un blueprint da modelli, oppure comandi rapidi (aggiungi pagina, aggiungi riga…).
import type { Blueprint } from './blueprint'
import { findDate, toISO, addDays } from './dates'
import { TEMPLATES, generico, type Template, type TemplateParams } from './templates'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function pickTemplate(prompt: string): Template | null {
  const text = norm(prompt)
  let best: { t: Template; score: number } | null = null
  for (const t of TEMPLATES) {
    let score = 0
    for (const k of t.keywords) {
      const nk = norm(k)
      if (new RegExp(`(^|[^a-z])${nk.replace(/\s+/g, '\\s+')}`).test(text)) score += nk.length > 4 ? 2 : 1
    }
    if (score > 0 && (!best || score > best.score)) best = { t, score }
  }
  return best?.t ?? null
}

const STOP = new Set(['il', 'lo', 'la', 'le', 'i', 'gli', 'un', 'una', 'con', 'e', 'che', 'per', 'del', 'dei', 'delle', 'dal', 'entro', 'il', 'ci', 'mi', 'dove', 'cosi', 'cosa', 'tra', 'fra', 'oggi', 'domani', 'sabato', 'domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre', 'budget', 'invitati', 'ospiti', 'persone'])
const LINKERS = new Set(['di', 'in', 'al', 'alla', 'allo', 'ai', 'da', 'del', 'della', 'dello', 'a', 'su', 'sul', 'sulla', 'at'])

function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

/** Ricava un nome del progetto dal testo. */
export function extractName(prompt: string, template: Template | null, dateMatched?: string): string {
  const quoted = /["“«']([^"”»']{3,60})["”»']/.exec(prompt)
  if (quoted) return quoted[1].trim()
  const named = /\b(?:chiamat[oa]|intitolat[oa]|nome|dal nome|detto)\s+["“«]?([\p{L}0-9][\p{L}0-9' _-]{1,50}?)["”»]?(?=\s+(?:con|per|il|e|che|di)\b|[,.;!?]|$)/iu.exec(prompt)
  if (named) return titleCase(named[1].trim())
  const clean = dateMatched ? prompt.replace(new RegExp(dateMatched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') : prompt
  const kws = template ? template.keywords.filter((k) => !k.includes(' ')) : []
  if (kws.length) {
    const words = clean.split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const w = norm(words[i]).replace(/[^a-z]/g, '')
      if (!kws.some((k) => norm(k) === w)) continue
      const out = [words[i].replace(/[,.;!?]/g, '')]
      let j = i + 1
      while (j < words.length && out.length < 4) {
        const nw = words[j].replace(/[,.;!?]$/g, '')
        const n = norm(nw)
        if (!nw || STOP.has(n) || /^\d/.test(n)) break
        if (LINKERS.has(n) && !(j + 1 < words.length && !STOP.has(norm(words[j + 1])) && !/^\d/.test(words[j + 1]))) break
        out.push(nw)
        j++
        if (/[,.;!?]$/.test(words[j - 1])) break
      }
      return titleCase(out.join(' '))
    }
  }
  return template ? template.label.split(' / ')[0] : 'Nuovo progetto'
}

/** Il luogo viene riconosciuto solo se è nominato esplicitamente: «al club Aria», «presso la villa "Rosa"», «locale di Mario». */
export function extractPlace(prompt: string): string | undefined {
  const m = /\b(?:presso|al|alla|allo|in)\s+(?:locale|club|discoteca|ristorante|villa|hotel|sala|teatro|lido|pub|bar)\s+(?:(?:di|chiamat[oa])\s+|(["“«]))?([^,.;!?"”»]+)/iu.exec(prompt)
  if (!m) return undefined
  const quoted = Boolean(m[1]) || /(?:di|chiamat[oa])\s+$/i.test(m[0].slice(0, m[0].length - m[2].length))
  const words: string[] = []
  for (const w of m[2].trim().split(/\s+/)) {
    const n = norm(w)
    if (!w || STOP.has(n) || /^\d/.test(n) || ['con', 'per', 'e', 'il', 'di'].includes(n)) break
    if (!quoted && !/^\p{Lu}/u.test(w)) break // senza virgolette/«di» serve un nome proprio (maiuscola)
    words.push(w)
    if (words.length >= 4) break
  }
  return words.length ? words.join(' ') : undefined
}

export function extractParams(prompt: string, today: string, template: Template | null): TemplateParams {
  const found = findDate(prompt, today)
  const guests = /(\d{2,5})\s*(?:persone|ospiti|invitati|partecipanti|pax|presenze)/i.exec(prompt)
  const budget = /budget\s*(?:di|da|:)?\s*(?:€|euro)?\s*(\d[\d.]*)\s*(?:€|euro)?|(\d[\d.]*)\s*(?:€|euro)\s*di\s*budget/i.exec(prompt)
  const place = extractPlace(prompt)
  const fallbackDate = addDays(today, template?.id === 'evento' ? 30 : 60)
  return {
    name: extractName(prompt, template, found?.matched),
    date: found?.iso ?? fallbackDate,
    today,
    guests: guests ? Number(guests[1]) : undefined,
    budget: budget ? Number((budget[1] ?? budget[2]).replace(/\./g, '')) : undefined,
    place: place ? titleCase(place) : undefined,
  }
}

const CREATE_RE = /\b(crea|creami|genera|generami|costruisci|prepara|preparami|organizza|organizzami|imposta|fammi|voglio|vorrei|servono|serve|nuovo|nuova|setup|create|build|make|set up|plan|organize|need)\b/i

export type LocalAction =
  | { kind: 'addPage'; title: string }
  | { kind: 'addRow'; target: string; title: string; date?: string }
  | { kind: 'help' }
  | { kind: 'list' }

export function parseCommand(prompt: string, today: string): LocalAction | null {
  const p = prompt.trim()
  if (/^(aiuto|help|cosa sai fare|come funzion)/i.test(p)) return { kind: 'help' }
  if (/^(elenca|mostra|lista)\s+(le\s+)?(pagine|database)/i.test(p)) return { kind: 'list' }
  let m = /^(?:aggiungi|crea|nuova|nuovo|add)\s+(?:una\s+|un\s+)?(?:nuova\s+)?pagina\s+(?:chiamata\s+|intitolata\s+|di\s+)?["“«]?(.{2,80}?)["”»]?$/i.exec(p)
  if (m) return { kind: 'addPage', title: titleCase(m[1].trim()) }
  m = /^(?:aggiungi|inserisci|segna|add)\s+(?:una\s+|un\s+|l[ao']\s*)?(task|attivit[àa]|invitato|ospite|fornitore|voce|spesa|riga|elemento|idea|contenuto)\s*[:\-]?\s+(.{2,200})$/i.exec(p)
  if (m) {
    let title = m[2].trim()
    let date: string | undefined
    const d = findDate(title, today)
    if (d && /\b(entro|per|scadenza|il|sabato|domenica|domani|oggi|tra|lunedi|martedi|mercoledi|giovedi|venerdi|\d)/i.test(d.matched + ' ' + title)) {
      date = d.iso
      title = title.replace(new RegExp(`\\s*(?:entro|per|scadenza|il)?\\s*${d.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').trim()
    }
    const toIn = /^(.*?)\s+(?:in|nel|nella|su|a)\s+(?:database\s+|tabella\s+|lista\s+)?["“«]?([\p{L}0-9' ]{2,40})["”»]?$/iu.exec(title)
    let target = m[1].toLowerCase()
    if (toIn) { title = toIn[1].trim(); target = toIn[2].trim() }
    return { kind: 'addRow', target, title: titleCase(title), date }
  }
  return null
}

/** Parole chiave che aiutano a scegliere il database di destinazione. */
export const TARGET_HINTS: Record<string, string[]> = {
  task: ['task', 'attivit', 'todo', 'da fare'], attivita: ['task', 'attivit'], 'attività': ['task', 'attivit'],
  invitato: ['invitat', 'ospit', 'lista'], ospite: ['invitat', 'ospit', 'lista'],
  fornitore: ['fornitor'], voce: ['budget', 'spese', 'costi'], spesa: ['budget', 'spese', 'costi'],
  idea: ['idee', 'idea'], contenuto: ['calendario', 'contenut', 'editorial'],
}

export interface PlanResult {
  kind: 'blueprint' | 'command' | 'clarify'
  reply: string
  blueprint?: Blueprint
  action?: LocalAction
  template?: string
}

export const HELP_TEXT = [
  'Posso aiutarti così (anche senza internet):',
  '• **Creare un ambiente completo**: “Crea un progetto per organizzare una serata sabato 12 ottobre con 200 invitati”.',
  '• Modelli disponibili: evento/serata, progetto software, viaggio, marketing, clienti (CRM), studio.',
  '• **Aggiungere una pagina**: “Aggiungi pagina Idee per il tema”.',
  '• **Aggiungere una riga a un database**: “Aggiungi task: preparare la locandina entro venerdì” o “Aggiungi invitato: Marco Rossi”.',
].join('\n')

export function planLocal(prompt: string, today = toISO(new Date())): PlanResult {
  const cmd = parseCommand(prompt, today)
  if (cmd) return { kind: 'command', reply: '', action: cmd }
  const template = pickTemplate(prompt)
  const wantsCreate = CREATE_RE.test(prompt) || prompt.split(/\s+/).length >= 4
  if (!template && !wantsCreate) {
    return { kind: 'clarify', reply: 'Non ho capito bene. Descrivimi il progetto che vuoi creare (es. “una serata in discoteca”, “un progetto software”, “un viaggio a Lisbona”) oppure scrivi **aiuto**.' }
  }
  const t = template ?? generico
  const params = extractParams(prompt, today, template)
  const blueprint = t.build(params)
  return { kind: 'blueprint', reply: '', blueprint, template: t.id }
}
