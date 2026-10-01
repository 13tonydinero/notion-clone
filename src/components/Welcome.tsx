import { useRef, useState } from 'react'
import { addWorkspace, removeWorkspaceEntry, updateWorkspaceEntry, workspaces } from '../lib/workspaces'
import { navigate, workspaceHash } from '../lib/route'
import { getSession } from '../sync/session'
import { plan } from '../ai/assistant'
import { applyBlueprint } from '../ai/materialize'
import { BlueprintPreview } from '../ai/ChatPanel'
import { Markdownish } from './Markdownish'
import { TEMPLATES } from '../ai/templates'
import { toISO, addDays } from '../ai/dates'
import { importWorkspace, type BackupFile } from '../lib/backup'
import { settings } from '../lib/settings'
import { SettingsDialog } from './SettingsDialog'
import type { Blueprint } from '../ai/blueprint'
import { HELP_TEXT } from '../ai/localEngine'

async function createWorkspace(name: string, icon: string, bp?: Blueprint): Promise<string> {
  const entry = addWorkspace(name, icon)
  const session = getSession(entry.id)
  session.setWorkspaceInfo(name, icon)
  if (bp) {
    const res = await applyBlueprint(session, bp)
    navigate(workspaceHash(entry.id, res.rootId))
  } else {
    const id = session.createPage({ title: 'Benvenuto', icon: '👋' })
    navigate(workspaceHash(entry.id, id))
  }
  return entry.id
}

export function Welcome() {
  const list = workspaces.use().list
  const user = settings.use()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<{ bp: Blueprint; source: string; note?: string } | null>(null)
  const [message, setMessage] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const ask = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true); setProposal(null); setMessage('')
    try {
      const out = await plan(prompt, [])
      if (out.kind === 'blueprint' && out.blueprint) setProposal({ bp: out.blueprint, source: out.source, note: out.note })
      else if (out.kind === 'command') setMessage(`Questo comando serve dentro un workspace. ${HELP_TEXT}`)
      else setMessage(out.reply)
    } finally { setBusy(false) }
  }

  const join = () => {
    const t = joinCode.trim()
    const m = /\/join\/([A-Za-z0-9_-]+)/.exec(t) ?? /^([A-Za-z0-9_-]{10,})$/.exec(t)
    if (!m) { setMessage('Codice o link non valido.'); return }
    const n = /[?&]n=([^&]+)/.exec(t)
    navigate(`#/join/${m[1]}${n ? `?n=${n[1]}` : ''}`)
  }

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupFile
      if (data.format !== 'notion-clone-backup') throw new Error()
      const entry = addWorkspace(data.name, '📘')
      const session = getSession(entry.id)
      await importWorkspace(session, data)
      session.setWorkspaceInfo(data.name)
      navigate(workspaceHash(entry.id))
    } catch { setMessage('Il file non è un backup valido.') }
  }

  const fromTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!
    const today = toISO(new Date())
    const bp = t.build({ name: t.label.split(' / ')[0], date: addDays(today, 30), today })
    setProposal({ bp, source: 'local' })
  }

  return (
    <div className="welcome">
      <header className="welcome-top">
        <h1>📘 Notion Clone</h1>
        <p>Lavora da solo o insieme a un collega, anche dal telefono e anche senza internet.</p>
        <button className="btn" onClick={() => setShowSettings(true)}>⚙️ Impostazioni · {user.userName || 'imposta il tuo nome'}</button>
      </header>

      {list.length > 0 && (
        <section className="card-section">
          <h2>I tuoi workspace</h2>
          <div className="ws-grid">
            {list.map((w) => (
              <div key={w.id} className="ws-card">
                <button className="ws-open" onClick={() => navigate(workspaceHash(w.id))}><span className="ws-card-icon">{w.icon}</span><b>{w.name}</b></button>
                <button className="icon-btn" title="Rinomina" onClick={() => { const n = window.prompt('Nuovo nome', w.name); if (n?.trim()) { updateWorkspaceEntry(w.id, { name: n.trim() }); getSession(w.id).setWorkspaceInfo(n.trim()) } }}>✎</button>
                <button className="icon-btn danger" title="Rimuovi da questo dispositivo" onClick={() => { if (confirm(`Rimuovere “${w.name}” da questo dispositivo? I dati sul server restano, ma qui perderai l’accesso finché non riapri il link di invito.`)) removeWorkspaceEntry(w.id) }}>✕</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card-section assistant-box">
        <h2>🤖 Crea un progetto con l’assistente</h2>
        <p className="muted">Descrivi cosa devi organizzare (una serata, un progetto, un viaggio…). Funziona anche offline con i modelli integrati.</p>
        <textarea rows={3} value={prompt} placeholder="Es. Crea un progetto per organizzare una serata in discoteca sabato 17 ottobre con 200 invitati" onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask() }} />
        <div className="row">
          <button className="btn primary" disabled={busy || !prompt.trim()} onClick={ask}>{busy ? 'Sto pensando…' : 'Genera proposta'}</button>
        </div>
        <div className="template-chips">
          {TEMPLATES.map((t) => <button key={t.id} className="chip-btn" onClick={() => fromTemplate(t.id)}>{t.icon} {t.label}</button>)}
        </div>
        {message && <div className="msg-note"><Markdownish text={message} /></div>}
        {proposal && (
          <div className="proposal">
            <Markdownish text={proposal.bp.summary ?? ''} />
            {proposal.note && <div className="msg-note">{proposal.note}</div>}
            <BlueprintPreview bp={proposal.bp} />
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await createWorkspace(proposal.bp.title, proposal.bp.icon || '📘', proposal.bp) } finally { setBusy(false) } }}>
                Crea workspace “{proposal.bp.title}”
              </button>
              <button className="btn" onClick={() => setProposal(null)}>Annulla</button>
            </div>
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="card-section">
          <h2>Nuovo workspace vuoto</h2>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) createWorkspace(name.trim(), '📘') }}>
            <input value={name} placeholder="Nome (es. Serate 2026)" onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!name.trim()}>Crea</button>
          </form>
        </section>
        <section className="card-section">
          <h2>Unisciti a un collega</h2>
          <form className="row" onSubmit={(e) => { e.preventDefault(); join() }}>
            <input value={joinCode} placeholder="Incolla il link di invito" onChange={(e) => setJoinCode(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!joinCode.trim()}>Entra</button>
          </form>
          <div className="row"><button className="btn" onClick={() => fileRef.current?.click()}>⬆ Importa da backup…</button></div>
          <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
        </section>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  )
}
