# Audit funzionale

Data: 31/07/2026 · Auditor: sessione QA dedicata (sola lettura) · Base: working tree su `main` (HEAD `ef55cc0`).

Metodo: lettura integrale di PROGRESS.md (43 fasi + fix), lettura mirata del codice delle aree a rischio (query SQL, scope conto/valuta/demo, timezone, formattazione, server actions, API, aree toccate di recente: equity simulator, COT, sessioni), esecuzione della suite di test. **Nessun file modificato, nessun comando di scrittura su git o sul database.**

Esecuzione test: `npm test` → **1056/1056 verdi** (57 file). I test di integrazione su Postgres si auto-skippano senza `DATABASE_URL` nella shell: non sono stati eseguiti di proposito, per non toccare il DB mentre altre sessioni lavorano in parallelo. La suite di integrazione risulta comunque verde nelle verifiche registrate in PROGRESS.md (31/07).

## Sommario esecutivo

Il codebase è di qualità nettamente sopra la media per un MVP: isolamento per utente sistematico (ogni query passa da `userId` via JOIN o relazione), disciplina Decimal rispettata, doppio `AT TIME ZONE` ovunque serva, parser difensivi con degrado dichiarato, layout persistito tollerante agli id orfani. La maggior parte dei pattern che questo audit cerca (stati vuoti, catch silenziosi, cache stantia) è già gestita.

I problemi trovati si concentrano in **un punto cieco ricorrente: l'interazione tra il filtro periodo e le grandezze che non dovrebbero dipendere dal periodo**. Due bug principali:

