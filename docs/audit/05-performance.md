# Audit performance

Audit del 31/07/2026 su commit `ef55cc0` (main). Build di produzione eseguita localmente (`prisma generate && next build`, senza `migrate deploy`); nessun file sorgente modificato, nessun accesso in scrittura al database.

**Metodo di misura dei bundle**: Next 16 con Turbopack non stampa più la tabella "First Load JS", quindi i pesi per route sono stati ricalcolati dai `page_client-reference-manifest.js` di `.next/server/app`, sommando i chunk client di ogni route e comprimendoli con gzip -9. I numeri **includono i chunk condivisi** (runtime React/Next, ~40 kB gz: è il peso della pagina `/login`, che fa da baseline). L'attribuzione dei pacchetti ai chunk è stata fatta cercando marker univoci delle librerie nei chunk minificati.

## Sommario esecutivo

I 5 interventi con miglior rapporto guadagno/costo:

1. **[P-02] Togliere Zod dal bundle client** — entra su 11 route per importare costanti (`ASSET_CLASSES`) e uno schema di layout. Spostare le costanti in `constants.ts` e il parse del layout sul server: **~15–20 kB gz in meno su quasi tutta l'app**, costo S.
2. **[P-03] Caricare il calendario del filtro periodo on-demand** — `react-day-picker` + `date-fns` (23 kB gz) sono nel bundle iniziale di dashboard/trades/reports/analytics per un popover che si apre di rado. `next/dynamic` all'apertura: **−23 kB gz su 4 route**, costo S.
3. **[P-01] Recharts fuori dal percorso critico** — il chunk recharts+d3 (110 kB gz, 383 kB raw) è caricato e idratato eagerly su 5 route. Su `/trades` serve per UN solo widget. `next/dynamic` sui componenti grafico: **−110 kB gz dal critical path di /trades**, TBT ridotto su dashboard, costo M.
4. **[P-04] Appiattire il waterfall di query di /analytics** — 7 stadi sequenziali di round-trip al DB dove ne basterebbero 3: **~50–150 ms di TTFB** stimati (di più con latenza DB alta), costo S–M.
5. **[P-05] Streaming per la pagina Trends a cache fredda** — il primo visitatore del giorno aspetta il più lento di ~50 fetch FRED (timeout 15 s) prima di vedere QUALSIASI contenuto oltre lo skeleton. Suspense per sezione: **da "tutto o niente" a contenuto progressivo**, costo M.

## Numeri misurati

### Build di produzione

- `next build` (Turbopack): compilazione 9,2 s · TypeScript 12,4 s · 24 route, tutte **ƒ dinamiche** (nessuna statica: ogni pagina fa `auth()`).
- Totale `.next/static/chunks`: **2,5 MB** (53 chunk).

### Peso JS client per route (chunk referenziati dal manifest, gzip -9)

| Route | Chunk | Raw kB | Gz kB |
|---|---|---|---|
| /dashboard | 17 | 1.174 | **330** |
| /trades | 15 | 1.098 | **307** |
| /day/[date] | 15 | 1.042 | **292** |
| /analytics | 16 | 917 | **273** |
| /reports | 14 | 813 | **241** |
| /import | 14 | 664 | 184 |
| /trades/[id] | 13 | 633 | 173 |
| /trades/new · /trades/[id]/edit | 13 | 631 | 172 |
| /macro-desk/[id] | 13 | 643 | 172 |
| /settings | 12 | 600 | 160 |
| /settings/accounts | 12 | 589 | 157 |
| /register | 9 | 522 | 137 |
| /day/[date]/review | 12 | 348 | 108 |
| /macro-desk/trends | 12 | 322 | 97 |
| /day | 11 | 311 | 94 |
| /reports/settimana · /strategies | 11 | 310 | 93 |
| /macro-desk · /scorecard · /notebook | 10 | 299 | 89 |
| /login (baseline framework) | 5 | 143 | **40** |

### I chunk più pesanti e cosa contengono

