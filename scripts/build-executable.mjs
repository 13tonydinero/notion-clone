#!/usr/bin/env node
// Crea un eseguibile autonomo (nessuna installazione di Node richiesta) con server + client + runtime Node.
//
//   npm run package                       # per il sistema su cui sei
//   npm run package -- --target win-x64   # cross-compilazione (scarica il runtime Node dal sito ufficiale)
//   npm run package -- --target all       # linux/macOS/windows
//
// Target: linux-x64 linux-arm64 darwin-x64 darwin-arm64 win-x64
// Tecnica: Node "Single Executable Application" (SEA) + postject.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { inject } from 'postject'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const flag = (name) => args.includes(`--${name}`)

const ALL = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win-x64']
const hostTarget = `${{ win32: 'win', darwin: 'darwin', linux: 'linux' }[process.platform]}-${process.arch}`
const wanted = opt('target') === 'all' ? ALL : (opt('target') ?? hostTarget).split(',')
for (const t of wanted) if (!ALL.includes(t)) { console.error(`Target sconosciuto: ${t}. Validi: ${ALL.join(', ')}`); process.exit(1) }

const buildDir = path.join(root, 'build')
const outDir = path.join(root, 'release')
fs.rmSync(buildDir, { recursive: true, force: true })
fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

const run = (cmd, a, o = {}) => execFileSync(cmd, a, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...o })
const step = (m) => console.log(`\n▶ ${m}`)

// 1. Client
if (!flag('skip-build')) { step('Compilo il client'); run('npm', ['run', 'build']) }
const dist = path.join(root, 'dist')
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('dist/ mancante: esegui "npm run build"'); process.exit(1) }

// 2. Server in un unico file CommonJS (SEA richiede uno script CJS)
step('Impacchetto il server')
await build({
  entryPoints: [path.join(root, 'server/index.js')],
  outfile: path.join(buildDir, 'server.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', minify: false, legalComments: 'none', logLevel: 'warning',
  external: ['bufferutil', 'utf-8-validate'], // dipendenze opzionali di "ws"
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
})

// 3. Client in un unico asset { "/percorso": "base64" }
step('Incorporo il client')
const bundle = {}
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else bundle['/' + path.relative(dist, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64')
  }
}
walk(dist)
fs.writeFileSync(path.join(buildDir, 'bundle.json'), JSON.stringify(bundle))
console.log(`  ${Object.keys(bundle).length} file`)

// 4. Blob SEA
step('Genero il blob SEA')
fs.writeFileSync(path.join(buildDir, 'sea-config.json'), JSON.stringify({
  main: 'build/server.cjs', output: 'build/sea-prep.blob', disableExperimentalSEAWarning: true, assets: { 'bundle.json': 'build/bundle.json' },
}))
run(process.execPath, ['--experimental-sea-config', 'build/sea-config.json'])
const blob = fs.readFileSync(path.join(buildDir, 'sea-prep.blob'))

// 5. Un eseguibile per ogni target
async function nodeBinaryFor(target) {
  if (target === hostTarget) return fs.readFileSync(process.execPath) // stesso sistema: usa il Node in esecuzione
  const v = process.version // il blob deve combaciare con la versione del runtime
  const [plat, arch] = target.split('-')
  const cache = path.join(os.tmpdir(), `nc-node-${v}-${target}`)
  if (fs.existsSync(cache)) return fs.readFileSync(cache)
  const get = async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`)
    return Buffer.from(await res.arrayBuffer())
  }
  let bin
  if (plat === 'win') bin = await get(`https://nodejs.org/dist/${v}/win-${arch}/node.exe`)
  else {
    const tgz = path.join(os.tmpdir(), `node-${v}-${target}.tar.gz`)
    fs.writeFileSync(tgz, await get(`https://nodejs.org/dist/${v}/node-${v}-${target}.tar.gz`))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-untar-'))
    execFileSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=2', `node-${v}-${target}/bin/node`])
    bin = fs.readFileSync(path.join(dir, 'node'))
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(tgz, { force: true })
  }
  fs.writeFileSync(cache, bin)
  return bin
}

/** Rimuove la firma Authenticode da un node.exe (diventerebbe invalida dopo l'iniezione e farebbe segnalare file "corrotto"). */
function stripPeSignature(buf) {
  const pe = buf.readUInt32LE(0x3c)
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') return buf
  const opt = pe + 24
  const dirs = opt + (buf.readUInt16LE(opt) === 0x20b ? 112 : 96) // PE32+ / PE32
  const certOffset = buf.readUInt32LE(dirs + 4 * 8)
  const certSize = buf.readUInt32LE(dirs + 4 * 8 + 4)
  if (!certOffset || !certSize) return buf
  buf.writeUInt32LE(0, dirs + 4 * 8); buf.writeUInt32LE(0, dirs + 4 * 8 + 4) // azzera la voce "Certificate Table"
  buf.writeUInt32LE(0, opt + 64) // checksum (facoltativo negli .exe)
  return certOffset + certSize === buf.length ? buf.subarray(0, certOffset) : buf
}

const results = []
for (const target of wanted) {
  step(`Eseguibile ${target}`)
  const [plat] = target.split('-')
  const outName = `notion-clone-${target}${plat === 'win' ? '.exe' : ''}`
  const outFile = path.join(outDir, outName)
  const base = await nodeBinaryFor(target)
  fs.writeFileSync(outFile, plat === 'win' ? stripPeSignature(Buffer.from(base)) : base, { mode: 0o755 })
  const isMac = plat === 'darwin'
  if (isMac && process.platform === 'darwin') run('codesign', ['--remove-signature', outFile])
  await inject(outFile, 'NODE_SEA_BLOB', blob, {
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(isMac ? { machoSegmentName: 'NODE_SEA' } : {}),
  })
  // Su macOS (Apple Silicon) il binario modificato va ri-firmato (firma "ad hoc") altrimenti il sistema lo blocca.
  if (isMac && process.platform === 'darwin') run('codesign', ['--sign', '-', outFile])
  fs.chmodSync(outFile, 0o755)
  results.push({ outName, size: fs.statSync(outFile).size, needsSign: isMac && process.platform !== 'darwin' })
}

fs.rmSync(buildDir, { recursive: true, force: true })
console.log('\n✔ Fatto. File in release/:')
for (const r of results) console.log(`  ${r.outName}  (${(r.size / 1048576).toFixed(0)} MB)${r.needsSign ? '   ← su Mac esegui prima: codesign --sign - ' + r.outName : ''}`)