1. **Max Drawdown %, Ulcer, Calmar e Score calcolati su una base di equity sbagliata quando il filtro periodo è attivo** (la curva riparte dal saldo iniziale invece che dall'equity a inizio periodo) — la convenzione corretta esiste già nel progetto (Fase 21, rolling) ma non è mai stata riportata sulla dashboard.
2. **Lo scope valuta è derivato dalle valute presenti NEL periodo**, ma governa anche i widget dichiarati "mai filtrati dal periodo" (Saldo conto, mini-calendario, calendario mensile): con più valute e un periodo particolare il Saldo cambia valuta in silenzio, e con un periodo senza trade torna a sommare valute diverse — esattamente ciò che la F6 aveva eliminato.

Il resto sono casi limite e rifiniture. Nessuna falla di isolamento dati trovata. Nessun catch vuoto trovato (`catch {}` assente da tutto `src/`; i catch difensivi loggano sempre).

## Mappa delle route e delle API esaminate

**Pagine (App Router, gruppo `(app)` protetto da layout):**

| Route | File | Note |
|---|---|---|
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | 20+ widget, viste $/%/R/privacy, filtro periodo, scope valuta |
| `/day` | `src/app/(app)/day/page.tsx` | calendario mensile |
| `/day/[date]` | `src/app/(app)/day/[date]/page.tsx` | Day View + journal 3 fasi + allegati |
| `/day/[date]/review` | `.../review/page.tsx` | revisione guidata (W5) |
| `/trades`, `/trades/new`, `/trades/[id]`, `/trades/[id]/edit` | `src/app/(app)/trades/**` | lista filtrata/ordinata, form, dettaglio |
| `/import` | `src/app/(app)/import/**` | wizard CSV 3 passi |
| `/reports` | `src/app/(app)/reports/page.tsx` | breakdown strategia/tag/simbolo/direzione/mese/ora/giorno/sessioni/bias |
| `/reports/settimana` | `.../settimana/page.tsx` | report del venerdì (W3) |
| `/analytics` | `src/app/(app)/analytics/page.tsx` | target R, ora/durata, rolling, metriche pro, equity simulator |
| `/strategies`, `/settings`, `/settings/accounts` | vari | CRUD |
| `/macro-desk`, `/macro-desk/[id]`, `/macro-desk/scorecard`, `/macro-desk/trends` | vari | report macro, scorecard EM, FRED, pannello COT |
| `/notebook` | `page.tsx` | placeholder residuo (v. codice morto) |

**API route:**

| Route | Auth | Note |
|---|---|---|
| `POST /api/macro-desk` | Bearer timing-safe fail-closed | upsert report macro |
| `GET /api/cot-sync` | Bearer `CRON_SECRET` | cron sabato: sync CFTC + box contesto |
| `GET /api/attachments/[id]` | sessione + `userId` nel where | unica query che seleziona i byte |
| `GET /api/export/trades` | sessione | CSV con stessi filtri della Trade View, cursore a lotti |
| `/api/auth/[...nextauth]` | Auth.js | credenziali rate-limited dentro `authorize` |

**Server actions:** `src/server/{trades,accounts,strategies,notes,attachments,settings,auth-actions,import,mt5}.ts` — tutte con `requireUserId()` e filtro `userId` nel where; scritture su conto demo bloccate sia dal filtro userId sia da guardie esplicite (`isDemo: false`, `assertWritableAccount`).

**Moduli chiave letti:** `lib/queries/{stats,reports,analytics,cot-panel}.ts`, `lib/{active-account,demo-account,currency-scope,period,trade-filters,dates,money,calendar}.ts`, `lib/metrics/{drawdown,monthly-returns,equity-simulator}.ts`, `lib/{cot-sync,mt5-watcher,macro-trends}.ts`, `components/dashboard/dashboard-view.tsx` (mirato), `components/analytics/equity-simulator.tsx`.

## Bug confermati

### [B-01] Max Drawdown %, Ulcer, Calmar e Score usano il saldo iniziale come equity di partenza anche col filtro periodo attivo
- Severità: **P1** (percentuali e score sbagliati in una condizione d'uso normalissima; i valori in $ restano corretti)
- Dove: [dashboard/page.tsx:225](src/app/(app)/dashboard/page.tsx) (`maxDrawdown(daily, baseBalance)`), righe 333-337 (`calmarRatio`, `ulcerIndex`), 352 (`underwaterSeries`), 234 (`compositeScoreParts` via `dd.maxDrawdownPct`); [drawdown.ts:22](src/lib/metrics/drawdown.ts)
- Come si riproduce: conto con storico lungo e P&L cumulato rilevante (es. SIM1: saldo iniziale 50.000, P&L ~+71.700, equity ~121.700). Applicare un filtro periodo (es. "Ultimi 30 giorni") e guardare Max Drawdown %, Ulcer, Calmar e lo Score.
- Comportamento attuale: `daily` contiene solo i giorni del periodo, ma la curva di equity parte da `baseBalance` = somma dei saldi INIZIALI. Un drawdown di 5.000 nel periodo viene rapportato a un picco di ~50.000+P&L del periodo, invece che a ~121.700: la percentuale risulta più che raddoppiata. A cascata: Ulcer gonfiato, Calmar deflazionato (denominatore DD% gonfiato, e anche il numeratore usa `daily`+`baseBalance`), componente "risk" dello Score penalizzata, curva underwater esagerata.
- Comportamento atteso: equity di partenza del periodo = saldo iniziale + P&L chiuso PRIMA di `period.from` — la convenzione che il progetto stesso ha adottato in Fase 21 per le rolling metrics (`getNetPnlBefore`, motivata in PROGRESS.md con "senza quel pezzo ogni ritorno risulterebbe gonfiato") e in Fase 27 per il calendario mensile.
- Causa nel codice: `getStartingBalance` restituisce i saldi iniziali e ignora (correttamente) il periodo; nessuno somma il P&L pre-periodo prima di passarlo a `maxDrawdown`/`ulcerIndex`/`calmarRatio`/`underwaterSeries`. Il difetto è nato in FASE 5 quando il filtro periodo è stato aggiunto sopra le metriche di FASE 4, e non è dichiarato da nessuna parte come scelta.
- Proposta di fix: in `dashboard/page.tsx` calcolare `equityStart = baseBalance + getNetPnlBefore(filter, period.from)` (query già esistente) e passarlo alle quattro funzioni al posto di `baseBalance`. Le firme non cambiano.
- Costo: S · Rischio di regressione: basso (i golden test su "tutto lo storico" restano identici: senza `from` il correttivo è zero)

### [B-02] Lo scope valuta dei widget "mai filtrati dal periodo" dipende dal periodo; con periodo vuoto si torna a sommare valute diverse
- Severità: **P1** (numero di denaro sbagliato/mescolato in un caso limite; scivolamento silenzioso di valuta in un caso comune)
- Dove: [dashboard/page.tsx:112-123](src/app/(app)/dashboard/page.tsx) (`getCurrencyBreakdown(baseFilter)` con `from/to` del periodo → `resolveCurrencyScope`), poi 174 (`getLifetimeNetPnl(filter)`), 173 (`getStartingBalance(filter)`), 146-152 (mini-calendario), 215-219 (calendario mensile); [currency-scope.ts:25](src/lib/currency-scope.ts)
- Come si riproduce (caso A — somma cross-valuta): utente con conti USD e EUR (il seed demo è così), "Tutti i conti", filtro periodo su un intervallo SENZA trade (es. range custom su una settimana di ferie). `currencyTotals` è vuoto → `scope.active` è `undefined` → `getStartingBalance` e `getLifetimeNetPnl` girano senza vincolo di valuta.
- Comportamento attuale (caso A): "Saldo conto" = somma dei saldi iniziali USD+EUR + P&L storico USD+EUR sommati nominalmente, etichettata con la valuta base dell'utente. È esattamente la somma "fasulla" che la F6 (Fase premium 2) dichiara eliminata ovunque. Stessa base mista finisce nel calendario mensile (`monthlyReturnGrids`) e nel mini-calendario.
- Come si riproduce (caso B — scivolamento di valuta): stesso utente, periodo che contiene SOLO trade EUR (es. un mese in cui ha operato solo sul conto EUR). `totals = [EUR]` → `multi: false` → nessun selettore, `scope.active = "EUR"`.
- Comportamento attuale (caso B): il "Saldo conto" — che per contratto "non deve mai dipendere dal periodo" (fix post-secondo audit, 16/07) — cambia silenziosamente perimetro: mostra saldo iniziale + P&L storico dei SOLI conti EUR, senza che nulla in UI segnali che i conti USD sono spariti. Cambiando il periodo il saldo "balla".
- Comportamento atteso: la valuta attiva dei widget lifetime (Saldo, mini-calendario, calendario mensile) va risolta sulle valute presenti in TUTTO lo storico dello scope conto, non nel periodo; il selettore valuta può continuare a riflettere il periodo per le metriche di periodo.
- Causa nel codice: un solo `getCurrencyBreakdown(baseFilter)` (con `from/to`) alimenta sia le metriche di periodo sia i widget lifetime.
- Proposta di fix: seconda chiamata `getCurrencyBreakdown({ userId, accountId })` senza periodo per risolvere lo scope dei widget lifetime (o riuso della prima quando il periodo è "all"); in alternativa, con periodo senza trade, fallback dello scope sulle valute lifetime invece che su `undefined`.
- Costo: S/M · Rischio di regressione: basso-medio (va deciso quale scope vince quando i due divergono; il caso "una sola valuta ovunque" — la maggioranza degli utenti — è indifferente)

### [B-03] Report settimanale: il confronto con la settimana precedente usa lo scope valuta della settimana corrente
- Severità: **P2**
- Dove: [reports/settimana/page.tsx:111-114](src/app/(app)/reports/settimana/page.tsx) (`prevFilter = { ...filter, ...bounds(prevMonday) }` con `currency: scope.active` risolta sui trade della settimana corrente)
- Come si riproduce: utente multi-valuta; settimana corrente con soli trade USD, settimana precedente con soli trade EUR.
- Comportamento attuale: `prevAgg` viene filtrato su USD → risulta 0 trade; i delta ("+X vs settimana precedente") dicono che la settimana prima non si è operato, mentre si è operato in un'altra valuta. Con periodo corrente senza trade, `scope.active` è `undefined` e il confronto somma valute diverse (variante di B-02).
- Comportamento atteso: dichiarare in pagina che il confronto è a parità di valuta (ed etichettare la valuta), oppure risolvere lo scope sull'unione delle due settimane.
- Causa nel codice: riuso dello scope di una finestra per l'altra.
- Proposta di fix: `getCurrencyBreakdown` sull'unione delle due settimane, o nota esplicita in pagina.
- Costo: S · Rischio di regressione: basso

### [B-04] Equity Curve Simulator: il separatore delle migliaia italiano viene letto come decimale ("50.000" → 50)
- Severità: **P2** (grafico plausibile ma completamente sbagliato, senza alcun errore)
- Dove: [equity-simulator.tsx:86-88](src/components/analytics/equity-simulator.tsx) (`parseNum` = `Number(value.replace(",", "."))`)
- Come si riproduce: in `/analytics`, campo "Start Equity", digitare `50.000` (grafia italiana per cinquantamila, coerente con tutto il resto dell'app che formatta it-IT) e premere Start simulation.
- Comportamento attuale: `Number("50.000")` = 50 → la simulazione parte da 50 unità di valuta senza avviso; con `1.500` in un campo rischio "importo" si rischia 1,5. Inoltre `replace` sostituisce solo la PRIMA virgola: `1,234,5` → NaN → simulazione nulla (qui almeno il form non disegna).
- Comportamento atteso: input it-IT gestito (punto = migliaia quando seguono 3 cifre e c'è anche una virgola, o parsing con `Intl`-aware) oppure vincolo esplicito del formato con validazione che rifiuti l'ambiguo.
- Causa nel codice: parse "tollerante alla virgola" che però dà al punto il significato anglosassone in un'app interamente it-IT.
- Proposta di fix: normalizzazione a due passi (rimuovere i punti di raggruppamento quando è presente una virgola decimale; `replaceAll` per le virgole) + test.
- Costo: S · Rischio di regressione: basso

### [B-05] Con filtro periodo attivo e più di 12 posizioni aperte, il conteggio "posizioni aperte" è silenziosamente troncato
- Severità: **P3**
- Dove: [dashboard/page.tsx:180-194](src/app/(app)/dashboard/page.tsx) (`take: 12`), 276 (`openTrades: openTradeRows.length`)
- Come si riproduce: 13+ trade OPEN nello scope (raro nel target d'uso, possibile con sync MT5 e swing multi-strumento).
- Comportamento attuale: il widget elenca 12 righe (accettabile) ma anche il CONTEGGIO `openTrades` — usato come numero, non come lista — vale al massimo 12.
- Comportamento atteso: conteggio da `prisma.trade.count`, lista limitata a 12 con nota "prime 12".
- Proposta di fix: aggiungere il `count` alla `Promise.all`.
- Costo: S · Rischio di regressione: basso

### [B-06] Modifica trade: più note TRADE vengono fuse in una sola alla prima modifica
- Severità: **P3** (nessuna perdita di testo, ma perdita di struttura e date senza avviso)
- Dove: [trades/[id]/edit/page.tsx:89](src/app/(app)/trades/[id]/edit/page.tsx) (`notes.map(...).join("\n\n")`), [server/trades.ts:177](src/server/trades.ts) (`deleteMany` di tutte le note TRADE + ricreazione di una sola)
- Come si riproduce: fare la revisione guidata di un trade aggiungendo una nota (la review CREA una seconda nota TRADE, `reviewTradeAction`), poi aprire "Modifica" e salvare senza toccare nulla.
- Comportamento attuale: le due note diventano una sola con `createdAt` nuovo; la provenienza (nota d'origine vs nota di revisione) sparisce.
- Comportamento atteso: o il form dichiara che le note verranno unificate, o l'update preserva le note esistenti quando il campo non è stato toccato.
- Causa nel codice: il form ha un solo campo note ma il modello ne ammette N per trade (e la review ne aggiunge).
- Proposta di fix: minima — testo informativo nel form; robusta — non toccare le note se il valore coincide col merge iniziale.
- Costo: S · Rischio di regressione: basso

### [B-07] Upload allegato di fase: se il file fallisce il ricontrollo dimensione, resta una nota vuota orfana (icona journal sul calendario senza contenuto)
- Severità: **P3**
- Dove: [server/attachments.ts:84-105](src/server/attachments.ts) (upsert della Note contenitore) vs 120-125 (ricontrollo `size` sui byte DOPO l'upsert)
- Come si riproduce: caricare in una fase del journal un file il cui `size` dichiarato passa la prima validazione ma i byte ricevuti superano il limite (o upload troncato); nessun altro contenuto per quel giorno.
- Comportamento attuale: la Note DAILY vuota creata come contenitore resta nel DB; il calendario (`/day`) mostra l'icona "Nota di giornata" su un giorno senza testo né allegati.
- Comportamento atteso: creare la nota contenitore solo a upload riuscito (o cancellarla se vuota e senza allegati in caso di errore).
- Proposta di fix: spostare l'upsert della nota dopo il ricontrollo dei byte, dentro la stessa transazione della `attachment.create`.
- Costo: S · Rischio di regressione: basso

### [B-08] Cambio valuta di un conto con trade esistenti: tutto lo storico viene rietichettato senza avviso
- Severità: **P3** (comportamento scorretto in un caso limite; l'azione è dell'utente ma le conseguenze non sono dichiarate)
- Dove: [server/accounts.ts:54-83](src/server/accounts.ts) (`updateAccountAction` accetta `currency` senza vincoli), dialog conti
- Come si riproduce: conto USD con 100 trade → Impostazioni → modifica conto → valuta EUR → salva.
- Comportamento attuale: tutti i P&L storici (numericamente invariati) vengono mostrati come EUR ovunque (la valuta è sempre letta da `account.currency`); i totali per valuta della dashboard cambiano retroattivamente. Nessuna conversione, nessun avviso.
- Comportamento atteso: avviso esplicito ("i trade esistenti verranno mostrati in EUR senza conversione") o blocco del cambio valuta a conto non vuoto.
- Proposta di fix: conferma nel dialog quando il conto ha trade.
- Costo: S · Rischio di regressione: basso

## Sospetti da verificare

Questi non ho potuto confermarli senza eseguire l'app o l'ambiente di produzione.

- **[S-01] Watcher MT5 su Vercel**: `startMt5Watcher` parte da `instrumentation.ts` con `setInterval` da 10s. Su serverless (Fluid Compute incluso) l'istanza può essere congelata/ruotata tra le richieste: il polling non è garantito, e comunque i `filePath` sono percorsi locali della macchina dell'utente, illeggibili dal server Vercel. Il risultato plausibile in produzione è una sorgente perennemente su "file non trovato (in attesa dell'EA)" senza che la UI spieghi che il sync MT5 funziona solo self-hosted/locale. Da verificare sul deployment reale; se confermato, basta una nota nella card Impostazioni → Sync MT5.
- **[S-02] Rate limiting per-istanza**: `rate-limit.ts` è in-memory e il modulo stesso dichiara che su serverless il tetto è per-istanza. Con più istanze calde il limite effettivo su login/registrazione è N×10/15min. Documentato nel modulo, non nel deploy: verificare se è accettabile per il profilo di rischio.
- **[S-03] MIME degli allegati fidato dal client**: `attachmentFileSchema` valida `file.type` dichiarato dal browser, non i magic bytes. Un file qualunque rinominato `.png` con type forgiato viene servito `inline` con quel Content-Type. I tipi ammessi (immagini/PDF) non includono `text/html`, quindi il rischio XSS è basso, ma un PDF malformato servito inline al proprietario resta possibile. Verifica: provare l'upload con `curl` forgiando il type.
- **[S-04] `formatPercentOfBase` in vista % col filtro periodo**: divide il P&L del periodo per il saldo INIZIALE (dichiarato in FASE 5 come convenzione), non per l'equity a inizio periodo. Dopo il fix di B-01 le due convenzioni convivrebbero a schermo: da riconsiderare insieme, ma è una scelta documentata, non la conto come bug.
- **[S-05] Fingerprint dedup import CSV con fee diverse**: la chiave esclude la fee di proposito; due righe identiche con fee diverse (re-export dello stesso broker con commissioni corrette a posteriori) vengono considerate duplicate e skippate di default. C'è l'opt-in "Importa comunque", quindi è mitigato; verificare che il caso sia chiaro nel warning.

## Codice morto / residui delle fasi precedenti

- **`/notebook`** ([notebook/page.tsx](src/app/(app)/notebook/page.tsx) + [page-placeholder.tsx](src/components/layout/page-placeholder.tsx), usato solo lì): la voce di sidebar è stata rimossa in F3 ma la route resta raggiungibile a mano e indicizzabile internamente. Deliberato a metà (PROGRESS: "la pagina è ancora un placeholder post-MVP") — o si rimuove la route o si tiene: oggi è l'unico consumatore di `PagePlaceholder`.
- **`prodNet` di `CotWeek`**: seminato e sincronizzato dal job, ma mai letto dal pannello ([queries/cot-panel.ts](src/lib/queries/cot-panel.ts) seleziona solo `mmNet`/`openInterest`). Coerente con la pre-registrazione (il pannello mostra 2 metriche), però il dato viaggia ogni settimana: da annotare come "riserva per usi futuri" nel modulo, per non farlo sembrare un buco.
- **`commit-message.txt`** in root (untracked): residuo di lavorazione di un'altra sessione, non del codice — segnalo solo perché comparirà nei `git status` di tutti.
- Verificati e NON morti (residui intenzionali documentati): `metrics/monte-carlo.ts` (vive per `mulberry32`), `macro-desk-scorecard.ts` (vocabolario asset per la scorecard EM), token CSS `--md-cross` (usato da Liquidità), `bias-gauge.tsx` (usato da report-tabs).

## Copertura dei test: cosa manca sulle funzioni critiche

La copertura dei moduli puri è eccellente (una formula per file, casi degeneri inclusi). I buchi sono tutti nel LEGANTE tra query e pagina:

1. **`resolveCurrencyScope` × periodo** — il modulo è testato da solo, ma nessun test copre l'interazione che produce B-02/B-03 (periodo senza trade → scope `undefined` → query senza vincolo di valuta). Un test di integrazione "utente bi-valuta, periodo vuoto, il saldo non somma mai" avrebbe intercettato il bug.
2. **Assemblaggio dashboard** (`dashboard/page.tsx`) — ~200 righe di composizione (basi delle percentuali, serie passate alle metriche) senza alcun test: è qui che vive B-01, non nei moduli (tutti testati e corretti singolarmente). Anche un solo test di integrazione "DD% con `from` attivo = DD% sulla curva che parte dall'equity di inizio periodo" fisserebbe la convenzione.
3. **`parseNum` dell'equity simulator** (client) — nessun test; B-04 è esattamente il tipo di regressione che un test da 5 righe blocca.
4. **`caricaPannelloCot`** — il degrado difensivo (tabella mancante → pannello vuoto) non ha test; è il tipo di ramo che si rompe in silenzio a una rinomina di colonna.
5. **`mt5-watcher.ts`** — nessun test diretto (la logica di import è estratta e testata, il ciclo file/snapshot no). Accettabile, ma da dichiarare.
6. I test di integrazione dipendono da un DB locale seminato: girano solo dove `DATABASE_URL` è impostata. Non è un difetto, ma il CI di build (`npm run build` su Vercel) non li esegue: la protezione reale è solo locale.

## Minori

- **Day View, card "Qualità del giorno"**: `formatRMultiple(pf).slice(0, -1)` per togliere la "R" è fragile (dipende dal formato della funzione); e con conto singolo senza trade il sottotitolo mostra la valuta al posto del nome del conto (`trades[0]?.account.name ?? currency`).
- **Export CSV**: il nome file usa la data UTC (`new Date().toISOString()`), non il fuso utente: un export della sera italiana può chiamarsi col giorno prima. Solo cosmetico.
- **`/api/export/trades`**: con il conto demo attivo l'export è consentito (scelta dichiarata) ma il nome file non distingue il demo: un utente può confondere il CSV SIM1 col proprio.
- **Calendario `/day`**: le settimane a cavallo di mese sommano solo i giorni del mese visualizzato (documentato in FASE 6, ripetuto qui solo perché a schermo non è dichiarato).
- **Sequenza trade dashboard**: `sequenceTruncated` confronta con `agg.total` — corretto — ma la nota "ultimi 200" non compare in Trade View dove la stessa card usa i filtri Prisma senza limite testuale equivalente (lì il limite non c'è: coerente, nessuna azione).
- **`weekLabel` del report settimanale**: l'anno mostrato è quello della domenica; la settimana 29/12/2025–04/01/2026 viene etichettata "29 dicembre – 4 gennaio 2026" senza l'anno del lunedì. Ambiguo un giorno all'anno.
- **`formatSignedShort`**: oltre il miliardo mostra "1000M" (6 caratteri, oltre il budget di 5 dichiarato). Irrealistico per il target, lo segnalo per completezza.
- **Login/registrazione**: l'enumerazione email in registrazione resta possibile (messaggio "email già registrata"), mitigata dal rate limit 5/15min — già nel backlog dichiarato del progetto, non lo conto come nuovo.

## Cosa è solido

Aree esaminate a fondo e risultate pulite:

- **Isolamento per utente**: ogni query SQL passa da `a."userId" = $userId` via JOIN (`whereClosedTrades`/`FROM_TRADES`); ogni query Prisma da `tradeAccountWhere`/relazione `account: { userId }`; le action verificano l'ownership prima di scrivere (`updateMany({ where: { id, userId } })` ovunque). Un `accountId` altrui nel cookie viene neutralizzato da `resolveTradeScope` (fallback su "tutti i conti"), un id altrui nelle action produce "non trovato". L'endpoint allegati filtra per `userId` nell'unica query che tocca i byte. Non ho trovato alcun percorso che restituisca dati di un altro utente.
- **Conto demo SIM1**: il seam a userId di sistema è corretto e verificato: mai dentro "Tutti i conti", scritture bloccate a due livelli, artefatti personali (journal/allegati/layout) sempre dell'utente vero anche in scope demo (verificato su calendario, Day View, allegati).
- **Timezone**: doppio `AT TIME ZONE` sistematico su tutti i bucketing (giorni, settimane, mesi, ore, sessioni, bias del giorno); `zonedInputToUtc` col doppio passaggio DST e rifiuto delle date inesistenti; convenzione closedAt/openedAt coerente e dichiarata nei punti in cui diverge (drill-down F31). I trade a cavallo di mezzanotte hanno test di integrazione dedicati.
- **Decimal**: nessun `Number` nei calcoli di denaro trovato fuori dai formatter display-only (`money.ts`, `dates.ts`) e dai due moduli di simulazione che dichiarano il float come scelta.
- **Gestione errori esterni**: FRED con `Promise.allSettled` e card in errore per serie; COT sync che non lancia mai, con guardia rinomina contratto e soglia di staleness; pannello COT difensivo con degrado a vuoto e log; parser Macro Desk che scarta il malformato conservando il valido. **Zero catch vuoti in tutto `src/`.**
- **Preferenze salvate**: `parseDashboardLayout` filtra gli id sconosciuti dalla Fase 26 (widget rimossi non azzerano più il layout); cookie tema/accento/palette validati contro enum sia in scrittura sia in lettura (un cookie manomesso ricade sul default); cookie conto validato a ogni richiesta.
- **Formattazione**: it-IT coerente (virgola decimale, percentuali, R, prezzi per asset class); segni espliciti; `formatPercentSmall` distingue 0 esatto da "< 0,01%"; colori sempre dal segno reale.
- **Stati vuoti**: empty state dedicati e distinti (nessun trade vs nessun match dei filtri; onboarding per utente nuovo; mese/periodo vuoto; gate onesti "dati insufficienti (N/soglia)" su SQN/Calmar/rolling/Kelly invece di numeri su campioni ridicoli).
- **Coerenza tra pagine** (verificata sulle definizioni delle query): dashboard, reports, calendario e Day View consumano gli stessi frammenti SQL (`whereClosedTrades`, `AGGREGATE_COLUMNS`) e gli stessi moduli metrics — la somma dei breakdown coincide col Net P&L per costruzione, il totale giorno della Day View con la cella del calendario per costruzione. Le divergenze volute (openedAt in Trade View) sono commentate nel codice.