| Chunk | Raw | Gz | Route | Contenuto (da marker) |
|---|---|---|---|---|
| `03snotcbf…` | 383 kB | 110 kB | 5 (dashboard, trades, day/[date], reports, analytics) | **recharts + d3** (+ decimal in bundle) |
| `33i0qylp…` | 277 kB | 63 kB | 11 route | codice condiviso app + **zod v4** |
| `2iy9x5rl…` | 80 kB | 24 kB | solo /analytics | recharts extra (scatter ecc.) |
| `2i_2cql…` | 81 kB | 23 kB | 4 (dashboard, trades, reports, analytics) | **react-day-picker + date-fns** |
| `17oy4u…` | 65 kB | 18 kB | solo /macro-desk/[id] | tab del report |
| `1smnpd…` | 56 kB | 16 kB | solo /dashboard | dashboard-view + radix |
| `2lcdbe7…` | 41 kB | 14 kB | solo /import | **papaparse** |
| `3-9tsf9…` | 31 kB | 13 kB | 10 route | **decimal.js** |

Riferimenti sorgente: `decimal.js` da solo pesa 125 kB raw / **31 kB gz** (è spalmato su due chunk); il core di zod v4 (`v4/classic/schemas.js`) è 50 kB raw solo di schemi.

### Microbenchmark del motore di simulazione (misurato con tsx, Node 24)

| Scenario | Simulazione | Statistiche | Punti SVG risultanti |
|---|---|---|---|
| Default: 100 trade × 20 linee | 0,7 ms | 1,5 ms | 2.020 |
| Massimo: 1000 trade × 100 linee | 7,4 ms | 11,9 ms | **100.100** |

Il calcolo NON è il collo di bottiglia (≤20 ms anche al massimo): il costo sta nel rendering Recharts dei punti (vedi P-07).

## Mappa del flusso dati e della cache

- **Tutte le pagine sono server component dinamiche** (`auth()` su ogni richiesta, sessione JWT: nessuna query DB per la sessione). I dati arrivano da SQL raw parametrizzato (`src/lib/queries/*`) o Prisma; al client vanno stringhe già formattate o serie ridotte (≤365 bucket giornalieri, sequenze LIMIT 200, scatter LIMIT 600, rolling campionato a 400 punti).
- **Client component** = shell interattive che ricevono i dati come props: `dashboard-view`, i grafici Recharts (11 file), i form, i filtri. L'unico calcolo pesante client-side è l'equity simulator (volontariamente, parte solo su click).
- **Layout (app)**: 2 query per render del layout (conti + conto demo) — sulle navigazioni soft il layout non si ri-renderizza, il costo è solo sui load pieni.
- **resolveTradeScope**: +1 query per pagina quando un conto è selezionato (lookup del conto per lo scope demo).
- **FRED (`/macro-desk/trends`)**: ~50 serie (47 indicatori + USREC + alternativi) scaricate in parallelo con `Promise.allSettled`, ognuna con **Next data cache `revalidate: 86400`** (24 h) e timeout 15 s. Storia COMPLETA per serie (nessun `observation_start`): serve ai percentili storici, ma per le daily lunghe (es. DGS10 dal 1962, ~16k osservazioni) sono ~1 MB di JSON a fetch. A cache calda: zero fetch, la pagina è veloce. A cache fredda: vedi P-05.
- **Nessun'altra cache applicativa**: le query DB girano a ogni richiesta (corretto per dati di journal), l'API attachments ha `Cache-Control: private, max-age=3600`.
- **Watcher MT5**: `setInterval` 10 s avviato da `instrumentation.ts`, una query `Mt5SyncSource` per tick (vedi P-10).
- **Cron COT**: settimanale, fuori dal percorso utente.
- **Font**: `next/font` self-hosted (Geist; Inter+JetBrains Mono solo sulle pagine Macro Desk) — nessuna richiesta esterna. **Immagini**: solo gli allegati via `<img>` con `loading="lazy"` (vedi P-08); nessuna immagine statica rilevante.

## Rilievi

