import { httpBase, settings } from '../lib/settings'
import { sanitizeBlueprint, type Blueprint } from './blueprint'
import { planLocal, type PlanResult } from './localEngine'
import { toISO } from './dates'

export interface ServerInfo { ai: boolean; model: string | null; requiresPassword: boolean; lan: string[]; port: number }

let infoCache: { at: number; value: ServerInfo | null } | null = null

/** Informazioni sul server (AI disponibile? password?). `null` se offline o senza server. */
export async function getServerInfo(force = false): Promise<ServerInfo | null> {
  if (!force && infoCache && Date.now() - infoCache.at < 30_000) return infoCache.value
  let value: ServerInfo | null = null
  if (settings.get().syncEnabled && navigator.onLine !== false) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(`${httpBase()}/api/info`, { signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) value = await res.json()
    } catch { /* offline */ }
  }
  infoCache = { at: Date.now(), value }
  return value
}

export interface PlanOutcome extends PlanResult { source: 'ai' | 'local'; note?: string }

async function planWithAI(prompt: string, pages: string[]): Promise<Blueprint> {
  const s = settings.get()
  const res = await fetch(`${httpBase()}/api/ai/blueprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(s.password ? { 'x-app-password': s.password } : {}) },
    body: JSON.stringify({ prompt, context: { pages } }),
  })
  if (!res.ok) throw new Error(`AI ${res.status}`)
  const bp = sanitizeBlueprint(await res.json())
  if (!bp) throw new Error('Risposta AI non valida')
  return bp
}

/**
 * Decide cosa fare con la richiesta dell'utente.
 * - Comandi rapidi (aggiungi pagina/riga, aiuto): sempre locali.
 * - Creazione di un ambiente: Claude se il server lo offre, altrimenti motore locale offline.
 */
export async function plan(prompt: string, existingPages: string[] = []): Promise<PlanOutcome> {
  const local = planLocal(prompt, toISO(new Date()))
  if (local.kind === 'command') return { ...local, source: 'local' }
  const info = await getServerInfo()
  if (info?.ai) {
    try {
      const blueprint = await planWithAI(prompt, existingPages)
      return { kind: 'blueprint', reply: '', blueprint, source: 'ai' }
    } catch {
      return { ...local, source: 'local', note: 'L’AI online non ha risposto: ho usato l’assistente locale.' }
    }
  }
  return { ...local, source: 'local' }
}
