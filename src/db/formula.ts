// Mini linguaggio di formule per le colonne "formula" dei database.
// Esempi:  prop("Prezzo") * prop("Quantità")     if(prop("Stato") == "Fatto", "✅", "⏳")
// Nessun eval: tokenizer + parser a discesa ricorsiva.

export type FValue = number | string | boolean | null

export class FormulaError extends Error {}

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'lp' | 'rp' | 'comma'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      out.push({ t: 'num', v: src.slice(i, j) })
      i = j
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++
        s += src[j++]
      }
      if (j >= src.length) throw new FormulaError('Stringa non chiusa')
      out.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    if (/[\p{L}_]/u.test(c)) {
      let j = i
      while (j < src.length && /[\p{L}\p{N}_]/u.test(src[j])) j++
      out.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (['==', '!=', '<=', '>=', '&&', '||', '<>'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue }
    if ('+-*/%^<>=!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    if (c === '(') { out.push({ t: 'lp', v: c }); i++; continue }
    if (c === ')') { out.push({ t: 'rp', v: c }); i++; continue }
    if (c === ',' || c === ';') { out.push({ t: 'comma', v: c }); i++; continue }
    throw new FormulaError(`Carattere non valido: ${c}`)
  }
  return out
}

type Node =
  | { k: 'lit'; v: FValue }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }

function parse(src: string): Node {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const eat = () => toks[p++]
  const isOp = (...ops: string[]) => peek()?.t === 'op' && ops.includes(peek().v)

  function binary(next: () => Node, ...ops: string[]): Node {
    let left = next()
    while (isOp(...ops)) {
      const op = eat().v
      left = { k: 'bin', op, a: left, b: next() }
    }
    return left
  }
  const or = (): Node => binary(and, '||')
  const and = (): Node => binary(eq, '&&')
  const eq = (): Node => binary(rel, '==', '=', '!=', '<>')
  const rel = (): Node => binary(add, '<', '>', '<=', '>=')
  const add = (): Node => binary(mul, '+', '-')
  const mul = (): Node => binary(unary, '*', '/', '%')
  function unary(): Node {
    if (isOp('-', '!')) { const op = eat().v; return { k: 'un', op, a: unary() } }
    return pow()
  }
  function pow(): Node {
    const base = primary()
    if (isOp('^')) { eat(); return { k: 'bin', op: '^', a: base, b: unary() } }
    return base
  }
  function primary(): Node {
    const t = eat()
    if (!t) throw new FormulaError('Espressione incompleta')
    if (t.t === 'num') {
      const n = Number(t.v)
      if (Number.isNaN(n)) throw new FormulaError(`Numero non valido: ${t.v}`)
      return { k: 'lit', v: n }
    }
    if (t.t === 'str') return { k: 'lit', v: t.v }
    if (t.t === 'lp') {
      const e = or()
      if (eat()?.t !== 'rp') throw new FormulaError('Manca una parentesi chiusa')
      return e
    }
    if (t.t === 'id') {
      const lower = t.v.toLowerCase()
      if (peek()?.t === 'lp') {
        eat()
        const args: Node[] = []
        if (peek()?.t === 'rp') { eat(); return { k: 'call', name: lower, args } }
        for (;;) {
          args.push(or())
          const n = eat()
          if (n?.t === 'rp') break
          if (n?.t !== 'comma') throw new FormulaError('Attesa , o )')
        }
        return { k: 'call', name: lower, args }
      }
      if (lower === 'true' || lower === 'vero') return { k: 'lit', v: true }
      if (lower === 'false' || lower === 'falso') return { k: 'lit', v: false }
      throw new FormulaError(`Nome sconosciuto: ${t.v} (usa prop("Nome colonna"))`)
    }
    throw new FormulaError(`Simbolo inatteso: ${t.v}`)
  }

  const tree = or()
  if (p < toks.length) throw new FormulaError(`Simbolo inatteso: ${toks[p].v}`)
  return tree
}

const num = (v: FValue): number => {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v == null || v === '') return 0
  const n = Number(String(v).replace(',', '.'))
  if (Number.isNaN(n)) throw new FormulaError(`"${v}" non è un numero`)
  return n
}
const str = (v: FValue): string => (v == null ? '' : typeof v === 'number' ? String(Math.round(v * 1e10) / 1e10) : String(v))
const truthy = (v: FValue): boolean => (typeof v === 'string' ? v !== '' : Boolean(v))
const isNumeric = (v: FValue) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(',', '.'))))

