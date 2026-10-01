import { useEffect, useRef, useState } from 'react'
import type { WorkspaceSession } from '../sync/session'
import type { PageMeta } from '../types'
import { plan, getServerInfo } from './assistant'
import { applyBlueprint } from './materialize'
import { countBlueprint, type Blueprint, type BPPage } from './blueprint'
import { HELP_TEXT, TARGET_HINTS, type LocalAction } from './localEngine'
import { Markdownish } from '../components/Markdownish'
import { addRow, getDb } from '../db/schema'

interface Msg {
  id: number
  role: 'user' | 'bot'
  text: string
  blueprint?: Blueprint
  state?: 'pending' | 'creating' | 'done' | 'discarded'
  openId?: string
  source?: 'ai' | 'local'
}

const SUGGESTIONS = [
  'Crea un progetto per organizzare una serata sabato 17 ottobre con 200 invitati',
  'Crea un ambiente per sviluppare una nuova app',
  'Organizza un viaggio a Lisbona tra 2 mesi',
  'Aggiungi task: preparare la locandina entro venerdì',
  'Aiuto',
]

export function BlueprintPreview({ bp }: { bp: Blueprint }) {
  const c = countBlueprint(bp)
  const line = (p: BPPage, depth = 0): React.ReactNode => (
    <li key={p.title + depth}>
      <span>{p.icon || (p.database ? '🗂️' : '📄')} {p.title}</span>
      {p.database && <small> · database, {p.database.rows.length} righe</small>}
      {p.children && <ul>{p.children.map((x) => line(x, depth + 1))}</ul>}
    </li>
  )
  return (
    <div className="bp-preview">
      <div className="bp-title">{bp.icon} {bp.title}</div>
      <ul>{bp.pages.map((p) => line(p))}</ul>
      <small>{c.pages} pagine · {c.databases} database · {c.rows} righe di esempio</small>
    </div>
  )
}