### [P-01] Recharts (110 kB gz) caricato eagerly su 5 route, anche dove serve per un solo widget
- Severità: **P1**
- Dove: `src/components/charts/*`, `src/components/dashboard/pnl-charts.tsx`, `src/app/(app)/trades/page.tsx:47` (import statico di `TradeSequenceChart`)
- Problema: nessun uso di `next/dynamic`/`React.lazy` in tutto `src/` (verificato con grep). Il chunk recharts+d3 (383 kB raw / 110 kB gz) è scaricato, parsato e idratato nel percorso critico di dashboard, trades, day/[date], reports e analytics. Su `/trades` — una pagina che è una tabella — serve solo per il widget "Sequenza trade"; su /analytics c'è un secondo chunk recharts da 24 kB gz.
- Misura o stima: 110 kB gz ≈ 383 kB di JS da parsare; su mobile mid-range il parse+eval di recharts+d3 costa tipicamente 200–400 ms di main thread, che si somma all'idratazione di ~10 grafici sulla dashboard.
- Proposta: avvolgere i componenti grafico in `next/dynamic` (con `ssr: true` per non perdere il markup, o `ssr: false` + skeleton per toglierli anche dall'idratazione). Priorità: `/trades` (un solo grafico sotto la tabella), poi i widget sotto la piega della dashboard (underwater, distribuzione R, sequenza). I grafici sopra la piega della dashboard possono restare eager.
- Guadagno atteso: su `/trades` −110 kB gz dal bundle iniziale (307→~197); su dashboard/reports TBT ridotto di ~100–300 ms (il chunk si scarica async fuori dal percorso di prima interazione).
- Costo: **M** (toccare ~8 punti di import, verificare che i grafici SSR-ati non flickerino) · Rischio di regressione: **basso-medio** (attenzione a `prefers-reduced-motion` e al layout shift degli skeleton)

### [P-02] Zod v4 nel bundle client di 11 route per importare costanti e uno schema
- Severità: **P1** (per ubiquità, non per gravità singola)
- Dove: `src/components/dashboard/dashboard-view.tsx:14` (→ `lib/dashboard.ts`, che importa zod per `dashboardLayoutSchema`); `src/components/trades/trade-form.tsx:8` e `trade-filters-bar.tsx:11` (→ `lib/validations/trade.ts` per la costante `ASSET_CLASSES`); `src/components/attachments/attachments-card.tsx:14` (→ `validations/attachment.ts`)
- Problema: i client component importano moduli che definiscono schemi Zod solo per riusarne costanti o tipi. Il bundler trascina l'intera libreria (core zod v4: 50 kB raw di soli schemi) nel chunk condiviso da 63 kB gz presente su 11 route — comprese pagine che di Zod non fanno nulla lato client. La validazione vera avviene comunque sul server.
- Misura o stima: quota zod nel chunk ≈ 15–20 kB gz + relativo parse; il chunk che la contiene è su 11 route.
- Proposta: spostare `ASSET_CLASSES` (e simili) in `src/lib/constants.ts` (dove il progetto già tiene le costanti condivise, come da regola in AGENTS.md); importare dai client solo `type` (gli import di soli tipi spariscono a build). Per `dashboard-view`: il parse del layout avviene già sul server (`parseDashboardLayout` in page.tsx) — il client ha bisogno solo di `WIDGET_IDS`/etichette, separabili dallo schema.
- Guadagno atteso: −15–20 kB gz su ~11 route; meno lavoro di parse a ogni cold load.
- Costo: **S** (spostare costanti, aggiustare import) · Rischio di regressione: **basso**

### [P-03] react-day-picker + date-fns (23 kB gz) eager per un popover che si apre di rado
- Severità: **P2**
- Dove: `src/components/filters/period-filter.tsx` (→ `ui/calendar.tsx` → react-day-picker), su dashboard, trades, reports, analytics
- Problema: il calendario range serve solo quando l'utente sceglie "Intervallo personalizzato", ma la libreria è nel bundle iniziale delle 4 pagine col filtro periodo.
- Misura o stima: chunk dedicato 81 kB raw / 23 kB gz su 4 route.
- Proposta: `next/dynamic` del solo contenuto del popover (il trigger resta sincrono); il download parte al primo click.
- Guadagno atteso: −23 kB gz dal bundle iniziale di 4 route; nessuna differenza percepita all'apertura (fetch ~50 ms su rete media, mascherabile con l'animazione del popover).
- Costo: **S** · Rischio di regressione: **basso**

