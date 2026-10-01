import test from 'node:test'
import assert from 'node:assert/strict'
import { findDate } from '../src/ai/dates.ts'
import { sanitizeBlueprint, countBlueprint } from '../src/ai/blueprint.ts'

// Il motore usa import senza estensione: lo carichiamo tramite un loader leggero.
const TODAY = '2026-10-01' // giovedì

test('date in italiano', () => {
  assert.equal(findDate('serata sabato', TODAY).iso, '2026-10-03')
  assert.equal(findDate('serata il 12 ottobre', TODAY).iso, '2026-10-12')
  assert.equal(findDate('entro 12/10/2026', TODAY).iso, '2026-10-12')
  assert.equal(findDate('il 5/9', TODAY).iso, '2027-09-05')
  assert.equal(findDate('domani', TODAY).iso, '2026-10-02')
  assert.equal(findDate('tra 2 settimane', TODAY).iso, '2026-10-15')
  assert.equal(findDate('niente date qui', TODAY), null)
})

test('sanitizeBlueprint scarta input non validi e limita i dati', () => {
  assert.equal(sanitizeBlueprint(null), null)
  assert.equal(sanitizeBlueprint({ title: 'x', pages: [] }), null)
  const bp = sanitizeBlueprint({
    title: 'Evento', pages: [
      { title: 'Task', database: { title: 'T', columns: [{ name: 'Nome', type: 'boh' }, { name: 'Stato', type: 'status' }], rows: [{ Nome: 'a', Stato: 'Fatto' }, 'spazzatura'] } },
      { title: 'Note', blocks: [{ type: 'heading', level: 9, text: 'Ciao' }, { type: 'script', x: 1 }, { type: 'todo', items: ['uno', { text: 'due', checked: true }] }] },
      { nope: true },
    ],
  })
  assert.ok(bp)
  assert.equal(bp.pages.length, 2)
  assert.equal(bp.pages[0].database.columns[0].type, 'text')
  assert.equal(bp.pages[0].database.rows.length, 1)
  assert.equal(bp.pages[1].blocks.length, 2)
  assert.equal(bp.pages[1].blocks[0].level, 2)
  assert.deepEqual(countBlueprint(bp), { pages: 1, databases: 1, rows: 1 })
})

import { planLocal, parseCommand, extractParams, pickTemplate } from '../src/ai/localEngine.ts'

test('assistente locale: serata con data e invitati', () => {
  const r = planLocal('Crea un progetto per organizzare una serata in discoteca sabato 17 ottobre con 200 invitati', TODAY)
  assert.equal(r.kind, 'blueprint')
  assert.equal(r.template, 'evento')
  assert.equal(r.blueprint.title, 'Serata in discoteca')
  const names = r.blueprint.pages.map((p) => p.title)
  for (const n of ['Panoramica', 'Task', 'Lista invitati', 'Budget', 'Fornitori']) assert.ok(names.includes(n), n)
  const panoramica = JSON.stringify(r.blueprint.pages[0])
  assert.ok(panoramica.includes('200'), 'ospiti nel testo')
  assert.ok(!panoramica.includes('Sabato 17 ottobre"'), 'il luogo non deve contenere la data')
  const task = r.blueprint.pages.find((p) => p.title === 'Task').database
  assert.ok(task.rows.every((row) => row.Scadenza >= TODAY && row.Scadenza <= '2026-10-17'), 'scadenze tra oggi e la data evento')
})

test('assistente locale: modelli diversi e nome tra virgolette', () => {
  assert.equal(planLocal('voglio gestire lo sviluppo di una app per ordinare cibo', TODAY).template, 'progetto')
  assert.equal(planLocal('organizza un viaggio a Lisbona tra 2 mesi', TODAY).template, 'viaggio')
  assert.equal(planLocal('ho bisogno di un crm per i clienti', TODAY).template, 'crm')
  const r = planLocal('crea un evento chiamato "Neon Night" per sabato', TODAY)
  assert.equal(r.blueprint.title, 'Neon Night')
  assert.equal(planLocal('ciao', TODAY).kind, 'clarify')
})

test('assistente locale: luogo solo se nominato', () => {
  const p = extractParams('serata al club Aria sabato', TODAY, pickTemplate('serata'))
  assert.equal(p.place, 'Aria')
  assert.equal(extractParams('serata in discoteca sabato', TODAY, pickTemplate('serata')).place, undefined)
})

test('assistente locale: comandi rapidi', () => {
  assert.deepEqual(parseCommand('Aggiungi pagina Idee per il tema', TODAY), { kind: 'addPage', title: 'Idee per il tema' })
  const a = parseCommand('Aggiungi task: preparare la locandina entro venerdì', TODAY)
  assert.equal(a.kind, 'addRow')
  assert.equal(a.title, 'Preparare la locandina')
  assert.equal(a.date, '2026-10-02')
  const b = parseCommand('Aggiungi invitato: Marco Rossi', TODAY)
  assert.equal(b.target, 'invitato')
  assert.equal(b.title, 'Marco Rossi')
  const c = parseCommand('aggiungi spesa: noleggio luci in Budget', TODAY)
  assert.equal(c.target, 'Budget')
  assert.equal(c.title, 'Noleggio luci')
  assert.equal(parseCommand('aiuto', TODAY).kind, 'help')
})
