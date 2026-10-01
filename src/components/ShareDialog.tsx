import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Dialog } from './Dialog'
import { getServerInfo, type ServerInfo } from '../ai/assistant'
import { exportWorkspace, downloadJSON } from '../lib/backup'
import type { WorkspaceSession } from '../sync/session'

export function ShareDialog({ session, name, onClose }: { session: WorkspaceSession; name: string; onClose: () => void }) {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [base, setBase] = useState(location.origin)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { getServerInfo(true).then(setInfo) }, [])

  const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname)
  const bases = [location.origin, ...(isLocal && info ? info.lan.map((ip) => `http://${ip}:${location.port || info.port}`) : [])]
  const link = `${base}/#/join/${session.id}?n=${encodeURIComponent(name)}`

  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setQr).catch(() => setQr('')) }, [link])

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { prompt('Copia il link:', link) }
  }

  return (
    <Dialog title="Condividi il workspace" onClose={onClose}>
      <p>Chi apre questo link entra nel workspace e vede le modifiche <b>in tempo reale</b>. Funziona sul telefono e sul computer.</p>
      {bases.length > 1 && (
        <label className="field">Indirizzo da usare
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            {bases.map((b) => <option key={b} value={b}>{b}{b === location.origin ? ' (questo computer)' : ' (stessa rete Wi-Fi)'}</option>)}
          </select>
        </label>
      )}
      <div className="share-link">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn primary" onClick={copy}>{copied ? 'Copiato ✓' : 'Copia'}</button>
        {'share' in navigator && <button className="btn" onClick={() => navigator.share({ title: name, url: link }).catch(() => {})}>Condividi…</button>}
      </div>
      {qr && <div className="qr"><img src={qr} alt="QR code del link" width={220} height={220} /><small>Inquadralo con il telefono</small></div>}
      <ul className="muted tips">
        {isLocal && <li>Stai usando <b>localhost</b>: il tuo collega può aprire il link solo se usa l’indirizzo di rete (menu sopra) e siete sulla stessa Wi-Fi, oppure se pubblichi l’app su un server (vedi README).</li>}
        {info?.requiresPassword && <li>Il server richiede una <b>password</b>: comunicala al collega separatamente (Impostazioni → Sincronizzazione).</li>}
        {!info && <li>Server non raggiungibile: la sincronizzazione riprenderà appena sarà di nuovo online.</li>}
        <li>Il link contiene la chiave di accesso del workspace: condividilo solo con persone fidate.</li>
      </ul>
      <button className="btn" onClick={async () => downloadJSON(await exportWorkspace(session), `${name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'workspace'}.backup.json`)}>⬇ Scarica backup completo</button>
    </Dialog>
  )
}