### [P-04] Waterfall di query sequenziali su /analytics (7 stadi) e, in misura minore, sulle altre pagine (4)
- Severità: **P2** (percepibile con latenza DB reale, es. Neon da Vercel)
- Dove: `src/app/(app)/analytics/page.tsx:244-382`; pattern analogo in `dashboard/page.tsx:86-220` e `reports/page.tsx:326-363`
- Problema: gli stadi su /analytics sono: ① `user`+`resolveTradeScope` → ② `getCurrencyBreakdown` → ③ Promise.all di 7 query → ④ Promise.all di 4 → ⑤ `getNetPnlBefore` → ⑥ `getRollingTradeWindow` → ⑦ Promise.all di 3. Solo ①→② è una dipendenza vera (la valuta attiva entra nel filtro); ③④⑤⑦ sono indipendenti tra loro e ⑥ dipende solo da `coverage.total` (che serve a scegliere il preset, ricavabile con una COUNT nello stadio ③). Ogni stadio paga un round-trip pieno verso il DB.
- Misura o stima: non misurabile senza il DB di produzione; con RTT app→DB di 5–30 ms (Vercel↔Neon stessa regione) i 4 stadi evitabili valgono ~50–150 ms di TTFB, che salgono se le query dello stadio non sono uniformi (si paga la più lenta di ciascuno stadio invece della più lenta in assoluto).
- Proposta: fondere ③④⑤ (+`getStreakRuns`/`getTopConcentration`/`getProAggregates` di ⑦) in un unico `Promise.all`; anticipare la COUNT per il preset della rolling window. Dashboard: `getCurrencyBreakdown` + le 13 query possono diventare 2 stadi invece di 3 spostando la risoluzione valuta in SQL o accettando un filtro applicato dopo.
- Guadagno atteso: −50–150 ms TTFB su /analytics; −20–60 ms su dashboard/reports.
- Costo: **S–M** (riordino di codice, nessuna query nuova) · Rischio di regressione: **basso** (le query non cambiano, cambia solo quando partono)

### [P-05] /macro-desk/trends a cache fredda: pagina "tutto o niente" su ~50 fetch esterne
- Severità: **P1** per il primo visitatore del giorno, P3 a cache calda
- Dove: `src/lib/macro-trends.ts:151-157` (orchestratore), `src/lib/fred.ts:99` (`revalidate: 86400`)
- Problema: le ~50 serie partono in parallelo (bene) ma la pagina attende `getMacroTrendsData()` per intero prima di renderizzare qualunque contenuto: il TTFB della pagina è il **massimo** delle ~50 latenze, con timeout a 15 s per serie e retry sequenziale API→CSV (e ID alternativi in serie) che può cumulare fino a ~30-45 s per una serie con più fallback che falliscono lentamente. La data cache scade tutta insieme dopo 24 h, quindi il costo si ripresenta ogni giorno al primo accesso. In più ogni serie scarica la storia completa (per le daily lunghe ~1 MB di JSON), anche se questo serve legittimamente ai percentili storici.
- Misura o stima: non misurabile in locale (la rete di sviluppo blocca `*.stlouisfed.org`, documentato in PROGRESS.md). Stima a cache fredda in produzione: 2–15 s di attesa sullo skeleton; a cache calda: pochi ms.
- Proposta, in ordine di resa: ① spezzare la pagina in sezioni dentro `<Suspense>` alimentate da promise per-sezione — le sezioni pronte compaiono subito, la lenta arriva dopo; ② valutare `revalidate` scaglionati (es. 86400±random per serie) così la scadenza non è sincronizzata; ③ per le serie daily lunghe usate SOLO nei grafici (non nei percentili) limitare `observation_start` — attenzione: percentile e recessioni vogliono la storia intera, quindi solo dove il registry lo consente.
- Guadagno atteso: percezione da "pagina bloccata fino a 15 s" a "prime sezioni in 1–2 s"; nessun guadagno a cache calda.
- Costo: **M** (refactor per-sezione dell'orchestratore) · Rischio di regressione: **medio** (le tessere del quadro sintetico e il badge Ciclo generale aggregano su TUTTE le serie: vanno messe nell'ultima Suspense o degradate con conteggio parziale dichiarato)

