import test from 'node:test'
import assert from 'node:assert/strict'
import { runFormula } from '../src/db/formula.ts'
import { parseCSV, toCSV } from '../src/db/csv.ts'

const props = { Prezzo: 12.5, Qty: 4, Nome: 'Vodka', Stato: 'Fatto', Data: '2026-10-10', Vuoto: null }
const ctx = { prop: (n) => props[n] ?? null }
const ev = (s) => { const r = runFormula(s, ctx); return 'error' in r ? `ERR:${r.error}` : r.value }

test('aritmetica e precedenza', () => {
  assert.equal(ev('1 + 2 * 3'), 7)
  assert.equal(ev('(1 + 2) * 3'), 9)
  assert.equal(ev('2 ^ 3 ^ 2'), 512)
  assert.equal(ev('-3 + 5'), 2)
  assert.equal(ev('10 % 4'), 2)
})
test('prop, if e confronti', () => {
  assert.equal(ev('prop("Prezzo") * prop("Qty")'), 50)
  assert.equal(ev('if(prop("Stato") == "Fatto", "✅", "⏳")'), '✅')
  assert.equal(ev('se(prop("Qty") > 10, "tanti", "pochi")'), 'pochi')
  assert.equal(ev('prop("Prezzo") >= 12.5 && prop("Qty") != 3'), true)
})
test('stringhe e funzioni', () => {
  assert.equal(ev('concat(prop("Nome"), " x", prop("Qty"))'), 'Vodka x4')
  assert.equal(ev('upper(prop("Nome"))'), 'VODKA')
  assert.equal(ev('"a" + "b"'), 'ab')
  assert.equal(ev('round(prop("Prezzo") / 3, 2)'), 4.17)
  assert.equal(ev('max(1, 9, 3) + min(4, 2)'), 11)
  assert.equal(ev('empty(prop("Vuoto"))'), true)
})
test('date', () => {
  assert.equal(ev('datediff("2026-10-10", "2026-10-03")'), 7)
  assert.equal(ev('addDays(prop("Data"), 5)'), '2026-10-15')
  assert.equal(ev('month(prop("Data"))'), 10)
})
test('errori gestiti senza eccezioni', () => {
  assert.match(ev('1 / 0'), /^ERR:/)
  assert.match(ev('foo(1)'), /^ERR:/)
  assert.match(ev('1 +'), /^ERR:/)
  assert.match(ev('prop("Nome") * 2'), /^ERR:/)
  assert.match(ev('process.exit()'), /^ERR:/)
})
test('CSV: quote, separatori e round-trip', () => {
  const rows = [['Nome', 'Nota'], ['Ana, Bo', 'dice "ciao"'], ['Linea\nDue', '']]
  assert.deepEqual(parseCSV(toCSV(rows)), rows)
  assert.deepEqual(parseCSV('a;b;c\r\n1;2;3\r\n'), [['a', 'b', 'c'], ['1', '2', '3']])
})