const DAY = 86_400_000
function toDate(v: FValue): Date {
  if (v == null || v === '') throw new FormulaError('Data vuota')
  const d = new Date(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : String(v))
  if (Number.isNaN(d.getTime())) throw new FormulaError(`Data non valida: ${v}`)
  return d
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function compare(a: FValue, b: FValue): number {
  if (isNumeric(a) && isNumeric(b)) return num(a) - num(b)
  return str(a).localeCompare(str(b), 'it', { sensitivity: 'base' })
}

export interface FormulaContext {
  prop(name: string): FValue
}

function evaluate(n: Node, ctx: FormulaContext): FValue {
  switch (n.k) {
    case 'lit': return n.v
    case 'un': {
      const v = evaluate(n.a, ctx)
      return n.op === '-' ? -num(v) : !truthy(v)
    }
    case 'bin': {
      if (n.op === '&&') return truthy(evaluate(n.a, ctx)) && truthy(evaluate(n.b, ctx))
      if (n.op === '||') return truthy(evaluate(n.a, ctx)) || truthy(evaluate(n.b, ctx))
      const a = evaluate(n.a, ctx)
      const b = evaluate(n.b, ctx)
      switch (n.op) {
        case '+': return typeof a === 'string' && !isNumeric(a) || typeof b === 'string' && !isNumeric(b) ? str(a) + str(b) : num(a) + num(b)
        case '-': return num(a) - num(b)
        case '*': return num(a) * num(b)
        case '/': { const d = num(b); if (d === 0) throw new FormulaError('Divisione per zero'); return num(a) / d }
        case '%': return num(a) % num(b)
        case '^': return Math.pow(num(a), num(b))
        case '==': case '=': return compare(a, b) === 0
        case '!=': case '<>': return compare(a, b) !== 0
        case '<': return compare(a, b) < 0
        case '>': return compare(a, b) > 0
        case '<=': return compare(a, b) <= 0
        case '>=': return compare(a, b) >= 0
      }
      throw new FormulaError(`Operatore sconosciuto ${n.op}`)
    }
    case 'call': return callFn(n, ctx)
  }
}

function callFn(n: Extract<Node, { k: 'call' }>, ctx: FormulaContext): FValue {
  const { name, args } = n
  // `if` valuta solo il ramo scelto.
  if (name === 'if' || name === 'se') {
    if (args.length < 2) throw new FormulaError('if(condizione, allora, altrimenti)')
    return truthy(evaluate(args[0], ctx)) ? evaluate(args[1], ctx) : args[2] ? evaluate(args[2], ctx) : null
  }
  const v = args.map((a) => evaluate(a, ctx))
  const need = (min: number) => { if (v.length < min) throw new FormulaError(`${name}() richiede almeno ${min} argomenti`) }
  switch (name) {
    case 'prop': need(1); return ctx.prop(str(v[0]))
    case 'and': case 'e': return v.every(truthy)
    case 'or': case 'o': return v.some(truthy)
    case 'not': need(1); return !truthy(v[0])
    case 'round': case 'arrotonda': { need(1); const d = v[1] == null ? 0 : num(v[1]); const f = 10 ** d; return Math.round(num(v[0]) * f) / f }
    case 'floor': need(1); return Math.floor(num(v[0]))
    case 'ceil': need(1); return Math.ceil(num(v[0]))
    case 'abs': need(1); return Math.abs(num(v[0]))
    case 'sqrt': need(1); return Math.sqrt(num(v[0]))
    case 'min': need(1); return Math.min(...v.map(num))
    case 'max': need(1); return Math.max(...v.map(num))
    case 'sum': case 'somma': return v.reduce<number>((a, x) => a + num(x), 0)
    case 'avg': case 'media': need(1); return v.reduce<number>((a, x) => a + num(x), 0) / v.length
    case 'concat': return v.map(str).join('')
    case 'length': case 'len': need(1); return str(v[0]).length
    case 'upper': need(1); return str(v[0]).toUpperCase()
    case 'lower': need(1); return str(v[0]).toLowerCase()
    case 'contains': need(2); return str(v[0]).toLowerCase().includes(str(v[1]).toLowerCase())
    case 'replace': need(3); return str(v[0]).split(str(v[1])).join(str(v[2]))
    case 'tonumber': need(1); return num(v[0])
    case 'totext': need(1); return str(v[0])
    case 'empty': case 'vuoto': need(1); return v[0] == null || v[0] === '' || v[0] === false
    case 'now': case 'adesso': return new Date().toISOString()
    case 'today': case 'oggi': return iso(new Date())
    case 'year': case 'anno': need(1); return toDate(v[0]).getFullYear()
    case 'month': case 'mese': need(1); return toDate(v[0]).getMonth() + 1
    case 'day': case 'giorno': need(1); return toDate(v[0]).getDate()
    case 'adddays': case 'aggiungigiorni': need(2); return iso(new Date(toDate(v[0]).getTime() + num(v[1]) * DAY))
    case 'datediff': case 'datebetween': case 'differenzadate': {
      need(2)
      const unit = v[2] == null ? 'days' : str(v[2]).toLowerCase()
      const diff = (toDate(v[0]).getTime() - toDate(v[1]).getTime()) / DAY
      if (/^(week|settiman)/.test(unit)) return Math.trunc(diff / 7)
      if (/^(month|mes)/.test(unit)) return Math.trunc(diff / 30.4375)
      if (/^(year|ann)/.test(unit)) return Math.trunc(diff / 365.25)
      return Math.round(diff)
    }
  }
  throw new FormulaError(`Funzione sconosciuta: ${name}()`)
}

const cache = new Map<string, Node>()

export function parseFormula(src: string): Node {
  let tree = cache.get(src)
  if (!tree) {
    tree = parse(src)
    if (cache.size > 500) cache.clear()
    cache.set(src, tree)
  }
  return tree
}

/** Valuta una formula. Gli errori diventano `{ error }` invece di eccezioni. */
export function runFormula(src: string, ctx: FormulaContext): { value: FValue } | { error: string } {
  if (!src.trim()) return { value: null }
  try {
    return { value: evaluate(parseFormula(src), ctx) }
  } catch (e) {
    return { error: e instanceof FormulaError ? e.message : 'Errore' }
  }
}