### [P-06] Dashboard: 330 kB gz di JS e idratazione di ~10 grafici in un colpo solo
- Severità: **P2**
- Dove: `src/components/dashboard/dashboard-view.tsx` (2.000+ righe, un unico client component che monta tutti i widget)
- Problema: la pagina più visitata è anche la più pesante (330 kB gz, 1,17 MB raw). Oltre a P-01/P-02/P-03, l'idratazione monta in un frame: sparkline, cumulativo, P&L giornaliero, sequenza (200 barre), distribuzione R, underwater, gauge, mini-calendario, calendario mensile, tabella sessioni. Il codice client in sé è pulito (il cumulativo è in `useMemo` a `dashboard-view.tsx:423`, niente ricalcoli evidenti per render), il costo è il mount iniziale.
- Misura o stima: da misurare con Lighthouse su produzione (vedi ultima sezione); stima TBT su mobile mid-range: 300–600 ms.
- Proposta: dopo P-01, i widget sotto la piega (underwater, distribuzione R, monthly calendar, sessioni) in `next/dynamic` `ssr:false` o dietro `content-visibility: auto`; su mobile i toggle "[Tutte le metriche ▾]"/"[Analytics e grafici ▾]" già evitano il render di gran parte dei widget — verificare che siano render condizionali (non solo CSS hidden), nel qual caso il problema mobile è già mitigato.
- Guadagno atteso: −100–300 ms di TBT desktop al primo load.
- Costo: **M** · Rischio di regressione: **basso-medio**

