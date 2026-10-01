import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { WebSocketServer } from 'ws'
import { createYjsServer, ROOM_RE } from './yjs-server.js'
import { aiEnabled, generateBlueprint, AI_MODEL } from './ai.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, 'data'))
const DIST = path.join(root, 'dist')
/** Se impostata, tutti i client devono fornire questa password per sincronizzare e usare l'AI. */
const APP_PASSWORD = process.env.APP_PASSWORD || ''

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}
const authorized = (given) => !APP_PASSWORD || (given != null && safeEqual(given, APP_PASSWORD))

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

const lanAddresses = () =>
  Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)

app.get('/api/info', (_req, res) => {
  res.json({ name: 'notion-clone', requiresPassword: Boolean(APP_PASSWORD), ai: aiEnabled(), model: aiEnabled() ? AI_MODEL : null, lan: lanAddresses(), port: PORT })
})

app.post('/api/auth', (req, res) => {
  res.status(authorized(req.body?.password) ? 200 : 401).json({ ok: authorized(req.body?.password) })
})

// Limite semplice: 30 richieste AI / ora per IP.
const aiHits = new Map()
function aiRateLimit(req, res, next) {
  const key = req.ip
  const now = Date.now()
  const list = (aiHits.get(key) || []).filter((t) => now - t < 3_600_000)
  if (list.length >= 30) return res.status(429).json({ error: 'Troppe richieste, riprova più tardi.' })
  list.push(now)
  aiHits.set(key, list)
  next()
}

app.post('/api/ai/blueprint', aiRateLimit, async (req, res) => {
  if (!authorized(req.get('x-app-password'))) return res.status(401).json({ error: 'Password errata' })
  if (!aiEnabled()) return res.status(501).json({ error: 'AI non configurata sul server' })
  const prompt = req.body?.prompt
  if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ error: 'Richiesta vuota' })
  try {
    res.json(await generateBlueprint({ prompt, context: req.body?.context }))
  } catch (err) {
    console.error('[ai]', err?.message || err)
    res.status(502).json({ error: 'Generazione non riuscita' })
  }
})

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, {
    setHeaders(res, file) {
      if (file.endsWith('sw.js') || file.endsWith('.html') || file.endsWith('precache.json')) res.setHeader('Cache-Control', 'no-cache')
      else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    },
  }))
  app.get(/^\/(?!api\/|sync\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
} else {
  app.get('/', (_req, res) => res.type('text/plain').send('Client non compilato. Esegui "npm run build" oppure "npm run dev" (http://localhost:5173).'))
}

const server = http.createServer(app)
const yjs = createYjsServer({ dataDir: DATA_DIR })
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })

server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const match = url.pathname.match(/^\/sync\/([^/]+)$/)
    const room = match ? decodeURIComponent(match[1]) : null
    if (!room || !ROOM_RE.test(room)) return socket.destroy()
    if (!authorized(url.searchParams.get('password'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      return socket.destroy()
    }
    wss.handleUpgrade(req, socket, head, (ws) => yjs.handleConnection(ws, room))
  } catch {
    socket.destroy()
  }
})

const shutdown = () => { yjs.flushAll(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(PORT, HOST, () => {
  const lan = lanAddresses()
  console.log(`\n  Notion Clone in ascolto`)
  console.log(`  Locale:   http://localhost:${PORT}`)
  for (const ip of lan) console.log(`  Rete LAN: http://${ip}:${PORT}   (collega telefono e colleghi sulla stessa Wi-Fi)`)
  console.log(`  Dati:     ${DATA_DIR}`)
  console.log(`  Password: ${APP_PASSWORD ? 'attiva' : 'non impostata (imposta APP_PASSWORD se esponi il server su internet)'}`)
  console.log(`  AI:       ${aiEnabled() ? `Claude (${AI_MODEL})` : 'non configurata (assistente locale offline)'}\n`)
})
