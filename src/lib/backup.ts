import * as Y from 'yjs'
import type { WorkspaceSession } from '../sync/session'

const b64 = (u8: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export interface BackupFile {
  format: 'notion-clone-backup'
  version: 1
  name: string
  exportedAt: string
  meta: string
  docs: Record<string, string>
}

/** Esporta l'intero workspace (stato Yjs completo di ogni pagina) in un file JSON. */
export async function exportWorkspace(session: WorkspaceSession): Promise<BackupFile> {
  const docs: Record<string, string> = {}
  for (const p of session.pages.keys()) {
    docs[p] = await session.withDoc(p, (doc) => b64(Y.encodeStateAsUpdate(doc)))
  }
  return {
    format: 'notion-clone-backup', version: 1, name: session.workspaceName() || 'Workspace',
    exportedAt: new Date().toISOString(), meta: b64(Y.encodeStateAsUpdate(session.meta.doc)), docs,
  }
}

export async function importWorkspace(session: WorkspaceSession, file: BackupFile) {
  if (file.format !== 'notion-clone-backup') throw new Error('File di backup non valido')
  Y.applyUpdate(session.meta.doc, fromB64(file.meta))
  for (const [id, data] of Object.entries(file.docs)) {
    await session.withDoc(id, (doc) => Y.applyUpdate(doc, fromB64(data)))
  }
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