### [P-07] Equity simulator: fino a 100.000 punti SVG renderizzati da Recharts
- Severità: **P2** (solo con parametri estremi; il default è sano)
- Dove: `src/components/analytics/equity-simulator.tsx` (grafico), `src/lib/metrics/equity-simulator.ts` (limiti 1000 trade × 100 linee)
- Problema: il motore è veloce (misurato: 7,4 ms la simulazione + 11,9 ms le statistiche nel caso massimo), ma il grafico disegna ogni percorso per intero: 100 linee × 1001 punti = 100.100 punti SVG più 2 aree di banda. Recharts a quella scala impiega secondi di main thread e l'interfaccia si blocca al click su "Start simulation" (niente worker, niente chunking). Col default (20×100 = 2.020 punti) il problema non esiste.
- Misura o stima: motore ≤20 ms (misurato); rendering stimato 2–6 s a 100k punti su hardware medio (da confermare con un profilo DevTools).
- Proposta: campionare i percorsi PRIMA del render a ≤250 punti sull'asse x (il fan chart della vecchia Fase 20 campionava a ≤100 esattamente per questo — la logica è nota al progetto); le statistiche restano sui dati integrali. In alternativa: abbassare il tetto delle linee disegnate mantenendo quello simulato.
- Guadagno atteso: rendering da secondi a <100 ms nel caso estremo; zero differenza visiva (250 punti superano la risoluzione orizzontale della card).
- Costo: **S** · Rischio di regressione: **basso** (attenzione a mantenere l'ultimo punto, come già fa il campionamento del rolling)

### [P-08] Anteprime allegati a dimensione piena dal database
- Severità: **P2**
- Dove: `src/components/attachments/attachments-card.tsx:184`, `src/app/api/attachments/[id]/route.ts`
- Problema: le griglie di anteprima (fino a 12 per trade/giornata/fase) caricano il file ORIGINALE (fino a 4 MB l'uno) per mostrarlo in una cella `aspect-video`: nel caso peggiore ~48 MB scaricati e decodificati per una griglia di miniature. `loading="lazy"` e `Cache-Control: private, max-age=3600` mitigano, ma il primo caricamento di una Day View ricca di screenshot resta pesante, specie su mobile.
- Misura o stima: dipende dai dati reali dell'utente (non misurabile da qui); il tetto teorico per griglia è 12 × 4 MB.
- Proposta: generare una miniatura al momento dell'upload **client-side** con canvas (niente dipendenze server, coerente con la regola "no storage esterno"): una colonna `thumbnail Bytes` (~30–60 kB a immagine) servita da `/api/attachments/[id]?thumb=1`; il file pieno resta per il lightbox e il download. Migrazione additiva; per gli allegati esistenti fallback all'originale.
- Guadagno atteso: −95% di byte trasferiti sulle griglie (48 MB → ~0,5 MB nel caso peggiore).
- Costo: **M** (migrazione + upload path + route) · Rischio di regressione: **basso** (fallback naturale all'originale)

### [P-09] Nessun indice su `Trade.closedAt`, la colonna su cui filtra e ordina quasi tutto
- Severità: **P3 oggi, P1 in prospettiva**
- Dove: `prisma/schema.prisma:193-196` (indici Trade), `src/lib/queries/stats.ts:38-55` (`whereClosedTrades`: `status='CLOSED'` + range su `closedAt`), `getRecentTradeOutcomes`/`getTradeSequence` (`ORDER BY closedAt DESC`)
- Problema: gli indici esistenti coprono `openedAt`, `symbol`, `status` — ma il 90% delle query analitiche filtra per intervallo e ordina su `closedAt`, che non ha indice. Oggi il DB ha ~840 trade e Postgres risolve tutto in <1 ms comunque; con decine di migliaia di trade (multi-utente, import massivi) le aggregazioni per periodo e le due query con ORDER BY diventano seq scan ripetuti 10-15 volte per render di dashboard.
- Misura o stima: a 840 righe irrilevante (differenza sotto il millisecondo); il punto di flesso è ~50–100k righe totali.
- Proposta: `@@index([tradingAccountId, closedAt])` su Trade (migrazione additiva, una riga). Copre sia i range che gli ORDER BY delle query per conto singolo; per "Tutti i conti" resta la JOIN su TradingAccount, che l'indice per conto serve comunque bene.
- Guadagno atteso: oggi ~0; assicura che la dashboard resti O(log n) quando i dati crescono.
- Costo: **S** · Rischio di regressione: **basso** (indice in più: solo spazio e un filo di costo in scrittura)

### [P-10] Watcher MT5: una query al DB ogni 10 secondi per istanza, anche senza sorgenti
- Severità: **P3**
- Dove: `src/lib/mt5-watcher.ts:19,62-74` (polling), avviato da `src/instrumentation.ts`
- Problema: ogni tick interroga `Mt5SyncSource` anche quando non esiste alcuna sorgente configurata (il caso di produzione su Vercel, dove peraltro il filesystem dell'EA non è raggiungibile): 8.640 query/giorno per istanza warm, pura CPU/connessione sprecata. Il loop è già ben protetto (re-entrancy guard, try/catch).
- Misura o stima: costo unitario minimo (~1 ms di query), ma è lavoro di fondo costante moltiplicato per le istanze.
- Proposta: dopo un tick con zero sorgenti, allungare l'intervallo (backoff a 60–120 s finché non ne compare una), o disabilitare il watcher via `MT5_WATCHER_DISABLED=1` negli env di produzione Vercel (kill-switch già esistente, costo zero).
- Guadagno atteso: ~8.600 query/giorno in meno per istanza in produzione.
- Costo: **S** (env var: zero codice) · Rischio di regressione: **basso** (documentare che il sync MT5 vale solo self-hosted)

### [P-11] `findMany` senza `select` sulle liste trade
- Severità: **P3**
- Dove: `src/app/(app)/trades/page.tsx:98-107` (25 righe con TUTTE le colonne + include), analogo sul dettaglio
- Problema: la tabella usa ~10 campi ma la query trasferisce tutte le ~25 colonne del Trade (8 Decimal, timestamps, brokerTicketId…). Con 25 righe/pagina l'overhead è dell'ordine dei KB: misurabile, non percepibile.
- Misura o stima: ~2–5 kB per pagina di lista; irrilevante per il tempo di risposta attuale.
- Proposta: aggiungere `select` esplicito solo se si mette mano al file per altro; non vale un intervento dedicato.
- Guadagno atteso: marginale.
- Costo: **S** · Rischio di regressione: **basso**

### [P-12] decimal.js (31 kB gz) nel bundle client di 10+ route
- Severità: **P3** — segnalato per completezza, NON raccomando di rimuoverlo
- Dove: chunk `3-9tsf9…` su 10 route; usato da `money.ts` e dai client component che formattano
- Problema: 31 kB gz per fare formattazione display-side. È però una scelta DELIBERATA e protettiva del progetto (regola "mai number JS per i soldi", AGENTS.md): sostituirla con formatter string-based lato client sarebbe un risparmio reale ma contro una regola che ha già prevenuto bug di denaro.
- Misura o stima: 31 kB gz misurati.
- Proposta: nessun intervento ora. Se un giorno si vuole il risparmio: un modulo `money-display.ts` senza Decimal per i SOLI client component, con le stesse firme e test di equivalenza contro `money.ts`.
- Guadagno atteso: −31 kB gz su 10 route, ma costo/rischio di coerenza alto rispetto al beneficio.
- Costo: **L** · Rischio di regressione: **medio-alto** (per questo non è in cima)

## Database: query e indici

**Cosa funziona bene** (ed è raro vederlo fatto così bene in un MVP):
- Tutte le aggregazioni girano in SQL (`FILTER`, `GROUP BY`, window functions, gaps-and-islands per le streak, `ROWS BETWEEN` per le finestre rolling, `LEFT JOIN LATERAL` su jsonb per la scorecard): in JS arrivano solo serie ridotte. Nessuna aggregazione JS su liste di trade — l'anti-pattern classico qui non esiste.
- Nessuna query N+1 trovata: le liste usano `include` mirati, i breakdown sono singole query con JOIN.
- Le serie verso il client sono sempre limitate (sequenza 200, scatter 600, rolling campionato a 400, outcomes 200, storico report 20).
- I listing degli allegati non selezionano mai la colonna `data Bytes` (solo la route di download).
- Ogni query filtra per `userId` via JOIN — il filtro di sicurezza fa anche da filtro di selettività.

**Cosa manca o è migliorabile:**
- Indice su `closedAt` (P-09, la segnalazione principale).
- I round-trip: la dashboard fa ~15-17 query per render. Sono TUTTE necessarie e quasi tutte in un unico `Promise.all` — il problema non è il numero ma gli stadi sequenziali evitabili (P-04). Fondere le scansioni multiple della stessa tabella (es. `getTradeAggregates` + `getRDistribution` + `getTradeSequence` condividono lo stesso WHERE) in una sola query CTE sarebbe possibile ma comprerebbe poco (le query sono già veloci) al prezzo di leggibilità: non lo raccomando.
- `getCurrencyBreakdown` viene eseguita su ogni pagina prima delle altre query (è la dipendenza che crea uno stadio del waterfall): potrebbe essere fusa nello stadio principale accettando di calcolare le altre query senza vincolo valuta quando lo scope è mono-valuta (il caso comune: conto singolo).

## Cosa è già ottimizzato bene

- **Aggregazioni SQL ovunque** (vedi sopra): l'architettura dati è il punto più forte dell'app.
- **Cache FRED** con Next data cache 24 h + `Promise.allSettled` + timeout: a cache calda la pagina Trends non fa rete.
- **Sessioni JWT**: `auth()` non tocca il DB.
- **Skeleton per pagina** (`loading.tsx` su 10 route): la percezione del TTFB è già mitigata.
- **Paginazione ovunque** (25/pagina), niente liste illimitate → nessun bisogno di virtualizzazione allo stato attuale.
- **Client component disciplinati**: il cumulativo della dashboard è in `useMemo`; i dati arrivano dal server già formattati; la simulazione parte solo su click; `prefers-reduced-motion` rispettato sui grafici.
- **Export CSV a lotti da 1000** con `no-store`.
- **Font self-hosted** via next/font; niente CDN esterne; niente immagini statiche pesanti.
- **Chunking naturale di Turbopack**: papaparse è isolato su /import, i tab del report Macro Desk su /macro-desk/[id], recharts extra di analytics su /analytics — i pesi specifici stanno già sulle route giuste; il problema è solo l'eager loading (P-01/P-03).

## Cosa non ho potuto misurare e come si misurerebbe

1. **TTFB e tempi query reali su produzione (Vercel + Neon)** — il DB di produzione non è accessibile da questa sessione (giustamente). Si misura con: `vercel logs` + Server-Timing header temporaneo attorno ai `Promise.all` delle pagine, oppure `EXPLAIN ANALYZE` delle query di `stats.ts` su un dump realistico. È il numero che decide quanto rende P-04.
2. **LCP / INP / TBT reali** — serve Lighthouse/WebPageTest sul dominio di produzione con un utente loggato (il login demo live non esiste by design). In locale: `npm run start:verify` + Chrome DevTools performance trace sulla dashboard con SIM1 — darebbe il numero vero dell'idratazione (P-06) e del rendering del simulatore a 100 linee (P-07).
3. **Dimensione del payload RSC della pagina Trends** (~50 serie sfoltite) — la rete locale blocca FRED; in produzione si legge dalla tab Network (documento + flight). Se superasse ~300 kB, rafforzerebbe il caso per ridurre i punti per serie.
4. **Latenza FRED a cache fredda in produzione** — un timestamp attorno a `getMacroTrendsData` in un log, il sabato mattina, direbbe quanto vale davvero P-05.
5. **Peso reale degli allegati degli utenti** — la stima P-08 usa il tetto teorico (4 MB × 12); una `SELECT AVG(size), MAX(size), COUNT(*)` su produzione direbbe se il problema è concreto o teorico.
