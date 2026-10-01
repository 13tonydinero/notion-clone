import { useState } from 'react'
import { Dialog } from './Dialog'
import { settings, applyTheme, httpBase, USER_COLORS } from '../lib/settings'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = settings.use()
  const [serverUrl, setServerUrl] = useState(s.serverUrl)
  const [password, setPassword] = useState(s.password)
  const [syncEnabled, setSync] = useState(s.syncEnabled)
  const connChanged = serverUrl !== s.serverUrl || password !== s.password || syncEnabled !== s.syncEnabled

  const [error, setError] = useState('')
  const save = async () => {
    setError('')
    if (syncEnabled) {
      // Controlla subito indirizzo e password, così l'errore è chiaro invece di un generico "offline".
      try {
        const base = httpBase({ ...s, serverUrl: serverUrl.trim() })
        const info = await (await fetch(`${base}/api/info`)).json()
        if (info.requiresPassword) {
          const res = await fetch(`${base}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
          if (!res.ok) { setError('Password del server errata.'); return }
        }
      } catch {
        if (serverUrl.trim() && !confirm('Il server non risponde. Salvare comunque? Continuerai a lavorare in locale e la sincronizzazione ripartirà quando sarà raggiungibile.')) return
      }
    }
    settings.set({ serverUrl: serverUrl.trim(), password, syncEnabled })
    location.reload()
  }

  return (
    <Dialog title="Impostazioni" onClose={onClose}>
      <section className="form-section">
        <h3>Il tuo profilo</h3>
        <p className="muted">Nome e colore sono visibili ai colleghi quando lavorate nello stesso blocco.</p>
        <label className="field">Nome
          <input value={s.userName} placeholder="Come ti chiami?" maxLength={30} onChange={(e) => settings.set({ userName: e.target.value })} />
        </label>
        <div className="field">Colore
          <div className="swatches">
            {USER_COLORS.map((c) => (
              <button key={c} className={`swatch ${c === s.userColor ? 'on' : ''}`} style={{ background: c }} aria-label={`Colore ${c}`} onClick={() => settings.set({ userColor: c })} />
            ))}
          </div>
        </div>
        <label className="field">Tema
          <select value={s.theme} onChange={(e) => { settings.set({ theme: e.target.value as typeof s.theme }); applyTheme(e.target.value as typeof s.theme) }}>
            <option value="auto">Automatico</option><option value="light">Chiaro</option><option value="dark">Scuro</option>
          </select>
        </label>
        <p className="muted">Il nome/colore si applica ai documenti aperti dopo il salvataggio dei dati qui sotto o al prossimo caricamento.</p>
      </section>

      <section className="form-section">
        <h3>Sincronizzazione</h3>
        <label className="check"><input type="checkbox" checked={syncEnabled} onChange={(e) => setSync(e.target.checked)} /> Sincronizza con il server (disattiva per lavorare solo in locale)</label>
        <label className="field">Indirizzo del server
          <input value={serverUrl} placeholder={`Vuoto = ${location.origin}`} onChange={(e) => setServerUrl(e.target.value)} />
        </label>
        <label className="field">Password del server (se impostata)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </label>
        {error && <div className="banner warn">{error}</div>}
        <button className="btn primary" disabled={!connChanged} onClick={save}>Salva e riconnetti</button>
        <p className="muted">Tutto viene comunque salvato su questo dispositivo: se la connessione cade, continui a lavorare e le modifiche si uniscono automaticamente al ritorno online.</p>
      </section>
    </Dialog>
  )
}
