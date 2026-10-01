// Generazione di un "blueprint" (struttura di workspace) tramite Claude.
// Opzionale: se ANTHROPIC_API_KEY non è impostata, il client usa il motore locale offline.
import Anthropic from '@anthropic-ai/sdk'

export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5-5'
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)

let client = null
const getClient = () => (client ??= new Anthropic())

const COLUMN_TYPES = ['text', 'number', 'select', 'multiselect', 'status', 'date', 'checkbox', 'url', 'email', 'phone', 'formula']

const SYSTEM = `Sei l'assistente di un'app di gestione stile Notion. Il tuo compito è progettare un ambiente di lavoro (workspace) per il progetto descritto dall'utente.
Rispondi SOLO con un oggetto JSON valido (nessun testo prima o dopo, nessun blocco markdown) con questa forma:

{
  "summary": "frase breve che descrive cosa crei",
  "title": "nome del progetto",
  "icon": "emoji",
  "pages": [Page]
}

Page = {
  "title": string, "icon": emoji,
  "blocks": [Block],            // contenuto della pagina (opzionale)
  "database": Database,         // se presente la pagina è un database a schermo intero (opzionale)
  "children": [Page]            // sotto-pagine (opzionale)
}
Block =
  {"type":"heading","level":1|2|3,"text":string}
 |{"type":"paragraph","text":string}
 |{"type":"bullets","items":[string]} |{"type":"numbered","items":[string]}
 |{"type":"todo","items":[{"text":string,"checked":boolean}]}
 |{"type":"callout","icon":emoji,"text":string} |{"type":"quote","text":string} |{"type":"divider"}
 |{"type":"table","rows":[[string]]}   // la prima riga è l'intestazione
 |{"type":"database","database":Database} // database incorporato nella pagina
Database = {
  "title": string, "icon": emoji,
  "columns": [{"name":string,"type":"${COLUMN_TYPES.join('|')}","options":[string]}],  // la prima colonna è il titolo (type text); options solo per select/multiselect/status
  "rows": [{"<nome colonna>": valore}],   // number -> numero, checkbox -> boolean, date -> "YYYY-MM-DD", multiselect -> [string], select/status -> una delle options
  "views": [{"type":"table|board|calendar","name":string,"groupBy":"<colonna select/status>","dateColumn":"<colonna date>"}]
}
Per le colonne formula aggiungi "formula": espressione come prop("Prezzo") * prop("Quantità").

Regole: scrivi in italiano (a meno che l'utente scriva in un'altra lingua); crea 3-7 pagine/database realistici e utili, con 4-10 righe di esempio sensate nei database; usa una pagina "Panoramica" iniziale con obiettivi e prossimi passi; mantieni le date coerenti con la data odierna fornita; non inventare dati personali reali.`

function extractJson(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('Risposta non valida')
  return JSON.parse(text.slice(start, end + 1))
}

export async function generateBlueprint({ prompt, context }) {
  const today = new Date().toISOString().slice(0, 10)
  const ctx = context?.pages?.length
    ? `\nPagine già presenti nel workspace: ${context.pages.slice(0, 40).join(', ')}.`
    : ''
  const response = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: `Data odierna: ${today}.${ctx}\n\nRichiesta dell'utente:\n${String(prompt).slice(0, 4000)}` }],
  })
  if (response.stop_reason === 'refusal') throw new Error('La richiesta è stata rifiutata dal modello')
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  return extractJson(text)
}
