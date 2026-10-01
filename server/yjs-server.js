// Server di sincronizzazione Yjs (protocollo y-websocket) con persistenza su file.
// Ogni "room" è un documento Yjs: <workspaceId>__meta oppure <workspaceId>__<pageId>.
import fs from 'node:fs'
import path from 'node:path'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const PING_INTERVAL = 30_000
const SAVE_DEBOUNCE = 800
const SAVE_MAX_WAIT = 5_000

export const ROOM_RE = /^[A-Za-z0-9_-]{1,160}$/

export function createYjsServer({ dataDir }) {
  fs.mkdirSync(dataDir, { recursive: true })
  /** @type {Map<string, SharedDoc>} */
  const docs = new Map()

  const fileFor = (name) => path.join(dataDir, `${name}.ydoc`)

  class SharedDoc extends Y.Doc {
    constructor(name) {
      super({ gc: true })
      this.name = name
      /** @type {Map<import('ws').WebSocket, Set<number>>} */
      this.conns = new Map()
      this.awareness = new awarenessProtocol.Awareness(this)
      this.awareness.setLocalState(null)
      this.saveTimer = null
      this.firstDirty = 0
      this.loaded = false

      this.awareness.on('update', ({ added, updated, removed }, conn) => {
        const changed = added.concat(updated, removed)
        if (conn !== null) {
          const ids = this.conns.get(conn)
          if (ids) {
            added.forEach((id) => ids.add(id))
            removed.forEach((id) => ids.delete(id))
          }
        }
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MESSAGE_AWARENESS)
        encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed))
        const buf = encoding.toUint8Array(enc)
        this.conns.forEach((_, c) => send(this, c, buf))
      })

      this.on('update', (update, origin) => {
        const enc = encoding.createEncoder()
        encoding.writeVarUint(enc, MESSAGE_SYNC)
        syncProtocol.writeUpdate(enc, update)
        const buf = encoding.toUint8Array(enc)
        this.conns.forEach((_, c) => send(this, c, buf))
        if (this.loaded) this.scheduleSave()
      })
    }

    scheduleSave() {
      const now = Date.now()
      if (!this.firstDirty) this.firstDirty = now
      clearTimeout(this.saveTimer)
      const wait = Math.min(SAVE_DEBOUNCE, Math.max(0, this.firstDirty + SAVE_MAX_WAIT - now))
      this.saveTimer = setTimeout(() => this.save(), wait)
    }

    save() {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      this.firstDirty = 0
      const file = fileFor(this.name)
      const tmp = `${file}.tmp`
      try {
        fs.writeFileSync(tmp, Y.encodeStateAsUpdate(this))
        fs.renameSync(tmp, file)
      } catch (err) {
        console.error(`[persist] errore salvando ${this.name}:`, err)
      }
    }
  }

  function loadFromDisk(doc) {
    const file = fileFor(doc.name)
    if (fs.existsSync(file)) {
      try {
        Y.applyUpdate(doc, new Uint8Array(fs.readFileSync(file)))
      } catch (err) {
        console.error(`[persist] file corrotto ${file}:`, err)
      }
    }
    doc.loaded = true
  }

  function getDoc(name) {
    let doc = docs.get(name)
    if (!doc) {
      doc = new SharedDoc(name)
      loadFromDisk(doc)
      docs.set(name, doc)
    }
    return doc
  }

  function send(doc, conn, message) {
    if (conn.readyState !== 1) {
      closeConn(doc, conn)
      return
    }
    try {
      conn.send(message, (err) => err && closeConn(doc, conn))
    } catch {
      closeConn(doc, conn)
    }
  }

  function closeConn(doc, conn) {
    const ids = doc.conns.get(conn)
    if (ids) {
      doc.conns.delete(conn)
      awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(ids), null)
      if (doc.conns.size === 0) {
        // Nessun client: salva e libera la memoria.
        if (doc.saveTimer || doc.firstDirty) doc.save()
        else if (!fs.existsSync(fileFor(doc.name))) doc.save()
        doc.awareness.destroy()
        doc.destroy()
        docs.delete(doc.name)
      }
    }
    try { conn.close() } catch { /* già chiusa */ }
  }

  function onMessage(doc, conn, message) {
    try {
      const enc = encoding.createEncoder()
      const dec = decoding.createDecoder(message)
      const type = decoding.readVarUint(dec)
      switch (type) {
        case MESSAGE_SYNC:
          encoding.writeVarUint(enc, MESSAGE_SYNC)
          syncProtocol.readSyncMessage(dec, enc, doc, conn)
          if (encoding.length(enc) > 1) send(doc, conn, encoding.toUint8Array(enc))
          break
        case MESSAGE_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(dec), conn)
          break
      }
    } catch (err) {
      console.error('[ws] messaggio non valido:', err?.message)
    }
  }

  /** Collega un WebSocket già accettato alla room indicata. */
  function handleConnection(conn, roomName) {
    conn.binaryType = 'arraybuffer'
    const doc = getDoc(roomName)
    doc.conns.set(conn, new Set())
    conn.on('message', (data) => onMessage(doc, conn, new Uint8Array(data)))

    let alive = true
    const pinger = setInterval(() => {
      if (!alive) {
        if (doc.conns.has(conn)) closeConn(doc, conn)
        clearInterval(pinger)
        return
      }
      alive = false
      try { conn.ping() } catch { closeConn(doc, conn) }
    }, PING_INTERVAL)
    conn.on('close', () => {
      closeConn(doc, conn)
      clearInterval(pinger)
    })
    conn.on('error', () => closeConn(doc, conn))
    conn.on('pong', () => { alive = true })

    // Step 1 della sincronizzazione + stato di awareness corrente.
    {
      const enc = encoding.createEncoder()
      encoding.writeVarUint(enc, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(enc, doc)
      send(doc, conn, encoding.toUint8Array(enc))
      const states = doc.awareness.getStates()
      if (states.size > 0) {
        const e2 = encoding.createEncoder()
        encoding.writeVarUint(e2, MESSAGE_AWARENESS)
        encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(states.keys())))
        send(doc, conn, encoding.toUint8Array(e2))
      }
    }
  }

  function flushAll() {
    for (const doc of docs.values()) if (doc.loaded && (doc.saveTimer || doc.firstDirty)) doc.save()
  }

  return { handleConnection, flushAll, get openDocs() { return docs.size } }
}