export function ChatPanel({ session, pages, onOpenPage, onClose }: { session: WorkspaceSession; pages: PageMeta[]; onOpenPage: (id: string) => void; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'bot', text: 'Ciao! Descrivi il progetto che vuoi creare e preparo pagine, task, tabelle e database. Funziono anche senza internet.' }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState<{ ai: boolean; model: string | null } | null>(null)
  const idRef = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { getServerInfo().then((i) => setAi(i ? { ai: i.ai, model: i.model } : null)) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs])

  const push = (m: Omit<Msg, 'id'>) => { const id = idRef.current++; setMsgs((x) => [...x, { ...m, id }]); return id }
  const patch = (id: number, p: Partial<Msg>) => setMsgs((x) => x.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const runAction = async (a: LocalAction) => {
    const live = pages.filter((p) => !p.trashed)
    if (a.kind === 'help') return push({ role: 'bot', text: HELP_TEXT })
    if (a.kind === 'list') {
      const t = live.filter((p) => !p.inline).map((p) => `${p.icon} ${p.title || 'Senza titolo'}${p.type === 'database' ? ' (database)' : ''}`)
      return push({ role: 'bot', text: t.length ? `Pagine del workspace:\n${t.join('\n')}` : 'Il workspace è ancora vuoto.' })
    }
    if (a.kind === 'addPage') {
      const id = session.createPage({ title: a.title })
      return push({ role: 'bot', text: `Pagina **${a.title}** creata.`, openId: id })
    }
    // addRow
    const dbs = live.filter((p) => p.type === 'database')
    if (!dbs.length) return push({ role: 'bot', text: 'Non ci sono ancora database. Prima crea un ambiente, ad esempio “Crea un progetto per una serata”.' })
    const hints = TARGET_HINTS[a.target] ?? [a.target]
    const scored = dbs.map((d) => ({ d, score: hints.reduce((s, h) => s + (d.title.toLowerCase().includes(h.toLowerCase()) ? 1 : 0), 0) + (d.title.toLowerCase().includes(a.target.toLowerCase()) ? 2 : 0) }))
    scored.sort((x, y) => y.score - x.score)
    let target = scored[0].score > 0 ? scored[0].d : dbs.length === 1 ? dbs[0] : null
    if (!target) return push({ role: 'bot', text: `Non so in quale database inserire “${a.title}”. Specificalo, ad esempio: “Aggiungi task: ${a.title} in ${dbs[0].title}”.\nDatabase disponibili: ${dbs.map((d) => d.title).join(', ')}.` })
    const t = target
    const ok = await session.withDoc(t.id, (doc) => {
      const db = getDb(doc)
      const cols = db.columns.toArray().map((m) => m.toJSON() as { id: string; type: string; options?: { id: string }[] })
      if (!cols.length) return false
      const cells: Record<string, unknown> = { [cols[0].id]: a.title }
      const status = cols.find((c) => c.type === 'status')
      if (status?.options?.length) cells[status.id] = status.options[0].id
      if (a.date) { const d = cols.find((c) => c.type === 'date'); if (d) cells[d.id] = a.date }
      addRow(db, cells)
      return true
    })
    return push({ role: 'bot', text: ok ? `Aggiunto **${a.title}** in “${t.title}”${a.date ? ` (data ${a.date})` : ''}.` : 'Questo database non è ancora configurato.', openId: ok ? t.id : undefined })
  }

  const send = async (raw: string) => {
    const prompt = raw.trim()
    if (!prompt || busy) return
    setInput('')
    push({ role: 'user', text: prompt })
    setBusy(true)
    try {
      const out = await plan(prompt, pages.filter((p) => !p.trashed && !p.inline).map((p) => p.title))
      if (out.kind === 'command' && out.action) await runAction(out.action)
      else if (out.kind === 'blueprint' && out.blueprint) {
        push({
          role: 'bot', blueprint: out.blueprint, state: 'pending', source: out.source,
          text: `${out.blueprint.summary ?? `Ecco la struttura che propongo per **${out.blueprint.title}**.`}${out.note ? `\n${out.note}` : ''}`,
        })
      } else push({ role: 'bot', text: out.reply })
    } catch (e) {
      push({ role: 'bot', text: `Si è verificato un errore: ${e instanceof Error ? e.message : 'sconosciuto'}` })
    } finally { setBusy(false) }
  }

  const create = async (m: Msg) => {
    if (!m.blueprint) return
    patch(m.id, { state: 'creating' })
    try {
      const res = await applyBlueprint(session, m.blueprint)
      patch(m.id, { state: 'done', openId: res.rootId })
      push({ role: 'bot', text: `Fatto! Ho creato **${m.blueprint.title}**: ${res.pages} pagine, ${res.databases} database e ${res.rows} righe di esempio. Il tuo collega le vede subito se è connesso.`, openId: res.rootId })
      onOpenPage(res.rootId)
    } catch (e) {
      patch(m.id, { state: 'pending' })
      push({ role: 'bot', text: `Non sono riuscito a creare l'ambiente: ${e instanceof Error ? e.message : 'errore'}` })
    }
  }

  return (
    <aside className="chat" aria-label="Assistente">
      <header className="chat-head">
        <b>🤖 Assistente</b>
        <span className={`chat-mode ${ai?.ai ? 'online' : ''}`} title={ai?.ai ? `Modello: ${ai.model}` : 'Assistente locale, funziona anche senza internet'}>{ai?.ai ? 'AI online' : 'Locale · offline'}</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Chiudi assistente">✕</button>
      </header>
      <div className="chat-body">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="bubble">
              <Markdownish text={m.text} />
              {m.blueprint && <BlueprintPreview bp={m.blueprint} />}
              {m.blueprint && m.state === 'pending' && (
                <div className="msg-actions">
                  <button className="btn primary" onClick={() => create(m)}>Crea ambiente</button>
                  <button className="btn" onClick={() => patch(m.id, { state: 'discarded' })}>Annulla</button>
                </div>
              )}
              {m.state === 'creating' && <div className="msg-note">Creazione in corso…</div>}
              {m.state === 'discarded' && <div className="msg-note">Annullato. Puoi riformulare la richiesta.</div>}
              {m.openId && m.state !== 'pending' && <button className="btn" onClick={() => onOpenPage(m.openId!)}>Apri</button>}
            </div>
          </div>
        ))}
        {busy && <div className="msg bot"><div className="bubble typing">…</div></div>}
        <div ref={endRef} />
      </div>
      <div className="chat-suggest">
        {SUGGESTIONS.map((s) => <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <textarea
          value={input} rows={2} placeholder="Descrivi cosa vuoi creare…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
        />
        <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Invia</button>
      </form>
    </aside>
  )
}
