// Test d'integrazione del server di sincronizzazione: sync tra due client, persistenza su disco, password.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const root = path.resolve(import.meta.dirname, '..')
const PORT = 3300 + Math.floor(Math.random() * 400)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-test-'))

function startServer(env = {}) {
  const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', ...env }, stdio: 'pipe' })
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (String(d).includes('in ascolto')) resolve(child) })
    child.on('error', reject)
    setTimeout(() => reject(new Error('server non avviato')), 8000)
  })
}
const stop = (child) => new Promise((r) => { child.once('exit', r); child.kill('SIGTERM') })

function client(room, params = {}) {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(`ws://127.0.0.1:${PORT}/sync`, room, doc, { WebSocketPolyfill: WebSocket, params, disableBc: true, maxBackoffTime: 500 })
  return { doc, provider }
}
function close(...clients) {
  for (const c of clients) { c.provider.destroy(); c.provider.awareness.destroy(); c.doc.destroy() }
}
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50) } return false }

test('due client si sincronizzano e il server salva su disco', async () => {
  let server = await startServer()
  const a = client('wtest__page1'); const b = client('wtest__page1')
  a.doc.getMap('m').set('titolo', 'Serata')
  a.doc.getText('t').insert(0, 'ciao')
  assert.ok(await until(() => b.doc.getMap('m').get('titolo') === 'Serata' && b.doc.getText('t').toString() === 'ciao'), 'B riceve gli aggiornamenti di A')
  b.doc.getText('t').insert(4, ' mondo')
  assert.ok(await until(() => a.doc.getText('t').toString() === 'ciao mondo'), 'A riceve gli aggiornamenti di B')
  // presenza (awareness)
  a.provider.awareness.setLocalStateField('user', { name: 'Alice' })
  assert.ok(await until(() => [...b.provider.awareness.getStates().values()].some((s) => s.user?.name === 'Alice')), 'B vede la presenza di A')
  close(a, b)
  await sleep(300)
  await stop(server) // flush su disco

  assert.ok(fs.existsSync(path.join(dataDir, 'wtest__page1.ydoc')), 'file salvato')
  server = await startServer()
  const c = client('wtest__page1')
  assert.ok(await until(() => c.doc.getText('t').toString() === 'ciao mondo'), 'dopo il riavvio i dati ci sono ancora')
  close(c)
  await stop(server)
})

test('un client offline che riconnette unisce le modifiche (merge senza conflitti)', async () => {
  const server = await startServer()
  const a = client('wtest__merge'); const b = client('wtest__merge')
  a.doc.getText('t').insert(0, 'base')
  assert.ok(await until(() => b.doc.getText('t').toString() === 'base'))
  b.provider.disconnect()
  a.doc.getText('t').insert(0, 'A:')
  b.doc.getText('t').insert(4, ':B') // modifica offline
  await sleep(200)
  b.provider.connect()
  assert.ok(await until(() => a.doc.getText('t').toString() === 'A:base:B' && b.doc.getText('t').toString() === 'A:base:B'), 'entrambe le modifiche presenti')
  close(a, b)
  await stop(server)
})

test('password: senza password la connessione è rifiutata, con password funziona', async () => {
  const server = await startServer({ APP_PASSWORD: 's3gr3ta' })
  const info = await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json()
  assert.equal(info.requiresPassword, true)
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'no' }) })).status, 401)
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/api/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 's3gr3ta' }) })).status, 200)
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/api/ai/blueprint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"x"}' })).status, 401)

  const bad = client('wtest__pw'); bad.doc.getText('t').insert(0, 'segreto')
  const good = client('wtest__pw', { password: 's3gr3ta' })
  assert.ok(await until(() => good.provider.wsconnected), 'con password si connette')
  await sleep(500)
  assert.equal(bad.provider.wsconnected, false, 'senza password non si connette')
  assert.equal(good.doc.getText('t').toString(), '', 'i dati del client non autorizzato non arrivano')
  close(bad, good)
  await stop(server)
})

test('nomi di room non validi vengono rifiutati e AI non configurata risponde 501', async () => {
  const server = await startServer()
  const evil = client('../../etc/passwd')
  await sleep(600)
  assert.equal(evil.provider.wsconnected, false)
  close(evil)
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/api/ai/blueprint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"x"}' })).status, 501)
  await stop(server)
  assert.ok(!fs.existsSync(path.join(dataDir, '..', 'passwd.ydoc')))
})

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
