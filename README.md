# Notion Clone — workspace collaborativo, offline-first

Un clone di Notion che funziona **in locale, in rete e nel cloud**, pensato per lavorare in due (o più) sullo stesso progetto — per esempio per organizzare delle serate — ma generico: vale per qualsiasi progetto, evento, team o archivio di dati.

## Cosa fa

| | |
|---|---|
| **Editor a blocchi** | Titoli, elenchi, checklist, citazioni, callout, codice, divisori, link, evidenziatore, menu `/` per inserire blocchi, sotto-pagine. |
| **Tabelle nelle pagine** | Tabelle semplici (aggiungi/elimina righe e colonne, intestazione, celle unite). |
| **Database avanzati** | Tipi: testo, numero, selezione, selezione multipla, stato, data, casella, URL, email, telefono, **formula**, data creazione. Viste **Tabella / Board (kanban) / Calendario**, **filtri** (E/O), **ordinamenti** multipli, **raggruppamento**, **riepiloghi** (somma, media, min, max, conteggi, % spuntati), colonne ridimensionabili/nascondibili, ricerca, selezione multipla, incolla da Excel, **import/export CSV**, pagina di dettaglio per ogni riga con note. I database possono stare a pagina intera o **dentro una pagina**. |
| **Tempo reale** | Più persone nello stesso documento vedono le modifiche **mentre vengono scritte**, anche nello stesso blocco o nella stessa cella: cursori con nome, selezioni, **blocco evidenziato con il nome di chi ci lavora**, contorno della cella in modifica, avatar online e puntini di presenza nella barra laterale. Le modifiche simultanee si **fondono senza conflitti** (CRDT, [Yjs](https://yjs.dev)). |
| **Offline** | Tutto è salvato nel browser (IndexedDB) e l'app si apre anche senza rete (service worker). Le modifiche fatte offline si sincronizzano e si uniscono da sole al ritorno online. |
| **Telefono** | Interfaccia responsive: barra laterale a cassetto, tabelle scorrevoli, board a colonne con "sposta in…" al posto del trascinamento, pannelli a tutto schermo. Installabile come app (PWA). |
| **Assistente (chatbot)** | Descrivi il progetto e crea pagine, task, tabelle e database già compilati. Funziona **offline** con modelli integrati in italiano (evento/serata, progetto, viaggio, marketing, CRM, studio) e, se configuri una chiave, con **Claude** per progetti su misura. Capisce anche comandi come *"aggiungi task: preparare la locandina entro venerdì"* o *"aggiungi invitato: Marco Rossi"*. |
| **Altro** | Cestino con ripristino, ricerca (`Ctrl/Cmd+K`), tema chiaro/scuro, backup/ripristino completo in JSON, QR code per invitare dal telefono. |

## Avvio rapido (locale)

Richiede Node.js 20+ (22 consigliato).

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

Apri http://localhost:3000, scrivi il tuo nome in **Impostazioni** e prova l'assistente dalla schermata iniziale. I dati dei documenti vengono salvati anche sul server nella cartella `data/`.

Sviluppo con ricarica automatica: `npm run dev` (client su http://localhost:5173, server su :3000).

## Lavorare con un collega

**Stessa Wi-Fi / rete locale.** Avvia `npm start`: nel terminale compaiono anche gli indirizzi di rete (es. `http://192.168.1.20:3000`). Nell'app apri **Condividi**: scegli l'indirizzo di rete, copia il link o fai inquadrare il **QR code** dal telefono. Il collega apre il link e vede subito il workspace.

**Via internet.** Pubblica l'app su un server raggiungibile da entrambi (vedi sotto), poi usa **Condividi** dall'indirizzo pubblico. Imposta `APP_PASSWORD`: chi entra inserisce la password in *Impostazioni → Sincronizzazione* (il link non la contiene).

> Il link di invito contiene la chiave segreta del workspace: chiunque lo possieda può entrare. Non c'è (ancora) un sistema di account e ruoli: condividilo solo con chi ti fidi.

## Pubblicazione nel cloud

Serve un host che esegua Node o Docker **con disco persistente** e **HTTPS** (HTTPS è necessario anche perché il browser attivi l'app offline e l'installazione come app su dominio non-localhost).

```bash
# con Docker
docker build -t notion-clone .
docker run -d -p 3000:3000 -v notion-data:/data \
  -e APP_PASSWORD='scegli-una-password' \
  -e ANTHROPIC_API_KEY='sk-ant-...'   `# facoltativo` \
  notion-clone
```

Funziona su qualsiasi servizio che esegua un container o `npm run build && npm start` (Fly.io, Railway, Render, un VPS con Caddy/nginx per HTTPS…). Ricordati di montare un volume su `/data` (o impostare `DATA_DIR`) e di abilitare i WebSocket (path `/sync`). Variabili d'ambiente: vedi [`.env.example`](.env.example).

## Funzionamento offline

- **Dati:** ogni documento è copiato in IndexedDB. Con o senza rete puoi leggere e modificare tutto.
- **App:** il service worker mette in cache l'app alla prima visita; da quel momento si apre anche senza connessione. Il service worker richiede **HTTPS o `localhost`**: con un indirizzo `http://192.168…` l'app online funziona, ma per l'avvio offline serve uno dei due.
- **Sincronizzazione:** in basso a sinistra vedi lo stato (*Sincronizzato / Connessione… / Offline / Solo locale*). Al ritorno online le modifiche si fondono con quelle dei colleghi. Dalle **Impostazioni** puoi anche disattivare la sincronizzazione e lavorare solo in locale.

## Assistente

- **Locale (sempre disponibile):** riconosce l'argomento, la data ("sabato 17 ottobre", "tra 2 settimane", "12/10"), numero di invitati, budget e nome del progetto, e propone una struttura che confermi prima di crearla.
- **Claude (opzionale):** con `ANTHROPIC_API_KEY` sul server l'assistente genera strutture su misura. La chiave resta sul server; il client non la vede mai. Se la chiamata fallisce o sei offline, si ripiega automaticamente sul motore locale. Modello predefinito `claude-opus-5-5`, cambiabile con `AI_MODEL`.

## Architettura

```
server/        Node: Express + WebSocket (protocollo y-websocket), persistenza su file, API assistente, hosting del client
src/sync/      Sessione del workspace: un Y.Doc per pagina (+ uno per l'albero delle pagine), IndexedDB + WebSocket
src/editor/    TipTap/ProseMirror collegato a Yjs, presenza di blocco, menu "/", blocchi database/callout/link
src/db/        Database: schema Yjs, formule (parser sicuro), filtri/ordinamenti/gruppi, viste, CSV
src/ai/        Assistente: motore locale, modelli, validazione dei blueprint, creazione dei documenti
public/        Manifest PWA e service worker
```

Ogni pagina è un documento Yjs separato (`<workspace>__<pagina>`); il server inoltra gli aggiornamenti e salva lo stato in `data/<room>.ydoc`.

## Test

```bash
npm test      # formule, CSV, assistente locale e test d'integrazione del server (sync, persistenza, password)
npm run typecheck
```

Nota: i test automatici coprono logica e server. Il comportamento nel browser (collaborazione a due utenti, offline, vista mobile) è stato verificato con Chromium automatizzato, non su dispositivi iOS/Android reali. L'integrazione con Claude è stata verificata solo fino alla risposta del server in caso di errore: non è stata provata con una chiave reale.

## Limiti noti

- Nessun account/ruolo: l'accesso si basa sul link segreto del workspace e, opzionalmente, su una password condivisa del server.
- La ricerca (`Ctrl+K`) cerca nei titoli delle pagine, non nel testo.
- Niente immagini/file allegati e niente trascinamento dei blocchi (si possono tagliare/incollare); le pagine si riordinano dal menu `⋯` nella barra laterale.
- Il trascinamento delle schede della board è disponibile con il mouse; su touch si usa il menu "sposta in…" della scheda.
