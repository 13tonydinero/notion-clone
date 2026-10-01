import type { Blueprint, BPDatabase, BPPage } from './blueprint'
import { addDays } from './dates'

export interface TemplateParams {
  name: string
  /** Data dell'evento / scadenza principale (ISO). */
  date: string
  today: string
  place?: string
  guests?: number
  budget?: number
}

export interface Template {
  id: string
  label: string
  icon: string
  keywords: string[]
  build: (p: TemplateParams) => Blueprint
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Data relativa all'evento (offset negativo = prima). Se l'evento è vicino, le scadenze vengono compresse tra oggi e l'evento. */
const dueIn = (p: TemplateParams, offset: number) => {
  const span = daysBetween(p.today, p.date)
  if (span <= 0) return p.date
  const scaled = span >= 30 || offset >= 0 ? offset : Math.round((offset * span) / 30)
  return addDays(p.date, scaled)
}
const clampFuture = (p: TemplateParams, iso: string) => (iso < p.today ? p.today : iso)

const taskDb = (p: TemplateParams, tasks: [string, string, string, number, string][]): BPDatabase => ({
  title: 'Task', icon: '✅',
  columns: [
    { name: 'Attività', type: 'text' },
    { name: 'Stato', type: 'status', options: ['Da fare', 'In corso', 'Fatto'] },
    { name: 'Responsabile', type: 'select', options: ['Io', 'Collega'] },
    { name: 'Scadenza', type: 'date' },
    { name: 'Priorità', type: 'select', options: ['Alta', 'Media', 'Bassa'] },
  ],
  rows: tasks.map(([a, stato, resp, off, prio]) => ({ Attività: a, Stato: stato, Responsabile: resp, Scadenza: clampFuture(p, dueIn(p, off)), Priorità: prio })),
  views: [{ type: 'board', name: 'Board', groupBy: 'Stato' }, { type: 'table', name: 'Tabella', sortBy: 'Scadenza' }, { type: 'calendar', name: 'Calendario', dateColumn: 'Scadenza' }],
})

const budgetDb = (rows: [string, string, number, number, boolean, string][], title = 'Budget', categories?: string[]): BPDatabase => ({
  title, icon: '💶',
  columns: [
    { name: 'Voce', type: 'text' },
    { name: 'Categoria', type: 'select', options: categories },
    { name: 'Quantità', type: 'number' },
    { name: 'Prezzo unitario', type: 'number', format: 'euro' },
    { name: 'Totale', type: 'formula', formula: 'prop("Quantità") * prop("Prezzo unitario")', format: 'euro' },
    { name: 'Pagato', type: 'checkbox' },
    { name: 'Fornitore', type: 'text' },
  ],
  rows: rows.map(([v, c, q, pr, paid, f]) => ({ Voce: v, Categoria: c, Quantità: q, 'Prezzo unitario': pr, Pagato: paid, Fornitore: f })),
  views: [{ type: 'table', name: 'Tabella', summaries: { Totale: 'sum', Pagato: 'percent_checked', Quantità: 'sum' } }],
})

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// ---------------------------------------------------------------------------------------------
const evento: Template = {
  id: 'evento', label: 'Evento / Serata', icon: '🎉',
  keywords: ['serata', 'evento', 'festa', 'party', 'discoteca', 'club', 'locale', 'dj', 'concerto', 'compleanno', 'matrimonio', 'cena', 'aperitivo', 'inaugurazione', 'live', 'eventi'],
  build: (p) => ({
    title: p.name, icon: '🎉',
    summary: `Ambiente completo per organizzare "${p.name}" il ${dateLabel(p.date)}: panoramica, task, invitati, budget, fornitori, scaletta e promozione.`,
    pages: [
      {
        title: 'Panoramica', icon: '🏠',
        blocks: [
          { type: 'callout', icon: '🎉', text: `${p.name} — ${dateLabel(p.date)}${p.place ? ` — ${p.place}` : ''}` },
          { type: 'heading', level: 2, text: 'Obiettivi' },
          { type: 'bullets', items: [p.guests ? `Raggiungere ${p.guests} presenze` : 'Definire il numero di presenze atteso', p.budget ? `Restare entro il budget di ${p.budget} €` : 'Definire il budget massimo', 'Serata sicura, fluida e divertente per tutti'] },
          { type: 'heading', level: 2, text: 'Dettagli' },
          { type: 'table', rows: [['Voce', 'Dettaglio'], ['Data', dateLabel(p.date)], ['Luogo', p.place ?? 'Da definire'], ['Ospiti attesi', p.guests ? String(p.guests) : 'Da definire'], ['Budget', p.budget ? `${p.budget} €` : 'Da definire'], ['Referenti', 'Io + collega']] },
          { type: 'heading', level: 2, text: 'Checklist rapida' },
          { type: 'todo', items: [{ text: 'Confermare location e data' }, { text: 'Chiudere DJ / intrattenimento' }, { text: 'Aprire la lista invitati e inviare gli inviti' }, { text: 'Definire budget e fornitori' }, { text: 'Pubblicare la promozione' }] },
          { type: 'heading', level: 2, text: 'Note del giorno stesso' },
          { type: 'paragraph', text: 'Orari di arrivo staff, contatti di emergenza, accessi, permessi e tutto ciò che serve la sera dell\'evento.' },
        ],
      },
      { title: 'Task', icon: '✅', database: taskDb(p, [
        ['Confermare location', 'In corso', 'Io', -30, 'Alta'], ['Chiudere DJ / musica', 'Da fare', 'Collega', -28, 'Alta'], ['Preparare lista invitati', 'Da fare', 'Io', -21, 'Alta'],
        ['Definire budget e preventivi', 'Da fare', 'Collega', -21, 'Alta'], ['Grafica e locandina', 'Da fare', 'Collega', -18, 'Media'], ['Pubblicare promozione sui social', 'Da fare', 'Io', -14, 'Media'],
        ['Ordinare bevande e forniture', 'Da fare', 'Io', -7, 'Media'], ['Briefing con lo staff', 'Da fare', 'Collega', -3, 'Media'], ['Controllo finale audio/luci', 'Da fare', 'Collega', -1, 'Alta'], ['Giorno dell\'evento', 'Da fare', 'Io', 0, 'Alta'],
      ]) },
      { title: 'Lista invitati', icon: '👥', database: {
        title: 'Lista invitati', icon: '👥',
        columns: [
          { name: 'Nome', type: 'text' }, { name: 'RSVP', type: 'select', options: ['Invitato', 'Confermato', 'Forse', 'Rifiutato'] },
          { name: '+ Accompagnatori', type: 'number' }, { name: 'Telefono', type: 'phone' }, { name: 'Tavolo', type: 'text' }, { name: 'Ingresso', type: 'checkbox' }, { name: 'Note', type: 'text' },
        ],
        rows: [
          { Nome: 'Ospite esempio 1', RSVP: 'Confermato', '+ Accompagnatori': 2, Tavolo: 'A1' }, { Nome: 'Ospite esempio 2', RSVP: 'Invitato', '+ Accompagnatori': 0 },
          { Nome: 'Ospite esempio 3', RSVP: 'Forse', '+ Accompagnatori': 1, Note: 'Vegetariano' }, { Nome: 'Ospite esempio 4', RSVP: 'Rifiutato', '+ Accompagnatori': 0 },
        ],
        views: [{ type: 'table', name: 'Tabella', summaries: { Nome: 'count', '+ Accompagnatori': 'sum', Ingresso: 'checked' } }, { type: 'board', name: 'Per RSVP', groupBy: 'RSVP' }],
      } },
      { title: 'Budget', icon: '💶', database: budgetDb([
        ['Affitto location', 'Location', 1, 800, false, ''], ['DJ set', 'Musica', 1, 400, false, ''], ['Service audio/luci', 'Musica', 1, 350, false, ''],
        ['Bevande', 'Bevande', 1, 600, false, ''], ['Sicurezza / staff', 'Staff', 3, 90, false, ''], ['Grafica e promozione', 'Marketing', 1, 150, true, ''], ['SIAE / permessi', 'Permessi', 1, 120, false, ''],
      ], 'Budget', ['Location', 'Musica', 'Bevande', 'Staff', 'Marketing', 'Permessi', 'Altro']) },
      { title: 'Fornitori', icon: '🤝', database: {
        title: 'Fornitori', icon: '🤝',
        columns: [
          { name: 'Fornitore', type: 'text' }, { name: 'Servizio', type: 'select', options: ['Location', 'DJ', 'Audio/Luci', 'Bevande', 'Sicurezza', 'Foto/Video', 'Altro'] },
          { name: 'Stato', type: 'status', options: ['Da contattare', 'Preventivo ricevuto', 'Confermato'] }, { name: 'Contatto', type: 'phone' }, { name: 'Email', type: 'email' }, { name: 'Preventivo', type: 'number', format: 'euro' },
        ],
        rows: [{ Fornitore: 'Location (da definire)', Servizio: 'Location', Stato: 'Da contattare' }, { Fornitore: 'DJ (da definire)', Servizio: 'DJ', Stato: 'Da contattare' }, { Fornitore: 'Service audio/luci', Servizio: 'Audio/Luci', Stato: 'Da contattare' }],
        views: [{ type: 'table', name: 'Tabella', summaries: { Preventivo: 'sum' } }, { type: 'board', name: 'Per stato', groupBy: 'Stato' }],
      } },
      { title: 'Scaletta serata', icon: '🎧', database: {
        title: 'Scaletta serata', icon: '🎧',
        columns: [{ name: 'Attività', type: 'text' }, { name: 'Orario', type: 'text' }, { name: 'Responsabile', type: 'select', options: ['Io', 'Collega', 'DJ', 'Staff'] }, { name: 'Note', type: 'text' }],
        rows: [
          { Attività: 'Arrivo staff e allestimento', Orario: '18:00', Responsabile: 'Staff' }, { Attività: 'Soundcheck', Orario: '20:00', Responsabile: 'DJ' }, { Attività: 'Apertura porte', Orario: '22:00', Responsabile: 'Io' },
          { Attività: 'Inizio set principale', Orario: '23:30', Responsabile: 'DJ' }, { Attività: 'Chiusura', Orario: '04:00', Responsabile: 'Collega' },
        ],
        views: [{ type: 'table', name: 'Tabella', sortBy: 'Orario' }],
      } },
      { title: 'Promozione', icon: '📣', database: {
        title: 'Promozione', icon: '📣',
        columns: [{ name: 'Contenuto', type: 'text' }, { name: 'Canale', type: 'select', options: ['Instagram', 'WhatsApp', 'Locandine', 'Passaparola'] }, { name: 'Data', type: 'date' }, { name: 'Stato', type: 'status', options: ['Da fare', 'In corso', 'Fatto'] }],
        rows: [
          { Contenuto: 'Annuncio evento', Canale: 'Instagram', Data: clampFuture(p, dueIn(p, -14)), Stato: 'Da fare' }, { Contenuto: 'Messaggio ai contatti', Canale: 'WhatsApp', Data: clampFuture(p, dueIn(p, -10)), Stato: 'Da fare' },
          { Contenuto: 'Reminder “ultimi posti”', Canale: 'Instagram', Data: clampFuture(p, dueIn(p, -3)), Stato: 'Da fare' }, { Contenuto: 'Stories del giorno', Canale: 'Instagram', Data: p.date, Stato: 'Da fare' },
        ],
        views: [{ type: 'calendar', name: 'Calendario', dateColumn: 'Data' }, { type: 'table', name: 'Tabella' }],
      } },
      { title: 'Note riunioni', icon: '📝', blocks: [{ type: 'heading', level: 2, text: 'Prossima riunione' }, { type: 'bullets', items: ['Aggiornamento task', 'Stato invitati', 'Budget'] }, { type: 'heading', level: 2, text: 'Decisioni prese' }, { type: 'paragraph', text: '' }] },
    ],
  }),
}

const progetto: Template = {
  id: 'progetto', label: 'Progetto / Sviluppo', icon: '🚀',
  keywords: ['progetto', 'software', 'app', 'sito', 'sviluppo', 'startup', 'prodotto', 'sprint', 'roadmap', 'web', 'applicazione', 'lancio', 'team'],
  build: (p) => ({
    title: p.name, icon: '🚀',
    summary: `Ambiente di progetto per "${p.name}": panoramica, roadmap, task su board, bug tracker e documentazione.`,
    pages: [
      { title: 'Panoramica', icon: '🏠', blocks: [
        { type: 'callout', icon: '🎯', text: `Obiettivo: ${p.name}. Scadenza principale ${dateLabel(p.date)}.` },
        { type: 'heading', level: 2, text: 'Visione' }, { type: 'paragraph', text: 'Descrivi qui problema, utenti e risultato atteso.' },
        { type: 'heading', level: 2, text: 'Milestone' }, { type: 'todo', items: [{ text: 'Requisiti definiti' }, { text: 'Prototipo' }, { text: 'Prima versione utilizzabile' }, { text: 'Lancio' }] },
        { type: 'heading', level: 2, text: 'Team' }, { type: 'table', rows: [['Persona', 'Ruolo'], ['Io', 'Responsabile'], ['Collega', 'Sviluppo']] },
      ] },
      { title: 'Roadmap', icon: '🗺️', database: {
        title: 'Roadmap', icon: '🗺️',
        columns: [{ name: 'Funzionalità', type: 'text' }, { name: 'Stato', type: 'status', options: ['Da fare', 'In corso', 'Fatto'] }, { name: 'Trimestre', type: 'select', options: ['Q1', 'Q2', 'Q3', 'Q4'] }, { name: 'Impatto', type: 'select', options: ['Alto', 'Medio', 'Basso'] }, { name: 'Scadenza', type: 'date' }],
        rows: [{ Funzionalità: 'Prototipo navigabile', Stato: 'In corso', Trimestre: 'Q1', Impatto: 'Alto', Scadenza: clampFuture(p, dueIn(p, -45)) }, { Funzionalità: 'MVP', Stato: 'Da fare', Trimestre: 'Q1', Impatto: 'Alto', Scadenza: clampFuture(p, dueIn(p, -14)) }, { Funzionalità: 'Lancio pubblico', Stato: 'Da fare', Trimestre: 'Q2', Impatto: 'Alto', Scadenza: p.date }],
        views: [{ type: 'board', name: 'Board', groupBy: 'Stato' }, { type: 'table', name: 'Tabella', sortBy: 'Scadenza' }, { type: 'calendar', name: 'Calendario', dateColumn: 'Scadenza' }],
      } },
      { title: 'Task', icon: '✅', database: taskDb(p, [['Raccogliere i requisiti', 'Fatto', 'Io', -50, 'Alta'], ['Disegnare i flussi principali', 'In corso', 'Io', -40, 'Alta'], ['Setup repository e ambiente', 'Fatto', 'Collega', -40, 'Media'], ['Implementare la prima schermata', 'In corso', 'Collega', -30, 'Alta'], ['Test con utenti', 'Da fare', 'Io', -10, 'Media'], ['Preparare il lancio', 'Da fare', 'Io', -3, 'Alta']]) },
      { title: 'Bug tracker', icon: '🐞', database: {
        title: 'Bug tracker', icon: '🐞',
        columns: [{ name: 'Problema', type: 'text' }, { name: 'Stato', type: 'status', options: ['Da fare', 'In corso', 'Fatto'] }, { name: 'Gravità', type: 'select', options: ['Bloccante', 'Alta', 'Media', 'Bassa'] }, { name: 'Segnalato da', type: 'select', options: ['Io', 'Collega', 'Utente'] }, { name: 'Link', type: 'url' }],
        rows: [{ Problema: 'Esempio: il form non salva', Stato: 'Da fare', Gravità: 'Alta', 'Segnalato da': 'Utente' }],
        views: [{ type: 'table', name: 'Tabella' }, { type: 'board', name: 'Per stato', groupBy: 'Stato' }],
      } },
      { title: 'Documentazione', icon: '📚', blocks: [{ type: 'heading', level: 2, text: 'Decisioni tecniche' }, { type: 'bullets', items: ['Stack scelto e perché', 'Convenzioni di codice', 'Come avviare il progetto'] }, { type: 'heading', level: 2, text: 'Link utili' }, { type: 'paragraph', text: 'Repository, design, ambienti di test.' }] },
    ],
  }),
}

const viaggio: Template = {
  id: 'viaggio', label: 'Viaggio', icon: '✈️',
  keywords: ['viaggio', 'vacanza', 'trip', 'gita', 'weekend', 'itinerario', 'vacanze', 'tour'],
  build: (p) => ({
    title: p.name, icon: '✈️',
    summary: `Pianificazione del viaggio "${p.name}": itinerario, prenotazioni, budget e lista valigia.`,
    pages: [
      { title: 'Panoramica', icon: '🏝️', blocks: [{ type: 'callout', icon: '✈️', text: `${p.name} — partenza ${dateLabel(p.date)}${p.place ? ` — ${p.place}` : ''}` }, { type: 'heading', level: 2, text: 'Prima di partire' }, { type: 'todo', items: [{ text: 'Documenti e passaporti' }, { text: 'Assicurazione di viaggio' }, { text: 'Prenotare voli e alloggio' }, { text: 'Cambiare valuta' }] }] },
      { title: 'Itinerario', icon: '🗓️', database: {
        title: 'Itinerario', icon: '🗓️',
        columns: [{ name: 'Attività', type: 'text' }, { name: 'Giorno', type: 'date' }, { name: 'Tipo', type: 'select', options: ['Trasporto', 'Visita', 'Pasto', 'Relax'] }, { name: 'Luogo', type: 'text' }, { name: 'Prenotato', type: 'checkbox' }],
        rows: [{ Attività: 'Partenza', Giorno: p.date, Tipo: 'Trasporto', Prenotato: false }, { Attività: 'Check-in alloggio', Giorno: p.date, Tipo: 'Relax', Prenotato: false }, { Attività: 'Prima visita', Giorno: addDays(p.date, 1), Tipo: 'Visita', Prenotato: false }],
        views: [{ type: 'calendar', name: 'Calendario', dateColumn: 'Giorno' }, { type: 'table', name: 'Tabella', sortBy: 'Giorno' }],
      } },
      { title: 'Budget', icon: '💶', database: budgetDb([['Volo', 'Trasporti', 2, 150, false, ''], ['Alloggio (notti)', 'Alloggio', 4, 90, false, ''], ['Pasti', 'Cibo', 8, 25, false, ''], ['Attività', 'Svago', 3, 30, false, '']], 'Budget', ['Trasporti', 'Alloggio', 'Cibo', 'Svago', 'Altro']) },
      { title: 'Lista valigia', icon: '🧳', blocks: [{ type: 'todo', items: [{ text: 'Documenti' }, { text: 'Caricabatterie e adattatori' }, { text: 'Medicinali' }, { text: 'Vestiti adatti al meteo' }, { text: 'Costume / scarpe comode' }] }] },
    ],
  }),
}

const marketing: Template = {
  id: 'marketing', label: 'Marketing / Contenuti', icon: '📣',
  keywords: ['marketing', 'social', 'contenuti', 'editoriale', 'campagna', 'blog', 'post', 'newsletter', 'instagram', 'calendario editoriale'],
  build: (p) => ({
    title: p.name, icon: '📣',
    summary: `Calendario editoriale e gestione campagne per "${p.name}".`,
    pages: [
      { title: 'Strategia', icon: '🎯', blocks: [{ type: 'callout', icon: '🎯', text: `Obiettivo della campagna: ${p.name}` }, { type: 'heading', level: 2, text: 'Pubblico' }, { type: 'paragraph', text: 'Chi vogliamo raggiungere e perché.' }, { type: 'heading', level: 2, text: 'KPI' }, { type: 'bullets', items: ['Follower / iscritti', 'Engagement', 'Conversioni'] }] },
      { title: 'Calendario editoriale', icon: '📅', database: {
        title: 'Calendario editoriale', icon: '📅',
        columns: [{ name: 'Contenuto', type: 'text' }, { name: 'Canale', type: 'select', options: ['Instagram', 'TikTok', 'Newsletter', 'Blog', 'Facebook'] }, { name: 'Stato', type: 'status', options: ['Da fare', 'In corso', 'Fatto'] }, { name: 'Pubblicazione', type: 'date' }, { name: 'Autore', type: 'select', options: ['Io', 'Collega'] }],
        rows: [{ Contenuto: 'Post di lancio', Canale: 'Instagram', Stato: 'In corso', Pubblicazione: p.date, Autore: 'Io' }, { Contenuto: 'Newsletter di presentazione', Canale: 'Newsletter', Stato: 'Da fare', Pubblicazione: addDays(p.date, 3), Autore: 'Collega' }, { Contenuto: 'Video dietro le quinte', Canale: 'TikTok', Stato: 'Da fare', Pubblicazione: addDays(p.date, 7), Autore: 'Collega' }],
        views: [{ type: 'calendar', name: 'Calendario', dateColumn: 'Pubblicazione' }, { type: 'board', name: 'Board', groupBy: 'Stato' }, { type: 'table', name: 'Tabella', sortBy: 'Pubblicazione' }],
      } },
      { title: 'Idee', icon: '💡', blocks: [{ type: 'heading', level: 2, text: 'Banca idee' }, { type: 'bullets', items: ['Idea 1', 'Idea 2', 'Idea 3'] }] },
    ],
  }),
}

const crm: Template = {
  id: 'crm', label: 'Clienti / Vendite (CRM)', icon: '🤝',
  keywords: ['crm', 'clienti', 'cliente', 'vendite', 'lead', 'contatti', 'trattative', 'pipeline', 'commerciale'],
  build: (p) => ({
    title: p.name, icon: '🤝',
    summary: `Gestione clienti e trattative: pipeline di vendita, contatti e attività.`,
    pages: [
      { title: 'Panoramica', icon: '🏠', blocks: [{ type: 'callout', icon: '📈', text: `${p.name}: tieni qui obiettivi di vendita e regole di gestione dei lead.` }, { type: 'bullets', items: ['Obiettivo mensile', 'Regole di follow-up', 'Listino'] }] },
      { title: 'Pipeline', icon: '📈', database: {
        title: 'Pipeline', icon: '📈',
        columns: [{ name: 'Cliente', type: 'text' }, { name: 'Fase', type: 'status', options: ['Nuovo lead', 'Contattato', 'Preventivo', 'Chiuso vinto', 'Chiuso perso'] }, { name: 'Valore', type: 'number', format: 'euro' }, { name: 'Probabilità', type: 'number', format: 'percent' }, { name: 'Valore atteso', type: 'formula', formula: 'prop("Valore") * prop("Probabilità") / 100', format: 'euro' }, { name: 'Prossimo contatto', type: 'date' }, { name: 'Email', type: 'email' }, { name: 'Telefono', type: 'phone' }],
        rows: [{ Cliente: 'Cliente esempio A', Fase: 'Preventivo', Valore: 4000, Probabilità: 60, 'Prossimo contatto': addDays(p.today, 3) }, { Cliente: 'Cliente esempio B', Fase: 'Nuovo lead', Valore: 1500, Probabilità: 20, 'Prossimo contatto': addDays(p.today, 1) }],
        views: [{ type: 'board', name: 'Pipeline', groupBy: 'Fase' }, { type: 'table', name: 'Tabella', summaries: { Valore: 'sum', 'Valore atteso': 'sum' } }, { type: 'calendar', name: 'Follow-up', dateColumn: 'Prossimo contatto' }],
      } },
      { title: 'Attività', icon: '✅', database: taskDb(p, [['Richiamare cliente A', 'Da fare', 'Io', -2, 'Alta'], ['Inviare preventivo', 'In corso', 'Collega', -1, 'Alta']]) },
    ],
  }),
}

const studio: Template = {
  id: 'studio', label: 'Studio / Università', icon: '🎓',
  keywords: ['studio', 'università', 'universita', 'esame', 'esami', 'corso', 'tesi', 'scuola', 'lezioni', 'appunti'],
  build: (p) => ({
    title: p.name, icon: '🎓',
    summary: `Organizzazione dello studio: esami, argomenti e piano settimanale.`,
    pages: [
      { title: 'Panoramica', icon: '🏠', blocks: [{ type: 'callout', icon: '🎓', text: `${p.name} — data chiave ${dateLabel(p.date)}` }, { type: 'todo', items: [{ text: 'Raccogliere il materiale' }, { text: 'Fare il piano di studio' }, { text: 'Simulazioni / ripasso' }] }] },
      { title: 'Argomenti', icon: '📚', database: {
        title: 'Argomenti', icon: '📚',
        columns: [{ name: 'Argomento', type: 'text' }, { name: 'Stato', type: 'status', options: ['Da fare', 'In corso', 'Fatto'] }, { name: 'Difficoltà', type: 'select', options: ['Facile', 'Media', 'Difficile'] }, { name: 'Da ripassare il', type: 'date' }],
        rows: [{ Argomento: 'Argomento 1', Stato: 'In corso', Difficoltà: 'Media', 'Da ripassare il': addDays(p.date, -10) }, { Argomento: 'Argomento 2', Stato: 'Da fare', Difficoltà: 'Difficile', 'Da ripassare il': addDays(p.date, -7) }],
        views: [{ type: 'board', name: 'Board', groupBy: 'Stato' }, { type: 'table', name: 'Tabella' }, { type: 'calendar', name: 'Calendario', dateColumn: 'Da ripassare il' }],
      } },
      { title: 'Appunti', icon: '📝', blocks: [{ type: 'heading', level: 2, text: 'Appunti di lezione' }, { type: 'paragraph', text: '' }] },
    ],
  }),
}

export const generico: Template = {
  id: 'generico', label: 'Progetto generico', icon: '📘', keywords: [],
  build: (p) => ({
    title: p.name, icon: '📘',
    summary: `Struttura di base per "${p.name}": panoramica, task su board e note.`,
    pages: [
      { title: 'Panoramica', icon: '🏠', blocks: [{ type: 'callout', icon: '🎯', text: `${p.name}${p.date > p.today ? ` — scadenza ${dateLabel(p.date)}` : ''}` }, { type: 'heading', level: 2, text: 'Obiettivi' }, { type: 'bullets', items: ['Obiettivo 1', 'Obiettivo 2'] }, { type: 'heading', level: 2, text: 'Prossimi passi' }, { type: 'todo', items: [{ text: 'Definire le priorità' }, { text: 'Assegnare le attività' }] }] },
      { title: 'Task', icon: '✅', database: taskDb(p, [['Definire le priorità', 'In corso', 'Io', -14, 'Alta'], ['Assegnare le attività', 'Da fare', 'Io', -10, 'Media'], ['Prima revisione', 'Da fare', 'Collega', -3, 'Media']]) },
      { title: 'Note', icon: '📝', blocks: [{ type: 'paragraph', text: '' }] },
    ],
  }),
}

export const TEMPLATES: Template[] = [evento, progetto, viaggio, marketing, crm, studio]
export type { BPPage }
