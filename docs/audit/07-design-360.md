# Referto di design 360 — L&B TradingSpace

> **Voto globale: 57 / 100.** Un prodotto che funziona e che è onesto con i propri numeri, ma che visivamente non è ancora professionale. Il difetto non è una pagina brutta: sono **tre sistemi visivi cuciti insieme** (quattro caratteri, due palette, tre ambienti di tema, sei navigazioni a schede, otto controlli segmentati). A questo si aggiungono stati di sistema rotti e numeri che non si allineano.

| | |
|---|---|
| Data | 14/09/2026 |
| Base | `origin/main` @ `417abe7` — worktree `C:/wt/design-audit`, branch `audit/design-360` |
| Metodo | build di produzione locale (`next build` + `scripts/start-local.mjs`, porta 3217) su Postgres Docker locale, dati demo; screenshot via Chrome headless/CDP; misure nel DOM; analisi statica; benchmark esterno; proposte in Claude Design |
| Prove | 204 immagini in [`design-2609/`](design-2609/) (50 MB): 32 schermate × 3 larghezze × 2 temi, 8 stati di caricamento, 4 tavole di Claude Design |
| Cosa NON è stato fatto | nessuna riga di codice dell'app modificata, nessuna scrittura su database (né locale né Neon), nessun seed, nessun push o deploy |

---

## Indice

1. [Sintesi: voti, i tre problemi peggiori, le tre azioni a maggior ritorno](#1-sintesi)
2. [F0 — Inventario delle rotte e del sistema visivo](#2-f0--inventario)
3. [F1 — Prove visive e limiti del rilievo](#3-f1--prove-visive-e-limiti)
4. [F2 — Metro esterno](#4-f2--metro-esterno)
5. [F3 — Rubrica, voti per criterio e per sezione](#5-f3--rubrica-e-voti)
6. [F4 — Direzione visiva con Claude Design](#6-f4--direzione-visiva-con-claude-design)
7. [F5 — Piano di miglioramento in tre onde](#7-f5--piano-di-miglioramento)
8. [Autocritica](#8-autocritica)

---

## 1. Sintesi

### Voti per sezione

| # | Sezione | Peso d'uso | Voto |
|---|---|---:|---:|
| S16 | Macro Desk · Report (indice e dettaglio) | 6 | **41,8** |
| S7 | Analytics | 8 | **48,2** |
| S17 | Macro Desk · Scorecard | 2 | **51,6** |
| S6 | Reports e report periodico | 7 | 54,3 |
| S12 | Macro Desk · Driver | 5 | 54,6 |
| S5 | Trade: dettaglio, nuovo, modifica | 8 | 54,7 |
| S13 | Macro Desk · Trends | 4 | 55,9 |
| S10 | Macro Desk · indice | 3 | 56,2 |
| S18 | Macro Desk · Radar | 2 | 56,9 |
| S2 | Dashboard | 12 | 59,8 |
| S3 | Calendario, giorno, revisione | 9 | 59,9 |
| S9 | Strategie, impostazioni, conti | 4 | 60,4 |
| S15 | Macro Desk · Calendario | 4 | 60,8 |
| S4 | Trade View (lista) | 10 | 62,0 |
| S11 | Macro Desk · Volatilità | 6 | 62,3 |
| S14 | Macro Desk · Stagionalità | 5 | 62,7 |
| S8 | Import CSV | 3 | 63,7 |
| S1 | Accesso (login, registrazione) | 2 | 69,3 |
| | **Globale** = Σ(peso × voto) / 100 | 100 | **57,1** |

Nessuna sezione supera 70. Le due sezioni che il proprietario considera riuscite meglio si dividono:

- **Stagionalità** è davvero fra le migliori (62,7, seconda dopo Import e Accesso, che sono pagine semplici).
- **Driver** sta nella metà bassa (54,6). È curato nei dettagli, ma a 390px i grafici diventano illeggibili, in tema chiaro resta un'isola scura e metà della pagina è prosa.

### I tre problemi peggiori

1. **Non c'è un sistema, ce ne sono tre.**
   - Caratteri: l'app usa Geist, il Macro Desk usa Inter + JetBrains Mono, dichiarati di nuovo in 8 pagine.
   - Palette: l'app è in oklch, il desk in hex.
   - Tema:
     - Trends, Driver e Stagionalità restano scuri anche in tema chiaro. Per Trends questo va contro il commento di `listino.css:4-6`.
     - Volatilità, Radar e Scorecard seguono il tema.
     - Il Calendario del desk ha un quarto ambiente con le scatole.
   - Componenti duplicati:
     - navigazione a schede: 6 implementazioni
     - controlli segmentati: 8
     - meccanismi di spiegazione: 4
     - componenti di stato vuoto: 5
     - helper del colore del segno: 7

   Voto di C7 Coerenza: **54,8**.

2. **I numeri non si leggono come in un prodotto finanziario.**
   - Le tabelle dell'app non attivano le cifre tabulari. Misurato nel DOM: `font-variant-numeric: normal`, e in Geist «1111111111» è largo 69,6px contro 134,4px di «0000000000».
   - Nella stessa tabella la Qty esce «0.99» col punto accanto a prezzi «1,10234».
   - Il formato it-IT non raggruppa le migliaia a 4 cifre: «2753,00» sta sopra «20.777,50».
   - Il Report periodico scrive «-260.24 EUR».
   - Nel Listino 89 elementi stanno sotto gli 11px, e il grigio delle intestazioni ha contrasto 4,00–4,25:1, sotto AA.

3. **Gli stati di sistema e il mobile sono rotti.**
   - La 404 è quella di Next, in inglese. In tema scuro è testo nero su fondo quasi nero e trascina anche il selettore conto della topbar.
   - A 390px tre pagine si allargano oltre lo schermo: Calendario a 449px, dettaglio trade a 466px, Report periodico a 627px.
   - Analytics è lunga 11.922px e un Report giornaliero 10.079px.
   - `/macro-desk/report` genera l'errore React #418 (idratazione).

### Le tre azioni a maggior ritorno

1. **Pacchetto P0 da ~10 ore:**
   - `not-found.tsx` in italiano e theme-aware;
   - `flex-wrap` sulle tre testate che sbordano a 390px;
   - `tabular-nums` di default in `TableCell`;
   - un formatter unico per quantità e delta (con `useGrouping: "always"`).

   Rimuove tutte le rotture visibili a un primo sguardo: +6 punti stimati.
2. **Un sistema solo (~26 ore):**
   - token del desk sugli stessi valori dell'app;
   - Geist e Geist Mono ovunque;
   - scala tipografica a sei gradini con minimo 11px;
   - una testata di pagina unica;
   - navigazione del Macro Desk a schede su una riga (il primo dato sale da ~470px a ~150px).

   È la [tavola di sistema](https://claude.ai/design/p/d3b88e06-0946-4bab-b4e9-ad1d8bde564f?file=Sistema+visivo.dc.html).
3. **Rifare Report MD e Analytics** secondo le proposte 1a/1b e 3a/3b (24–48 ore). Sono le due sezioni più basse e insieme pesano 14 punti d'uso su 100.

---

## 2. F0 — Inventario

### 2.1 Rotte e schermate

| Area | Rotta | Ambiente visivo | Segue il tema | Loading proprio |
|---|---|---|---|---|
| Accesso | `/login`, `/register` | shadcn + alone sfumato `(auth)/layout.tsx:13-27` | sì | — |
| Dashboard | `/dashboard` | shadcn | sì | sì |
| Journal | `/day` (calendario), `/day/[date]`, `/day/[date]/review` | shadcn | sì | sì / sì / eredita |
| Trade | `/trades`, `/trades/[id]`, `/trades/new`, `/trades/[id]/edit` | shadcn (`max-w-4xl` sul dettaglio) | sì | sì / eredita |
| Reports | `/reports`, `/reports/settimana` | shadcn (`max-w-3xl` sul periodico) | sì | sì / eredita |
| Analytics | `/analytics` | shadcn | sì | sì (a card generiche) |
| Import | `/import` | shadcn `max-w-4xl` | sì | globale |
| Impostazioni | `/strategies`, `/settings`, `/settings/accounts` | shadcn `max-w-3xl`/`2xl`/`3xl` | sì | globale |
| Macro Desk | `/macro-desk` (indice a schede) | shadcn | sì | sì |
| | `/macro-desk/volatilita` | `.md-listino` | sì | **no** |
| | `/macro-desk/driver` | `.macro-report` (scuro fisso) | **no** | **no** |
| | `/macro-desk/trends` | `.macro-report` (scuro fisso) | **no** | sì (chiaro, poi blocco scuro) |
| | `/macro-desk/stagionalita` (e il redirect `/stagionalita`) | `.macro-report` (scuro fisso) | **no** | sì |
| | `/macro-desk/calendario` | `.md-calendario` (listino con scatole) | sì | sì (a tabella su pagina a card) |
| | `/macro-desk/report` | shadcn | sì | sì |
| | `/macro-desk/[id]` (dettaglio report, schede Asset/News) | `.md-listino` | sì | sì |
| | `/macro-desk/scorecard` | `.md-listino` | sì | sì |
| | `/macro-desk/radar` | `.md-listino` | sì | sì |
| Stati | 404 (`notFound()` in `trades/[id]`, `day/[date]`, `macro-desk/[id]`) | **pagina di default di Next** | no | — |
| | errore (`src/app/(app)/error.tsx`, unico) | shadcn | sì | — |

Due sezioni citate nell'incarico **non esistono come schermata su `417abe7`**:

- **AI Analyst**: resta solo un commento in `src/lib/validations/macro-desk.ts:282`.
- **Posizionamento/COT**: rimossa, lo dicono `section-nav.tsx:25-28` e `macro-desk/page.tsx:36-37`. Resta però un riferimento visibile in `driver-desk-panel.tsx:407` («soglie del pannello di posizionamento»).

La Volatilità c'è ed è valutata come S11.

### 2.2 Sistema visivo esistente

| Elemento | Com'è oggi | Evidenza |
|---|---|---|
| Caratteri | Geist + Geist Mono (app), Inter + JetBrains Mono (desk, `next/font` dichiarato in 8 pagine) | `app/layout.tsx:18-26`; es. `volatilita/page.tsx:25-34`, `driver/page.tsx:21-30` |
| Scala tipografica | App: `.page-title` 24, `.stat-value-hero` 24/30, `.stat-value` 20, corpo 14, `text-2xs` 11. Desk: 8,5 · 9 · 9,5 · 10 · 11 · 12 · 12,5 · 13 · 14 · 15px | `globals.css:348-367`; `listino.css:201,229,243,330`; misura DOM: 12 taglie in Volatilità |
| Palette | App in oklch con contrasti calcolati e annotati (il punto più solido dell'intero sistema); desk in hex, due set (`.macro-report` scuro, `.md-listino` chiaro/scuro) | `globals.css:85-188`, `:377-411`; `listino.css:46-115` |
| Colori P&L | `text-profit/loss/breakeven` nell'app, `--md-up/--md-down` nel desk: il verde «su» vale `oklch(0.75 0.175 158)`, `#2fd67a`, `#0f7a4e`, `oklch(0.525 0.123 158)` a seconda della pagina | come sopra |
| Raggi | Token `--radius` 10px nell'app; 18/13/9px in `.macro-report`; 0/0/2px in `.md-listino`. Misurati nel DOM: 2, 4, 8, 9, 10, 13, 14, 18, 26px e pillole | `globals.css:63-69,413-415`; `listino.css:78-80` |
| Ombre | Tre famiglie: `--shadow-card/raised/overlay`, `--md-shadow`, ombre per tema di `.md-calendario` | `globals.css:80-82,417-422`; `listino.css:154-168` |
| Spaziatura | Scala Tailwind; `main` con `p-6` fisso a ogni larghezza; 8 larghezze massime di pagina diverse | `(app)/layout.tsx:88`; grep `max-w-*` in `src/app/(app)` |
| Tabelle | `ui/table` (righe 37–38px, 14px, **senza** cifre tabulari); `.ml-tab` (25–28px, JetBrains 12px, tabulari); `<table>` grezze in Analytics (5 file) e Stagionalità (righe 53px) | misura DOM; `ui/table.tsx:81-91`; `listino.css:219-281` |
| Card | `Card` shadcn; `.md-card`/`.md-card-2`, appiattite dal listino; `StatCard`, copia a mano in `day/[date]`, `StatBox` in Analytics | `dashboard-view.tsx:323-365`; `day/[date]/page.tsx:323-381`; `analytics/page.tsx:151-190` |
| Navigazione di sezione | Griglia 3+2 di pillole `Button` + «Radar» sotto un filo; nel DOM finisce a 280–300px dall'alto | `section-nav.tsx:180-257`; misura `navBottom` |
| Spiegazioni | `MetricInfo` (Popover, 24px), `Info` del listino (13px, click), Radix `Tooltip`, 65 `title=` nativi, 5 stili di `<details>` | `metric-info.tsx:174-257`; `listino/info.tsx:27-70` |

### 2.3 Incoerenze strutturali (visibili già dall'inventario)

1. **Tre ambienti di tema nel Macro Desk.** Trends è scuro fisso (`trends/page.tsx:111`) contro quanto dichiarato in `listino.css:4-6` («restano solo Driver e Stagionalità»).
2. **`.md-panel` non è definita in alcun CSS**, ma è usata in `stagionalita/page.tsx:463,813`, `bucket-window-table.tsx:129` e `riepilogo-adesso.tsx:74`.
3. **`BandaImpegno` usa i token `--md-*` fuori dal contenitore che li definisce** (`scorecard/page.tsx:74` sta prima del `.md-listino` di `:78`): bordo, fondo e raggio non si risolvono.
4. **Indice e dettaglio del Report parlano due lingue.** L'indice è shadcn con `text-profit` (`report/page.tsx:98,250`), il dettaglio è listino con `--md-up` e non ha la barra delle sezioni (`[id]/page.tsx:145-171`).
5. **Verde e rosso del P&L usati per significati che non sono un segno:**
   - LONG/SHORT: `trades/page.tsx:311,405`, `day/[date]/page.tsx:483`, `trades/[id]/page.tsx:305,315`, `reports/page.tsx:609,656,670`;
   - conteggi della Scorecard;
   - «direzione buona» in Trends (`trends-view.tsx:76-82`).
6. **Il warning esiste in quattro forme:** `--warning`, `amber-*` (`banda-freschezza.tsx:20-23`), `--md-warn`, rgba scritto a mano (`trends-view.tsx:124-125`).
7. **Nessun `not-found.tsx`** in tutto `src/app`.
8. **Skeleton che non somigliano al contenuto:**
   - le card arrotondate chiare di Trends precedono un blocco scuro senza scatole;
   - il Calendario ha uno skeleton a tabella su una pagina a card;
   - Volatilità e Driver ereditano lo skeleton a griglia dell'indice.
9. **42 `text-[Npx]` arbitrari**, 22 dei quali a 11px (esiste `text-2xs`), contro la regola scritta in `globals.css:17-19`.
10. **Formattatori duplicati:**
    - `trimZeros` copiato in tre pagine: `trades/page.tsx:474`, `trades/[id]/page.tsx:54`, `trades/[id]/edit/page.tsx:10`;
    - `spread-tassi-panel.tsx:15-36` copia `listino/primitive.tsx:21-72` con testi diversi.

---

## 3. F1 — Prove visive e limiti

### 3.1 Come sono state prodotte

- **Ambiente locale partito, nessun piano B necessario.**
  - Docker Desktop, container `tradejournal-db`, schema allineato: `prisma migrate status` → «Database schema is up to date».
  - `npm ci` e `next build` eseguiti nel worktree, senza `.env.production.local`.
  - Server avviato con `scripts/start-local.mjs`, che rifiuta un `DATABASE_URL` non locale.
- **Dati.** Utente demo con 215 trade su 2 conti (più 625 sul conto SIM1), 21 report Macro Desk, 90.259 barre giornaliere di stagionalità, 134.980 barre Driver, 1 Radar. Tutte letture fatte via Prisma.
- **Sessione.** Cookie Auth.js coniato con `AUTH_SECRET` del `.env` locale: nessuna credenziale digitata.
- **Cattura.** Chrome headless via CDP, `prefers-reduced-motion` emulato (senza, i grafici Recharts escono vuoti), pagina intera ottenuta allargando il viewport all'altezza del documento.
- **Nomi file.** Il formato è `<schermata>__<larghezza>__<tema>.png`, per esempio [`md-driver__390__dark.png`](design-2609/md-driver__390__dark.png).

### 3.2 Galleria per sezione (1440px, entrambi i temi; le altre larghezze hanno lo stesso nome)

| Sezione | Chiaro | Scuro | Mobile scuro |
|---|---|---|---|
| Accesso | [login](design-2609/auth-login__1440__light.png) · [registrazione](design-2609/auth-register__1440__light.png) | [login](design-2609/auth-login__1440__dark.png) | [login](design-2609/auth-login__390__dark.png) |
| Dashboard | [dashboard](design-2609/dashboard__1440__light.png) | [dashboard](design-2609/dashboard__1440__dark.png) | [dashboard](design-2609/dashboard__390__dark.png) |
| Calendario e giorno | [mese](design-2609/calendario-mese__1440__light.png) · [giorno](design-2609/giorno-dettaglio__1440__light.png) · [revisione](design-2609/giorno-revisione__1440__light.png) | [mese](design-2609/calendario-mese__1440__dark.png) · [giorno](design-2609/giorno-dettaglio__1440__dark.png) | [mese](design-2609/calendario-mese__390__dark.png) · [giorno](design-2609/giorno-dettaglio__390__dark.png) |
| Trade View | [lista](design-2609/trades-lista__1440__light.png) · [vuota per filtri](design-2609/trades-vuota-filtri__1440__light.png) | [lista](design-2609/trades-lista__1440__dark.png) | [lista](design-2609/trades-lista__390__dark.png) |
| Trade | [dettaglio](design-2609/trade-dettaglio__1440__light.png) · [nuovo](design-2609/trade-nuovo__1440__light.png) · [modifica](design-2609/trade-modifica__1440__light.png) | [dettaglio](design-2609/trade-dettaglio__1440__dark.png) | [dettaglio](design-2609/trade-dettaglio__390__dark.png) |
| Reports | [reports](design-2609/reports__1440__light.png) · [periodico](design-2609/reports-settimana__1440__light.png) | [reports](design-2609/reports__1440__dark.png) · [periodico](design-2609/reports-settimana__1440__dark.png) | [reports](design-2609/reports__390__dark.png) · [periodico](design-2609/reports-settimana__390__dark.png) |
| Analytics | [analytics](design-2609/analytics__1440__light.png) | [analytics](design-2609/analytics__1440__dark.png) | [analytics](design-2609/analytics__390__dark.png) |
| Import, strategie, impostazioni | [import](design-2609/import__1440__light.png) · [strategie](design-2609/strategie__1440__light.png) · [impostazioni](design-2609/impostazioni__1440__light.png) · [conti](design-2609/impostazioni-conti__1440__light.png) | [impostazioni](design-2609/impostazioni__1440__dark.png) | [impostazioni](design-2609/impostazioni__390__dark.png) |
| MD indice | [indice](design-2609/md-indice__1440__light.png) | [indice](design-2609/md-indice__1440__dark.png) | [indice](design-2609/md-indice__390__dark.png) |
| MD Volatilità | [volatilità](design-2609/md-volatilita__1440__light.png) | [volatilità](design-2609/md-volatilita__1440__dark.png) | [volatilità](design-2609/md-volatilita__390__dark.png) |
| MD Driver | [driver](design-2609/md-driver__1440__light.png) | [driver](design-2609/md-driver__1440__dark.png) | [driver](design-2609/md-driver__390__dark.png) |
| MD Trends | [trends](design-2609/md-trends__1440__light.png) | [trends](design-2609/md-trends__1440__dark.png) | [trends](design-2609/md-trends__390__dark.png) |
| MD Stagionalità | [stagionalità](design-2609/md-stagionalita__1440__light.png) | [stagionalità](design-2609/md-stagionalita__1440__dark.png) | [stagionalità](design-2609/md-stagionalita__390__dark.png) |
| MD Calendario | [calendario](design-2609/md-calendario__1440__light.png) | [calendario](design-2609/md-calendario__1440__dark.png) | [calendario](design-2609/md-calendario__390__dark.png) |
| MD Report | [indice](design-2609/md-report-indice__1440__light.png) · [giornaliero](design-2609/md-report-daily__1440__light.png) · [settimanale](design-2609/md-report-weekly__1440__light.png) | [giornaliero](design-2609/md-report-daily__1440__dark.png) | [giornaliero](design-2609/md-report-daily__390__dark.png) |
| MD Scorecard | [scorecard](design-2609/md-scorecard__1440__light.png) | [scorecard](design-2609/md-scorecard__1440__dark.png) | [scorecard](design-2609/md-scorecard__390__dark.png) |
| MD Radar | [radar](design-2609/md-radar__1440__light.png) | [radar](design-2609/md-radar__1440__dark.png) | [radar](design-2609/md-radar__390__dark.png) |
| Stati | [404 trade](design-2609/trade-inesistente-404__1440__light.png) · [404 report](design-2609/md-report-inesistente-404__1440__light.png) | [404 trade](design-2609/trade-inesistente-404__1440__dark.png) | [404](design-2609/trade-inesistente-404__390__dark.png) |
| Caricamento | [trades](design-2609/loading-trades__1440__light.png) · [trends](design-2609/loading-md-trends__1440__light.png) | [analytics](design-2609/loading-analytics__1440__dark.png) · [stagionalità](design-2609/loading-md-stagionalita__1440__dark.png) | — |

### 3.3 Misure che reggono i giudizi (DOM, 1440 scuro)

| Pagina | Altezza | Testi sotto 12px / sotto 11px | Caratteri | Isole scure |
|---|---:|---|---|---:|
| Dashboard | 3.472 | 99 / 6 | Geist | 0 |
| Trade View | 1.626 | 4 / 0 | Geist | 0 |
| Reports | 2.815 | 34 / 0 | Geist | 0 |
| Analytics | 7.083 (11.922 a 390) | 141 / 0 | Geist | 0 |
| MD Volatilità | 1.492 | 101 / **89** | Geist, Inter, JetBrains Mono | 0 |
| MD Driver | 4.380 (6.231 a 390) | 91 / 0 | Geist, Inter, JetBrains Mono | 1 |
| MD Trends | 2.079 | 109 / 30 | Geist, Geist Mono, Inter, JetBrains Mono | 1 |
| MD Stagionalità | 3.578 (5.396 a 390) | 141 / 1 | Geist, Inter, JetBrains Mono | 1 |
| MD Report giornaliero | 4.340 (10.079 a 390) | 100 / 0 | Geist, Inter, JetBrains Mono | 0 |
| MD Scorecard | 1.449 | 74 / 8 | Geist, Inter, Geist Mono, JetBrains Mono | 0 |

**Pagine che a 390px si allargano oltre lo schermo.** Il viewport di Chrome mobile si estende quando il contenuto sborda, quindi la misura di `innerWidth` è la prova:

| Pagina | Larghezza misurata | Temi |
|---|---:|---|
| `calendario-mese` | 449px | entrambi |
| `trade-dettaglio` | 466px | entrambi, dopo il rifacimento dello scatto chiaro |
| `reports-settimana` | 627px | entrambi |

### 3.4 Limiti del rilievo (dichiarati)

- **Dati locali fermi.** L'ultimo report Macro Desk è del 21/08, 24 giorni prima del rilievo, e lo trascina in tutte le pagine del desk. In produzione con dati freschi la banda ambra «Report giornaliero in ritardo» potrebbe non esserci: le pagine del desk appaiono più rumorose di quanto siano in produzione. Il giudizio sulla testata del desk (C1) ne tiene conto e **non** penalizza la banda.
- **Chiavi mancanti in locale.**
  - Senza la chiave API EIA, «Scorte di greggio» mostra un messaggio di configurazione.
  - Senza la chiave FRED, Trends usa il CSV pubblico.

  Nessuna delle due assenze è stata contata come difetto.
- **Stato di errore non provocabile senza toccare il codice.** `(app)/error.tsx` è valutato solo staticamente, così come gli errori parziali di Trends. Sono giudizi meno solidi.
- **Scrollbar invisibili.** Chrome gira con `--hide-scrollbars`, quindi negli screenshot le tabelle che scorrono in orizzontale sembrano tagliate. Esempi: l'ultima colonna «Campioni» di Stagionalità a 1440px e le tabelle della Volatilità a 390px. Il difetto reale è la **mancanza di un segnale di scorrimento** su mobile, non un taglio.
- **Artefatto del rasterizzatore.** In `md-volatilita__1440__dark.png` `VIX9D ÷ VIX` e `VIX ÷ VIX3M` mostrano lo stesso 0,848; nel DOM e nello scatto chiaro il primo è 0,871. È lo stesso artefatto documentato in `scripts/shot.mjs:108-115`, **non** un difetto dell'app.
- **Contaminazione rifatta.**
  - Otto scatti a 390px chiaro sono stati catturati mentre un secondo Chrome usava la stessa porta CDP. Li ha scoperti la misura: pagina e `h1` non corrispondevano.
  - Sono stati rifatti tutti, più `dashboard__390__light`. Le immagini nella cartella sono quelle buone.
- **Caricamento.** Gli stati di caricamento sono ottenuti con latenza di rete emulata (6 s) e navigazione client. Mostrano lo skeleton reale, ma non la sua durata.

---

## 4. F2 — Metro esterno

Ricerca su fonti pubbliche; dove le pagine erano chiuse (Bloomberg, LSEG, MacroMicro) sono stati usati gli estratti del motore di ricerca, e lo si dice. Riporto solo ciò che si applica a una nostra schermata precisa.

### 4.1 Cosa fanno meglio, in concreto

| Prodotto | Pratica verificata | Dove ci manca |
|---|---|---|
| **Vercel Geist** | Taglia minima di sistema **12px**; etichette mono a 12/13/14; colonne numeriche in `tabular-nums` «così le cifre si allineano»; skeleton con le **stesse dimensioni** del contenuto; empty state fuori dalla tabella, con titolo, descrizione e al massimo 1 azione primaria + 1 secondaria; negli errori un ID richiesta e «Riprova» | Listino a 8,5–10px (Volatilità, Scorecard); `ui/table` senza cifre tabulari; skeleton di Trends a card chiare su pagina scura; 5 componenti di stato vuoto |
| **Stripe** | Contrasto 4,5:1 per il testo piccolo e 3:1 per icone e bordi, palette costruita perché due colori a «5 livelli» di distanza passino sempre; spaziature ufficiali 2/4/8/16/24/32/48 | Grigio del listino 4,00–4,25:1 sulle intestazioni a 9,5px; bordo di `.ml-info` a 1,24:1 |
| **Linear** | Tema generato da 3 variabili (base, accento, contrasto) invece di 98; nel refresh del 2026: header e controlli di vista **uguali in tutte le sezioni**, icone più piccole, separatori più morbidi | 6 navigazioni a schede, 8 controlli segmentati, testate con «indietro» in due forme |
| **Bloomberg** | Due schemi per daltonici (deuteranopia, protanomalia) con su/giù **blu/rosso**; l'**ambra non significa nulla**, resta neutra; «religiously consistent» | Da noi l'accento primario resta blu anche con la coppia P&L blu/rosso attiva: un link e un profitto hanno lo stesso colore |
| **Koyfin** | Tre densità di tabella (Regular/Compact/Extra compact); righe di riepilogo (media, mediana); asse raggruppato per unità nei grafici multi-serie; zoom che tiene ferma l'ultima data | Driver: cinque serie normalizzate su due assi senza dire quale serie usa quale; Reports: tabelle senza riga totale |
| **MacroMicro** | Legenda che marca ogni serie «L»/«R» secondo l'asse; recessioni in bande grigie | Driver e Trends: la legenda non dice l'asse |
| **TradingView (Lightweight Charts)** | Crosshair «magnet» 1px tratteggiato con etichette sugli assi; griglia tenue | Grafici Recharts dell'app: senza griglia e con tooltip che copre la curva |
| **TradeZella** | KPI in testa con **pesi espliciti** dello Score (Profit Factor 25%, Avg win/loss 20%…); calendario verde/rosso/**grigio** = breakeven | Dashboard: radar Score senza pesi in vista |
| **Tradervue** | Calendario a **4 stati**: positivo, negativo, flat, nessun trade; toggle **totale/medio per trade** nei report | Calendario: giorno a P&L 0 e giorno senza trade indistinguibili nella tinta; Reports senza vista «medio» |
| **Edgewonk** | Ordinamento delle griglie salvato **lato server**; `Cmd/Ctrl+K`; calendario con colonna di riepilogo | Trade View: ordinamento solo in URL |

### 4.2 Applicabile a noi, schermata per schermata

1. **Geist, minimo 12px per i numeri → Volatilità, Scorecard, Report.** Mono 12 per le celle; sotto 12 solo le etichette di colonna a 11px maiuscoletto.
2. **Geist, `tabular-nums` → Trade View, Reports, Dashboard.** `TableCell` con cifre tabulari di default: oggi il DOM dice `normal`.
3. **Stripe, 4,5:1 → token del listino.** `--md-muted` a `#5b6676` (5,82:1 su bianco) e `#8a94a6` sullo scuro (6,32:1 su `#0b0e14`), valori della tavola di sistema.
4. **Linear, controlli di vista identici → testata di tutte le pagine.** Una `PageHeader`: occhiello, titolo 20, meta 12, azioni a destra.
5. **Linear/Vercel, navigazione compatta → Macro Desk.** Schede sottolineate su una riga al posto della griglia 3+2 di pillole.
6. **Bloomberg, ambra neutra → Impostazioni, coppia blu/rosso.** Con quella coppia l'accento primario si sposta su un tono che non sia blu.
7. **Tradervue, 4 stati → Calendario (`/day`) e mini calendario della Dashboard.** Un trattamento distinto per «nessun trade».
8. **Tradervue, totale/medio → Reports.** Un selettore «Totale | Medio per trade» sopra le tabelle per strategia, tag e ora.
9. **Koyfin, righe di riepilogo → Reports e fasce orarie di Analytics.** Riga totale con doppio filetto.
10. **Koyfin/MacroMicro, assi dichiarati → Driver.** «L»/«R» in legenda; le serie con la stessa unità condividono l'asse.
11. **TradeZella, pesi dello score → radar Score della Dashboard.** Il peso nell'etichetta del vertice.
12. **Vercel, skeleton fedele → Trends e Volatilità.** Righe da 28px senza scatole, sul fondo della pagina vera.
13. **Vercel, empty state con la query citata → Trade View.** Oggi è già buono: aggiungere il filtro testuale e togliere il contorno tratteggiato che imita una tabella.
14. **Vercel, errore con «Riprova» e ID → Trends (serie FRED mancanti) e Calendario del desk.**
15. **Edgewonk, ordinamento lato server → Trade View.**

Fonti: vercel.com/geist/typography, vercel.com/geist/table, vercel.com/geist/skeleton, vercel.com/geist/empty-state, vercel.com/font · stripe.com/blog/accessible-color-systems, docs.stripe.com/stripe-apps/style · linear.app/now/how-we-redesigned-the-linear-ui, linear.app/changelog/2026-03-12-ui-refresh, linear.app/docs/display-options · bloomberg.com/company/stories/designing-the-terminal-for-color-accessibility (estratto), uxmag.com/articles/the-impossible-bloomberg-makeover · koyfin.com/help/release-notes/v3-90-compact-table, koyfin.com/help/charts-and-graphs · en.macromicro.me/charts/108463/us-mm-recession-probability (estratto) · tradingview.github.io/lightweight-charts (GridLineOptions, CrosshairOptions) · help.tradezella.com/en/articles/10305642 · help.tradervue.com/article/2836-calendar-p-l · edgewonk.com/changelog. **Non verificato:** altezze di riga e taglie di Bloomberg, LSEG, Koyfin e Stripe Dashboard.

---

## 5. F3 — Rubrica e voti

### 5.1 Rubrica: criteri, pesi e che cosa vale 90 e 100

| ID | Criterio | Peso | 90 significa | 100 significa |
|---|---|---:|---|---|
| C1 | Gerarchia e composizione | 14 | La risposta principale della pagina è nel primo viewport a 1440×900; al massimo 2 livelli di peso visivo per blocco; la pagina più lunga è entro 3 viewport | Ogni pagina ha un solo punto d'ingresso evidente; nessun blocco ripetuto; l'ordine segue la frequenza d'uso misurata |
| C2 | Tipografia | 12 | 1 famiglia sans + 1 mono, ≤ 6 taglie, minimo 11px solo per etichette maiuscole, interlinea per taglia | Scala documentata e imposta da lint; zero `text-[Npx]`; varianti OpenType (tnum, lnum) sempre attive dove servono |
| C3 | Colore, contrasto, accessibilità | 12 | Tutto il testo ≥ 4,5:1 e i controlli ≥ 3:1 in entrambi i temi; il colore significa solo segno, attenzione, azione; nessuna isola di tema | Coppie daltoniche propagate ovunque; nessuna pagina di sistema fuori tema; heading e grafici etichettati |
| C4 | Densità e leggibilità dei numeri | 12 | Cifre tabulari ovunque; un formatter per tipo di valore; decimali costanti per colonna; separatori italiani coerenti | Allineamento al separatore decimale; unità e segno tipografici («−») coerenti; nessun numero leggibile solo in un `title` |
| C5 | Tabelle | 10 | Una tabella standard in due densità; intestazione sticky allineata alla colonna; totale dove serve; scorrimento con segnale su mobile | Prima colonna congelata su mobile, ordinamento persistente, righe di riepilogo, nessuna griglia CSS spacciata per tabella |
| C6 | Grafici | 10 | Un motore o una spec condivisa; assi e unità sempre dichiarati; nessuna interpolazione che inventi valori; leggibili a 390px | Crosshair con valori sugli assi, annotazioni degli eventi, palette categorica validata per daltonici |
| C7 | Coerenza dei componenti | 12 | Un componente per compito (schede, segmentato, spiegazione, stato vuoto, card KPI); una testata di pagina | Libreria documentata con esempi e test visivi; nessuna copia a mano |
| C8 | Stati | 6 | Vuoto, errore, caricamento e 404 in italiano, nei due temi, con la stessa geometria del contenuto | Errori parziali per fonte con «Riprova»; nessun errore di idratazione in console |
| C9 | Responsive e mobile | 7 | Nessuna pagina più larga di 390px; nessuna pagina oltre 4.000px a 390; tabelle con scorrimento segnalato; touch target ≥ 44px | Layout mobile pensato per compito (non la versione desktop impilata) |
| C10 | Rifinitura | 5 | Allineamenti di griglia coerenti; un raggio; stati disabilitati leggibili; nessun testo troncato; una sola lingua | Micro-interazioni coerenti (durate e easing unici già presenti); nessuna svista visibile a 100% di zoom |

Sotto il 90 il criterio scala linearmente: **70** = funziona, con difetti visibili a chi guarda con attenzione; **50** = difetti visibili a un primo sguardo; **30** = rotto o illeggibile in almeno un caso d'uso comune.

### 5.2 Matrice dei voti (ricostruibile a mano)

Voto di sezione = Σ(voto criterio × peso criterio) / Σ(pesi dei criteri applicabili). «—» = criterio non applicabile, escluso dal denominatore. Voto globale = Σ(peso d'uso × voto sezione) / 100.

| Sezione | Peso | C1 ·14 | C2 ·12 | C3 ·12 | C4 ·12 | C5 ·10 | C6 ·10 | C7 ·12 | C8 ·6 | C9 ·7 | C10 ·5 | Calcolo | **Voto** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| S1 Accesso | 2 | 70 | 68 | 70 | — | — | — | 72 | 60 | 75 | 65 | 4710/68 | **69,3** |
| S2 Dashboard | 12 | 50 | 60 | 65 | 60 | 58 | 65 | 55 | 72 | 62 | 60 | 5976/100 | **59,8** |
| S3 Calendario, giorno, revisione | 9 | 68 | 65 | 62 | 62 | 62 | 45 | 60 | 60 | 45 | 60 | 5985/100 | **59,9** |
| S4 Trade View | 10 | 68 | 64 | 60 | 45 | 62 | 62 | 65 | 78 | 60 | 62 | 6198/100 | **62,0** |
| S5 Trade dettaglio/nuovo/modifica | 8 | 55 | 62 | 58 | 48 | 60 | — | 60 | 40 | 45 | 52 | 4921/90 | **54,7** |
| S6 Reports e periodico | 7 | 45 | 58 | 60 | 55 | 50 | 58 | 55 | 60 | 50 | 55 | 5431/100 | **54,3** |
| S7 Analytics | 8 | 35 | 50 | 58 | 50 | 52 | 55 | 45 | 55 | 35 | 50 | 4821/100 | **48,2** |
| S8 Import CSV | 3 | 65 | 65 | 60 | — | — | — | 65 | 60 | 70 | 58 | 4330/68 | **63,7** |
| S9 Strategie, impostazioni, conti | 4 | 62 | 64 | 62 | — | — | — | 58 | 50 | 65 | 55 | 4106/68 | **60,4** |
| S10 MD indice | 3 | 45 | 60 | 65 | — | — | — | 50 | 60 | 65 | 55 | 3820/68 | **56,2** |
| S11 MD Volatilità | 6 | 72 | 45 | 50 | 80 | 75 | 65 | 60 | 55 | 50 | 65 | 6233/100 | **62,3** |
| S12 MD Driver | 5 | 58 | 55 | 50 | 65 | — | 55 | 50 | 55 | 35 | 68 | 4917/90 | **54,6** |
| S13 MD Trends | 4 | 60 | 50 | 48 | 62 | 60 | 62 | 45 | 62 | 55 | 62 | 5587/100 | **55,9** |
| S14 MD Stagionalità | 5 | 68 | 55 | 55 | 72 | 66 | 75 | 55 | 60 | 50 | 70 | 6266/100 | **62,7** |
| S15 MD Calendario | 4 | 58 | 58 | 60 | 70 | 68 | — | 50 | 65 | 62 | 60 | 5472/90 | **60,8** |
| S16 MD Report | 6 | 38 | 45 | 48 | 45 | 40 | — | 38 | 35 | 40 | 45 | 3759/90 | **41,8** |
| S17 MD Scorecard | 2 | 45 | 50 | 45 | 60 | 62 | — | 45 | 60 | 55 | 50 | 4645/90 | **51,6** |
| S18 MD Radar | 2 | 55 | 58 | 55 | — | — | — | 52 | 65 | 65 | 55 | 3870/68 | **56,9** |
| **Globale** | 100 | | | | | | | | | | | 5714,8/100 (voti arrotondati) | **57,1** |

Media di ogni criterio sulle sole sezioni dove si applica, ponderata col peso d'uso (serve a leggere dove perde punti l'app nel suo insieme):

| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 56,1 | 57,5 | 57,9 | 57,9 | 59,0 | 59,7 | **54,8** | 59,2 | **52,3** | 58,2 |

**Pesi d'uso.** Sono stimati sulla frequenza con cui un trader apre la pagina: la Dashboard ogni sessione, Scorecard e Radar di rado, come dice la stessa `section-nav.tsx:124`. **Non derivano da dati di utilizzo**, che l'app non raccoglie (vedi [Autocritica](#8-autocritica)).

### 5.3 Ragioni e prove, sezione per sezione

Ogni voto sotto 100 ha la sua ragione. Sotto, i criteri che hanno tolto più punti. Le immagini stanno in `design-2609/`, i riferimenti al codice sono `file:riga` su `417abe7`.

#### S16 · Macro Desk · Report — 41,8

- **C1 38.**
  - Il dettaglio giornaliero è alto 4.340px a 1440 e 10.079px a 390.
  - Contiene tre schede asset verticali identiche: bias, «oggi», quattro pilastri in card, «da notare», edge, invalidazione, narrativa, trimestrale, driver.
  - Il verdetto è un paragrafo fra altri paragrafi. → [`md-report-daily__1440__light.png`](design-2609/md-report-daily__1440__light.png), [`md-report-daily__390__dark.png`](design-2609/md-report-daily__390__dark.png).
- **C5 40.** Lo «Storico recente» dell'indice non è incolonnato: «Oro Neutrale 44% · Petrolio Neutrale 41% · Indici Rialzo 46%» allineati a destra come testo, con lunghezze diverse per riga. È esattamente la forma che la regola del Listino vieta («quello che si ripete diventa una colonna»). → [`md-report-indice__1440__light.png`](design-2609/md-report-indice__1440__light.png).
- **C7 38.**
  - L'indice è shadcn con titoli di card MAIUSCOLI a 16px e `text-profit`.
  - Il dettaglio è listino con `--md-up` e **non ha la barra delle sezioni** (`[id]/page.tsx:145-171`).
  - `NewsCard` è squadrata qui e arrotondata altrove (`report-tabs.tsx:909` + `listino.css:78-80`).
  - Le etichette «Daily/Weekly» sono in inglese.
- **C3 48.**
  - Callout con striscia colorata a sinistra e bordi superiori colorati per asset (oro, arancio, blu).
  - Parole del bias colorate.
  - Emoji come icone asset. → `md-report-daily__1440__light.png`.
- **C8 35.**
  - `/macro-desk/report` genera l'errore React #418 (idratazione) nel run in tema chiaro, a tutte e tre le larghezze. L'ha registrato la console durante la cattura; non è riprodotto negli screenshot.
  - Causa probabile, **non verificata**: `Intl.DateTimeFormat` senza `timeZone` in `report/page.tsx:46`.
  - Il dettaglio con id inesistente finisce sulla 404 di default. → [`md-report-inesistente-404__1440__dark.png`](design-2609/md-report-inesistente-404__1440__dark.png).
- **C2 45.** Quattro caratteri nella stessa pagina (Geist, Inter, JetBrains Mono, Geist Mono); 100 testi a 11px; `report-tabs.tsx` ha 46 classi arbitrarie e 7 raggi arbitrari.

#### S7 · Analytics — 48,2

- **C1 35.**
  - 7.083px a 1440: dodici card a tutta larghezza impilate, ognuna con il suo paragrafo di metodologia.
  - Le pillole-ancora in testa non restano visibili durante lo scorrimento. → [`analytics__1440__light.png`](design-2609/analytics__1440__light.png).
- **C9 35.** 11.922px a 390px, cioè 14 schermate di telefono. → [`analytics__390__dark.png`](design-2609/analytics__390__dark.png).
- **C7 45.**
  - Tabelle grezze in 5 file diversi: `segment-table.tsx:81`, `target-r-table.tsx:86`, `concentration-table.tsx:22`, `equity-simulator.tsx:744`, `correlation-matrix.tsx:39`.
  - `StatBox` a div (`analytics/page.tsx:151-190`) al posto della `StatCard` della Dashboard.
  - Tre controlli segmentati diversi nella stessa pagina (`rolling-controls.tsx:53-66`, `rolling-charts.tsx:53-86`, `hour-basis-toggle.tsx:24-47`).
- **C2 50.** 141 testi a 11px, per lo più note metodologiche in paragrafi.
- **C3 58.** Colori dei percorsi del simulatore fuori dai token (`equity-simulator.tsx:94-97`, rotazione HSL a luminosità fissa).
- **C8 55.** Lo skeleton è fatto di card generiche. → [`loading-analytics__1440__dark.png`](design-2609/loading-analytics__1440__dark.png).

#### S17 · Macro Desk · Scorecard — 51,6

- **C1 45.**
  - La stessa spiegazione di sei righe è ripetuta **tre volte**, una sotto ogni asset.
  - «Campione troppo piccolo» compare otto volte in ambra prima del dato. → [`md-scorecard__1440__light.png`](design-2609/md-scorecard__1440__light.png).
- **C3 45.**
  - I conteggi «0 / 1 / 2» sono colorati blu, rosso e ambra senza significato di segno (`scorecard-em-view.tsx:26` `OUTCOME_TONE`).
  - `BandaImpegno` usa token non risolti (`scorecard/page.tsx:74`).
- **C7 45.** Terzo stile di intestazione del desk; `.md-card-2` appiattite (`scorecard-em-view.tsx:111,196,298,319`).
- **C2 50.** Otto testi a 9,5px (`th` del listino) e grigio a 4,03–4,25:1.

#### S6 · Reports e report periodico — 54,3

- **C1 45.** Sette tabelle con le stesse sette colonne impilate (simbolo, strategia, tag, categoria, piano, direzione, mese), senza sintesi in testa né riga totale; poi due grafici e le streak. → [`reports__1440__light.png`](design-2609/reports__1440__light.png).
- **C9 50.** Il Report periodico si allarga a **627px** a 390 → [`reports-settimana__390__dark.png`](design-2609/reports-settimana__390__dark.png). La barra con segmentato, frecce e CSV/PDF/Stampa non va a capo (`reports/settimana/page.tsx:205-235`). La vista mobile a card richiudibili dei Reports, invece, è buona → [`reports__390__dark.png`](design-2609/reports__390__dark.png).
- **C4 55.**
  - «-260.24 EUR vs settimana precedente» usa il punto decimale (`reports/settimana/page.tsx:83`, `delta.toFixed(2)`) accanto a «-325,55 €».
  - Le colonne «Expectancy» alternano «0,1R» e «0,02R», con decimali non costanti.
  - Nel DOM le celle hanno `font-variant-numeric: normal`.
- **C5 50.** `ui/table` a 37px e 14px senza cifre tabulari; titoli di card MAIUSCOLI a 14px con spaziatura larga.

#### S12 · Macro Desk · Driver — 54,6

È uno dei due riferimenti interni, e non regge come tale.

- **C9 35.**
  - A 390px la pagina è alta 6.231px.
  - I tre grafici multi-serie si riducono a una striscia in cui etichette di fine linea e legenda si sovrappongono. → [`md-driver__390__dark.png`](design-2609/md-driver__390__dark.png).
- **C3 50.**
  - In tema chiaro è un rettangolo `#080b12` dentro una pagina bianca → [`md-driver__1440__light.png`](design-2609/md-driver__1440__light.png).
  - Cinque o sei serie in tinte categoriche su due assi, senza dire quale serie sta su quale asse.
- **C6 55.** Serie normalizzate su due scale con asse destro etichettato «Driver — scala separata», ma la legenda non distingue: è la pratica «L/R» di MacroMicro che manca.
- **C7 50.** Ambiente `.macro-report`, 11px scritto a mano 8 volte (`driver-desk-panel.tsx:180…401`), riferimento a un pannello rimosso (`:407`).
- **C10 68. Il punto forte:**
  - etichette di valore a fine linea;
  - blocchi «Stabilità delle relazioni» con barra di posizione;
  - fonti dichiarate.

#### S5 · Trade: dettaglio, nuovo, modifica — 54,7

- **C8 40.** Un trade inesistente apre la 404 di Next in inglese. In tema scuro il testo è nero su `#0b0e14` e il selettore conto della topbar diventa illeggibile → [`trade-inesistente-404__1440__dark.png`](design-2609/trade-inesistente-404__1440__dark.png). Manca `not-found.tsx`.
- **C9 45.**
  - A 390 la testata (simbolo, due badge, frecce, Modifica, Elimina) non va a capo e la pagina si allarga a **466px** (`trades/[id]/page.tsx:293,301`).
  - La tabella Esecuzioni perde la colonna Prezzo senza segnale. → [`trade-dettaglio__390__dark.png`](design-2609/trade-dettaglio__390__dark.png).
- **C4 48.**
  - «Quantità 0.99» e «Valore punto 100000» sono stringhe grezze (`trimZeros(trade.quantity.toString())`, `trades/[id]/page.tsx:200,528`).
  - Nel form i placeholder «Es. 250.00», «Es. -12.40» usano il punto. → [`trade-nuovo__1440__light.png`](design-2609/trade-nuovo__1440__light.png).
- **C10 52.**
  - Nel form «Valore punto» è disallineato verso l'alto rispetto agli altri campi della riga.
  - Il campo data/ora tronca «16:2».
  - I pulsanti «Salva» disabilitati sono blu al 50%: sembrano attivi e il contrasto crolla → [`trade-dettaglio__1440__light.png`](design-2609/trade-dettaglio__1440__light.png).
- **C1 55.** Il dettaglio è una colonna di otto card (2.282px) in cui Piano, Checklist e Revisione pesano quanto il Riepilogo.

#### S13 · Macro Desk · Trends — 55,9

- **C7 45.** Terzo ambiente: scuro fisso (`trends/page.tsx:111`), in contraddizione con `listino.css:4-6`. Il tablist copia quello del Report (`trends-view.tsx:640-671` ≈ `report-detail.tsx:80-115`).
- **C3 48.**
  - Isola scura in tema chiaro → [`md-trends__1440__light.png`](design-2609/md-trends__1440__light.png).
  - Il verde e il rosso dei chip MoM/YoY significano «direzione favorevole», non segno (`trends-view.tsx:76-82`).
- **C2 50.** 30 testi a 10px (assi SVG `trends-chart.tsx:215,247,257,296`).
- **C8 62.** Lo skeleton chiaro a card precede un blocco scuro: si vede il lampo al caricamento → [`loading-md-trends__1440__light.png`](design-2609/loading-md-trends__1440__light.png).

#### S10 · Macro Desk · indice — 56,2

- **C1 45.**
  - Otto porte con descrizione e nessun dato: nessun «Report in ritardo di 24 giorni» accanto a Report, nessun livello del VIX accanto a Volatilità.
  - La griglia 3+2 lascia una cella vuota a destra in ogni gruppo. → [`md-indice__1440__light.png`](design-2609/md-indice__1440__light.png).
- **C7 50.** È shadcn con icone blu: nessun segno del linguaggio Listino che le sezioni usano appena si entra.

#### S18 · Macro Desk · Radar — 56,9

- **C1 55.** Griglia a due colonne con una sola voce nelle prime due righe: metà pagina vuota → [`md-radar__1440__light.png`](design-2609/md-radar__1440__light.png).
- **C3 55.** Citazioni con striscia verticale a sinistra; etichette mono in scatole grigie.
- **C7 52.** Blocchi `rounded-[var(--md-r-md)]` resi squadrati dal listino (`radar-view.tsx:152,303`).

#### S2 · Dashboard — 59,8

- **C1 50.**
  - Dodici card KPI di pari peso prima di qualunque grafico; Net P&L è l'unico hero.
  - «Winners & Losers» e «Best/Worst Days» sono card con bordi colorati dentro una card.
  - La pagina è alta 3.472px, 4.508px a 1024. → [`dashboard__1440__dark.png`](design-2609/dashboard__1440__dark.png).
- **C7 55.** `StatCard` riusata bene, ma tre sotto-stili di card nella stessa pagina.
- **C2 60.** Tre livelli diversi (etichetta KPI, titolo di card, intestazione di tabella) sono tutti in maiuscolo spaziato: nella pagina la gerarchia la fa la posizione, non la tipografia. 99 testi sotto i 12px.
- **C8 72.** Onboarding a tre passi e stati vuoti per widget sono ben fatti (`dashboard-view.tsx:642`, `:1114…`).
- **C9 62.** Il toggle «Tutte le metriche» su mobile è una buona scelta → [`dashboard__390__dark.png`](design-2609/dashboard__390__dark.png).

#### S3 · Calendario, giorno, revisione — 59,9

- **C6 45.** Il P&L cumulativo del giorno usa `type="monotone"` (`intraday-pnl-chart.tsx:84`): con tre punti la curva sale a ~+260 fra +245 e −169, **un valore che non è mai esistito**. La sequenza con tre barre larghe 130px è sproporzionata → [`giorno-dettaglio__1440__light.png`](design-2609/giorno-dettaglio__1440__light.png).
- **C9 45.** Il calendario del mese si allarga a **449px** a 390 (`day/page.tsx:188-204`) → [`calendario-mese__390__dark.png`](design-2609/calendario-mese__390__dark.png).
- **C1 68. Punto forte:** colonna dei totali settimanali, due righe per giorno (P&L e numero di trade). La tinta però non distingue «0» da «nessun trade» → [`calendario-mese__1440__light.png`](design-2609/calendario-mese__1440__light.png).

#### S9 · Strategie, impostazioni, conti — 60,4

- **C8 50.** `/settings/accounts` non ha stato vuoto (`settings/accounts/page.tsx:35-72`).
- **C7 58.**
  - Tre larghezze massime diverse in tre pagine sorelle: `2xl`, `3xl`, `3xl`.
  - La card Profilo ha la barra del piede, la Checklist no.
  - Pulsanti disabilitati blu al 50%. → [`impostazioni__1440__light.png`](design-2609/impostazioni__1440__light.png).
- **C1 62.** L'ordine è sensato; la pagina Impostazioni è lunga 2.122px con cinque card eterogenee.

#### S15 · Macro Desk · Calendario — 60,8

- **C7 50.** Quarto ambiente (`.md-calendario`) e **tre livelli di scatola**: pagina, «Come si legge», filtri, tabella. È il difetto che il Listino era nato per togliere → [`md-calendario__1440__light.png`](design-2609/md-calendario__1440__light.png).
- **C4 70. Punto forte:** orari e valori in mono allineati, unità dichiarate.

#### S4 · Trade View — 62,0

- **C4 45.**
  - Qty «0.99» col punto accanto a «1,10234» (`trades/page.tsx:412`).
  - «2753,00» senza separatore sopra «20.777,50» (`instruments.ts:117`: it-IT non raggruppa a 4 cifre).
  - Cifre proporzionali nel DOM.
  - Net P&L mescola € e USD nella stessa colonna ordinabile.
- **C3 60.** LONG in verde e SHORT in rosso: il colore del profitto usato per la direzione (`trades/page.tsx:311,405`). «Aperto» in badge blu pieno, lo stesso blu dell'azione primaria → [`trades-lista__1440__light.png`](design-2609/trades-lista__1440__light.png).
- **C1 68.** Il grafico «Sequenza trade» sta sopra la tabella e la spinge sotto i 550px.
- **C8 78. Punto forte:** stato vuoto per filtri con «Azzera filtri» → [`trades-vuota-filtri__1440__light.png`](design-2609/trades-vuota-filtri__1440__light.png).

#### S11 · Macro Desk · Volatilità — 62,3

- **C4 80, C5 75. La pagina meglio impaginata dell'app:**
  - una tabella per domanda;
  - intestazioni di gruppo;
  - barre-parola;
  - 1.492px contro i 5.191px di prima → [`md-volatilita__1440__dark.png`](design-2609/md-volatilita__1440__dark.png).
- **C2 45.** **89 testi sotto gli 11px**: `th` a 9,5, gruppi a 9, «i» a 8,5, occhielli a 10. Tre caratteri; mono anche su parole come «volatilità implicita dei Treasury».
- **C3 50.**
  - Il grigio delle intestazioni `#67748a` su `#06080d` sta a **4,24:1**, sotto AA, e su `#0c1119` a 4,00:1.
  - Il bordo dell'icona «i» sta a 1,24:1 (`listino.css:57,102,326`).
- **C9 50.** A 390 le tabelle scorrono senza segnale e la pillola «Stagionalità» della barra sezioni è tagliata → [`md-volatilita__390__dark.png`](design-2609/md-volatilita__390__dark.png).

#### S14 · Macro Desk · Stagionalità — 62,7

È l'altro riferimento interno, e regge. Da ricordare che è **congelata** (nessuna modifica a resa o dati dal 29/08/2026).

- **C6 75.**
  - Heatmap anno × mese leggibile, con media, deviazione standard e anni in positivo in fondo.
  - Percorso stagionale con palette Okabe-Ito validata.
  - Riga «adesso» evidenziata → [`md-stagionalita__1440__dark.png`](design-2609/md-stagionalita__1440__dark.png).
- **C3 55.** Isola scura in tema chiaro → [`md-stagionalita__1440__light.png`](design-2609/md-stagionalita__1440__light.png).
- **C2 55.** 554 testi in JetBrains Mono su 660, compresi i nomi dei mesi; 140 a 11px.
- **C7 55.** `.md-panel` non esiste (`stagionalita/page.tsx:463,813`); chip di filtro in un quinto stile (`controls.tsx:47-110`).
- **C5 66.**
  - La tabella «Per mese, su tutte le finestre» richiede lo scorrimento orizzontale già a 1440: la colonna «Campioni» esce dal bordo.
  - Righe da 53px contro i 28px della heatmap sopra.
- **C9 50.** 5.396px a 390; grafici alti 560px anche su mobile (`stagionalita/page.tsx:682,721`).

#### S8 · Import CSV — 63,7

- **C10 58.** La CTA disabilitata azzurra al 50% sembra la CTA principale; la pagina resta vuota sotto il riquadro → [`import__1440__light.png`](design-2609/import__1440__light.png).
- **C1 65.** Lineare e chiaro; il testo d'esempio in mono è utile.

#### S1 · Accesso — 69,3

- **C10 65.** Alone azzurro generico in cima; titolo della card «Accedi» a 16px normale, meno forte del marchio → [`auth-login__1440__light.png`](design-2609/auth-login__1440__light.png).
- **C8 60.** Errore di credenziali non osservato: login non tentato di proposito. Giudizio basato sul codice (`login-form.tsx:22`).

---

## 6. F4 — Direzione visiva con Claude Design

Progetto Claude Design: **«L&B TradingSpace — Referto design 360 (sett. 2026)»**.

- Tutte le proposte usano gli stessi token (`sistema.css` nel progetto), sono disegnate su una cornice dell'app reale (sidebar e topbar) e usano dati veri del conto demo.
- Dove il dato non era leggibile, il grafico è un segnaposto a righe dichiarato come tale.
- Ogni tavola è stata renderizzata e fotografata in headless dopo ogni modifica.
- Un difetto l'ha trovato la verifica, non l'occhio: la classe `.sel` del select collideva con la riga selezionata `tr.sel` e rompeva la tabella in 1a e 3b. È stato corretto e rifotografato.

### 6.1 Proposta di sistema (una sola per tutta l'app)

**[Apri la tavola in Claude Design](https://claude.ai/design/p/d3b88e06-0946-4bab-b4e9-ad1d8bde564f?file=Sistema+visivo.dc.html)** · anteprima: [`claude-design/sistema-visivo.png`](design-2609/claude-design/sistema-visivo.png)

| Tavola | Decisione | Criterio che alza |
|---|---|---|
| 1 · Tipografia | **Geist + Geist Mono** soltanto: Inter e JetBrains escono dal desk. Sei taglie: 28 (un KPI per vista), 20 (titolo di pagina), 15 (titolo di card, frase normale), 13 (corpo e celle), 12 (celle dense e metadati), 11 (solo etichette maiuscole, 600, spaziatura 0,06em). Numeri con le cifre tabulari di Geist, misurate funzionanti; il mono solo per codici, ticker e orari | C2, C4 |
| 2 · Colore | Una rampa neutra condivisa da app e desk e **quattro significati**: su/giù (solo valori con segno), attenzione, azione. LONG/SHORT, bias neutrale, conteggi ed esiti restano grigi. Valori verificati: muted `#5b6676` 5,82:1 su bianco · `#8a94a6` 6,32:1 su `#0b0e14`; bordo dei controlli `#7b8594` 3,73:1 · `#5d6779` 3,39:1; su/giù chiari 5,37 / 5,96; scuri 8,12 / 5,94 su superficie | C3 |
| 3 · Spazio e superfici | Base 4: 4 · 8 · 12 · 16 · 24 · 32 · 48. **Un raggio (10px)**. Tre superfici: card per contenuti eterogenei, blocco listino (filetto, niente scatola) per misure omogenee, nota tinta senza striscia colorata. Mai una card dentro una card. Due larghezze: piena e lettura 760px | C1, C7, C10 |
| 4 · Tabella numerica | Una tabella, due densità: **standard 36px/13px** (Trade View, Reports, Analytics) e **listino 28px/12px** (desk). Intestazione 11px maiuscola allineata alla colonna, sticky; decimali costanti; spazio fine come separatore delle migliaia anche a 4 cifre; «−» tipografico; riga totale a doppio filetto; nessuna zebra; su mobile prima colonna congelata e ombra di scorrimento | C4, C5, C9 |
| 5 · Testata e navigazione | Una `PageHeader` per tutta l'app. Macro Desk con **schede sottolineate su una riga**, archivio e registro dopo un separatore: il contenuto parte a ~150px invece di ~300px. Card KPI con un solo hero | C1, C7 |
| 6 · Stati | Vuoto con la query citata, 404 in italiano nei due temi, errore parziale per fonte con «Riprova» e riferimento, skeleton con la geometria del contenuto (righe da 28px sulle pagine listino), pulsante disabilitato neutro | C8, C3 |

**Compatibilità col Listino.** Le tre regole restano: niente scatole per le misure, spiegazione dietro l'icona, colore solo sul segno. Cambiano solo il carattere (JetBrains → Geist Mono/Geist tabulare), la taglia minima (8,5 → 11px) e il grigio, portato a norma AA.

**Costo del sistema.** ~26 ore per token, caratteri, scala e testata (onda P1, voci 1–2). Ogni proposta di sezione presuppone il sistema.

### 6.2 Report MD (voto 41,8)

**[Apri in Claude Design](https://claude.ai/design/p/d3b88e06-0946-4bab-b4e9-ad1d8bde564f?file=Report+MD+-+proposte.dc.html)** · anteprima: [`claude-design/report-md-proposte.png`](design-2609/claude-design/report-md-proposte.png)

| | **1a · Nota di ricerca a colonna** (scuro) | **1b · Matrice asset × pilastri** (chiaro) |
|---|---|---|
| Cosa cambia | Indice e dettaglio diventano una pagina. A sinistra, in ordine: quadro comune in 4 celle, verdetto in prosa a 15px, **una tabella «Bias per asset»** (settimanale e confidenza, stress in EM, 4 pilastri come glifi ▲●▼, trimestrale, invalidazione), poi la lettura dell'asset selezionato (edge, da notare, driver in tabella). A destra lo **storico incolonnato** (data, oro, petrolio, indici con glifo e confidenza) che cambia il report senza cambiare pagina | Il dettaglio diventa **una matrice**: righe = settimanale, stress, regime, pricing, tattico, eventi, trimestrale, invalidazione; colonne = tre asset. Sotto, la **striscia dei bias negli ultimi 21 report** (glifi per asset e data). Navigazione precedente/successivo in testata |
| Perché alza | C1 38→85, C5 40→85, C7 38→80, C2 45→82 | C1 38→88, C5 40→85, C7 38→80, C9 40→72 (la matrice si legge a scorrimento orizzontale con la prima colonna congelata) |
| Voto atteso | ~82 | ~84 |
| Costo | 14–18 h; rischio medio (`report-tabs.tsx`, 46 classi arbitrarie) | 20–26 h; richiede pilastri in forma breve: oggi il report esterno manda prosa lunga, quindi o si tronca con criterio o si tocca il payload a monte (repo `macro-desk-bridge`) |

### 6.3 Analytics (voto 48,2)

**[Apri in Claude Design](https://claude.ai/design/p/d3b88e06-0946-4bab-b4e9-ad1d8bde564f?file=Analytics+-+proposte.dc.html)** · anteprima: [`claude-design/analytics-proposte.png`](design-2609/claude-design/analytics-proposte.png)

| | **3a · Sintesi in testa e indice laterale** (scuro) | **3b · Capitoli a schede** (chiaro) |
|---|---|---|
| Cosa cambia | **Sei numeri in testa**: expectancy in R, Sortino, max drawdown, Ulcer, risk of ruin, fascia oraria migliore. Poi un **indice fisso** di cinque capitoli (Distribuzioni, Rischio, Rolling, Timing, Simulatore) e card in griglia a due colonne con altezza limitata. Le note metodologiche passano dietro l'icona «i» | Schede **Distribuzioni · Rischio · Rolling · Timing · Simulatore di equity**. Ogni scheda sta in ~1,5 schermi. Esempio disegnato: Timing, con due grafici affiancati e toggle R/P&L, e tabella fasce orarie con riga totale e fasce sotto soglia in grigio. Il simulatore diventa uno strumento a parte |
| Perché alza | C1 35→84, C2 50→82, C7 45→80, C9 35→65 | C1 35→86, C9 35→75 (una scheda ≈ 2.000px a 390), C7 45→80 |
| Voto atteso | ~80 | ~83 |
| Costo | 10–14 h; rischio basso-medio (ancore esistenti, `IntersectionObserver`) | 16–22 h; rischio medio. Routing per scheda con searchParam e query divise: la pagina oggi lancia ~17 query tutte insieme, quindi è anche un guadagno di tempo di caricamento |

### 6.4 Scorecard (voto 51,6)

**[Apri in Claude Design](https://claude.ai/design/p/d3b88e06-0946-4bab-b4e9-ad1d8bde564f?file=Scorecard+-+proposte.dc.html)** · anteprima: [`claude-design/scorecard-proposte.png`](design-2609/claude-design/scorecard-proposte.png)

| | **2a · Una tabella di consuntivo** (chiaro) | **2b · Griglia degli esiti** (scuro) |
|---|---|---|
| Cosa cambia | Frase «dove siamo» e **contatore del campione (3/8)** in testa. **Una tabella asset × esiti** con riga totale e hit rate espressi come «X di 8» finché il campione non basta. Spiegazione una volta sola dietro «i». Tabella delle settimane con l'esito a parole e il colore solo su chiusura, MFE e MAE | Quattro numeri in testa (valutate, azzeccate, sbagliate, senza info). **Griglia settimana × asset** con forme (✓ ✗ · □) e la **soglia delle 8 settimane disegnata** nella griglia. Dettaglio della settimana selezionata e regole di valutazione una volta |
| Perché alza | C1 45→85, C3 45→88, C7 45→82 | C1 45→88, C3 45→88, C6 n/a→80 (la griglia è di fatto un grafico) |
| Voto atteso | ~84 | ~86 |
| Costo | 6–8 h; rischio basso (dati già in `scorecard-em-view.tsx`) | 10–14 h; serve il calendario delle settimane attese, anche senza report |

---

## 7. F5 — Piano di miglioramento

Il **voto atteso** dopo ogni onda è una stima: si ottiene rialzando nella matrice del §5.2 i criteri toccati dalle voci dell'onda. Le ore comprendono verifica visiva e test.

**Due vincoli da rispettare:**

- **Stagionalità congelata:** qualunque voce che la tocchi va autorizzata prima.
- **Driver e Stagionalità** sono state dichiarate intoccabili dal proprietario il 28/08. Sono marcate ⚠.

### Onda P0 — Rotture visive evidenti (~18 h · voto atteso ~63)

| # | Cosa fare | File | Ore | Voto atteso | Rischio |
|---|---|---|---:|---|---|
| P0-1 | `not-found.tsx` in italiano e theme-aware per `(app)`, con uscita contestuale (Trade View, Report) | nuovo `src/app/(app)/not-found.tsx`; `trades/[id]/page.tsx`, `macro-desk/[id]/page.tsx:134`, `day/[date]/page.tsx:90` | 3 | S5 C8 40→75, S16 C8 35→60 | basso |
| P0-2 | Testate che non vanno a capo a 390px | `day/page.tsx:188-204`, `reports/settimana/page.tsx:205-235`, `trades/[id]/page.tsx:293,301` | 3 | S3 C9 45→62, S5 C9 45→60, S6 C9 50→65 | basso |
| P0-3 | `tabular-nums` di default su `TableCell`; formatter unico per quantità e delta (via `trimZeros` ×3 e `toFixed`); `useGrouping: "always"` per le migliaia a 4 cifre | `components/ui/table.tsx:81-91`, `lib/instruments.ts:117`, `lib/money.ts`, `trades/page.tsx:342,412,474`, `trades/[id]/page.tsx:54,200,528`, `trades/[id]/edit/page.tsx:10,60`, `reports/settimana/page.tsx:83` | 4 | S4 C4 45→70, S5 C4 48→68, S6 C4 55→68 | basso-medio: i test sui formati vanno aggiornati |
| P0-4 | Grigio del listino ad AA (`#5b6676` chiaro, `#8a94a6` scuro) e bordo di `.ml-info`; pulsante disabilitato neutro al posto dell'opacità 50% | `styles/listino.css:57,102,326`; `components/ui/button.tsx` (variante disabled) | 3 | C3 +8 su S11, S15, S16, S17, S18; C10 +5 su S5, S8, S9 | medio: tocca tutto il desk. Si verifica con screenshot prima/dopo |
| P0-5 | Token rotti: definire o togliere `.md-panel` ⚠; spostare `BandaImpegno` dentro `.md-listino` | `stagionalita/page.tsx:463,813` ⚠, `bucket-window-table.tsx:129` ⚠, `riepilogo-adesso.tsx:74` ⚠; `scorecard/page.tsx:74` | 1,5 | S17 C3 45→55 | basso (Scorecard); la parte Stagionalità solo con permesso |
| P0-6 | Errore di idratazione #418 in `/macro-desk/report`: fissare il fuso nella formattazione, verificando prima la causa | `macro-desk/report/page.tsx:46` | 1 | S16 C8 +10 | basso |
| P0-7 | Skeleton di Volatilità e Driver ⚠ (oggi ereditano la griglia dell'indice) e di Trends sul fondo giusto | nuovi `volatilita/loading.tsx`, `driver/loading.tsx` ⚠; `trends/loading.tsx` | 2,5 | C8 +10 su S11, S12, S13 | basso |

### Onda P1 — Salto di qualità percepito (~95 h · voto atteso ~76)

| # | Cosa fare | File | Ore | Voto atteso | Rischio |
|---|---|---|---:|---|---|
| P1-1 | **Sistema unico**: token del desk sugli stessi valori dell'app; Geist e Geist Mono al posto di Inter e JetBrains in un layout del desk invece di 8 pagine; scala a 6 gradini con minimo 11px; via i 42 `text-[Npx]` | `globals.css`, `styles/listino.css`, nuovo `app/(app)/macro-desk/layout.tsx`, 8 `page.tsx` del desk, `listino/primitive.tsx`, `listino/volatilita.tsx` | 18 | C2 +20 su tutto il desk, C7 +10 ovunque | **alto**: cambia l'aspetto di ogni pagina del desk. Driver e Stagionalità ⚠ restano fuori finché non autorizzati |
| P1-2 | **Testata di pagina unica** e **navigazione del desk a schede** su una riga | nuovo `components/layout/page-header.tsx`; `components/macro-desk/section-nav.tsx`; ~20 `page.tsx` | 8 | C1 +10 sul desk, C7 +8 ovunque | medio |
| P1-3 | **Report MD** secondo 1a (o 1b) | `macro-desk/report/page.tsx`, `macro-desk/[id]/page.tsx`, `components/macro-desk/report-tabs.tsx`, `report-detail.tsx` | 16–26 | S16 41,8 → ~82 | medio |
| P1-4 | **Analytics** secondo 3a (o 3b) | `analytics/page.tsx`, `components/analytics/*` | 12–22 | S7 48,2 → ~80 | medio |
| P1-5 | **Scorecard** secondo 2a (o 2b) | `macro-desk/scorecard/page.tsx`, `scorecard-em-view.tsx` | 7–14 | S17 51,6 → ~84 | basso |
| P1-6 | **Tabella numerica standard** in due densità (variante di `ui/table`) applicata a Trade View, Reports, Dashboard e alle 5 tabelle grezze di Analytics; righe totale nei Reports | `components/ui/table.tsx`, `reports/page.tsx`, `performance-bar-table.tsx`, `segment-table.tsx`, `target-r-table.tsx`, `concentration-table.tsx`, `correlation-matrix.tsx` | 10 | C5 +15 su S2, S4, S6, S7 | medio |
| P1-7 | **Colore solo sul segno**: LONG/SHORT e badge «Aperto» neutri, esiti e conteggi senza tinta | `trades/page.tsx:311,405`, `day/[date]/page.tsx:483`, `trades/[id]/page.tsx:305,315`, `reports/page.tsx:609,656,670`, `dashboard-view.tsx:1590`, `trends-view.tsx:76-82` | 3 | C3 +8 su S2, S3, S4, S5, S6, S13 | basso |
| P1-8 | **Dashboard**: un KPI hero e tre secondari in testa, metriche avanzate compresse in una riga, niente card dentro card | `components/dashboard/dashboard-view.tsx` | 8 | S2 59,8 → ~72 | medio |

### Onda P2 — Rifinitura (~50 h · voto atteso ~84)

| # | Cosa fare | File | Ore | Voto atteso | Rischio |
|---|---|---|---:|---|---|
| P2-1 | Un componente per compito: segmentato (8 → 1), schede (6 → 1), spiegazione (4 → 2: `MetricInfo` e `Info`), stato vuoto (5 → 1) | `hour-basis-toggle.tsx`, `rolling-controls.tsx`, `rolling-charts.tsx`, `trends-view.tsx:640-698`, `report-detail.tsx:80-115`, `controls.tsx` ⚠, `empty-state.tsx`, `primitives.tsx:165` | 16 | C7 +10 ovunque | medio |
| P2-2 | Grafici: niente `monotone` sulle cumulative a pochi punti; `role="img"` e `aria-label` sui Recharts; legenda con l'asse nei multi-serie | `day/intraday-pnl-chart.tsx:84`, `dashboard/pnl-charts.tsx:157,168`, `charts/underwater-chart.tsx:83`; `driver-desk-chart.tsx` ⚠ | 6 | S3 C6 45→70, C6 +5 altrove | basso |
| P2-3 | Trends theme-aware (passa a `.md-listino` come dichiarato nella documentazione) | `macro-desk/trends/page.tsx:111`, `trends-view.tsx`, `trends-chart.tsx` | 8 | S13 55,9 → ~70 | medio |
| P2-4 | Mobile: segnale di scorrimento sulle tabelle del listino; Analytics e Report sotto 4.000px a 390 (conseguenza di P1-3/P1-4); grafici del Driver con altezza minima e legenda sotto ⚠ | `listino.css:279` (`.ml-scroll`); `driver-desk-chart.tsx:156` ⚠ | 8 | C9 +10 sul desk | basso (listino), ⚠ Driver |
| P2-5 | Indice del Macro Desk con un dato per porta (data dell'ultimo report, livello del VIX, prossimo evento) | `macro-desk/page.tsx` | 5 | S10 56,2 → ~74 | basso: nuove letture, nessuna scrittura |
| P2-6 | Lingua e raggi: «Daily/Weekly», «Close» dei dialog, raggi arbitrari (43) portati al token | `report/page.tsx`, `ui/dialog.tsx:79`, `ui/sheet.tsx`, i 25 `rounded-[…]` in `components/macro-desk` | 4 | C10 +8 | basso |
| P2-7 | Calendario a 4 stati («nessun trade» distinto da «0») e totale/medio nei Reports | `day/page.tsx:213-267`, `reports/page.tsx` | 4 | S3 C1 +5, S6 C1 +8 | basso |

### Dopo le tre onde

Il voto stimato è **~84**. Per arrivare a **90** non basta il codice. Servono:

- una **prova d'uso cronometrata** (i compiti dell'[Autocritica](#8-autocritica));
- una verifica su **dati di produzione freschi**, senza la banda di ritardo;
- decidere con il proprietario se **Driver e Stagionalità** entrano nel sistema unico.

Finché restano isole scure con tre caratteri, C3 e C7 non superano ~75 su quelle sezioni.

### Cosa NON vale la pena fare

- **Ridisegnare Driver e Stagionalità da zero.** La Stagionalità è fra le tre migliori sezioni ed è congelata; il Driver perde punti su tema, mobile e caratteri, non sull'impaginazione. Basta farle entrare nel sistema (token e font) se autorizzato.
- **Tre densità di tabella alla Koyfin.** Con un solo utente e due contesti (app e desk) bastano due densità; la terza è una preferenza da mantenere senza nessuno che la chieda.
- **Unificare i due motori di grafici** (Recharts e SVG custom). Costo alto, beneficio visivo nullo se entrambi leggono gli stessi token e seguono la stessa spec.
- **Palette comandi `Cmd+K`.** Utile, ma è navigazione, non design: le azioni frequenti sono già a un clic (`+` e scorciatoia «n»). Non alza nessun criterio della rubrica.
- **Animazioni o effetti «wow»** (ingressi a cascata, glow, sparkline decorative). Il progetto ha già durata e easing unici e il `prefers-reduced-motion` rispettato; aggiungerne abbassa C10 in un prodotto di consultazione.
- **Rifare la pagina di accesso** con illustrazioni o immagini: è la sezione col voto più alto e la si vede una volta al mese.
- **Toggle di densità o layout personalizzabile della Dashboard.** Il menu dei widget esiste già; il problema è il default, non la mancanza di opzioni.

---

## 8. Autocritica

Tre giudizi di cui sono meno sicuro:

1. **Quanto pesa l'«isola scura» in tema chiaro** (C3 e C7 di Driver, Trends e Stagionalità).
   - L'ho penalizzata perché rompe il patto del tema, ma il **default dell'app è scuro** (`app/layout.tsx:65`): se il proprietario non usa mai il tema chiaro, quel difetto non esiste nell'uso reale e le tre sezioni valgono 3–5 punti in più.
   - *Per renderlo certo:* sapere quale tema si usa davvero. Oggi non è registrato da nessuna parte (`localStorage` del browser); basterebbe chiederlo.
2. **Il voto di Analytics (48) e il suo C1 a 35.**
   - La lunghezza è misurata (7.083px) e la mancanza di un indice fisso è un fatto.
   - Ma «muro» presuppone che la pagina si usi per trovare una risposta; se invece si legge dall'alto in basso una volta al mese, come un report, la lunghezza è meno grave.
   - *Per renderlo certo:* una prova con tre compiti cronometrati (trovare il risk of ruin, la fascia oraria peggiore, lo Sortino rolling a 60 sedute) sulla pagina di oggi e su un prototipo 3a.
3. **La penalità alla micro-tipografia del Listino** (C2 45 in Volatilità).
   - Ho applicato il minimo di 11–12px di Geist e dei riferimenti; il Listino però ha scelto consapevolmente la densità da terminale (`docs/macro-forma/REFERTO.md`), e la leggibilità di un 9,5px maiuscolo dipende da monitor, densità di pixel e distanza, che non ho misurato.
   - I contrasti invece sono certi (4,00–4,25:1).
   - *Per renderlo certo:* uno screenshot a 100% sul monitor abituale del proprietario e una prova di lettura delle intestazioni a distanza normale. Si fa in cinque minuti, ma è una verifica manuale che questo referto non poteva chiedere.

Altri due limiti meno gravi:

- La causa dell'errore #418 è **dedotta, non verificata**.
- I pesi d'uso delle sezioni sono **stimati**. Non ho calcolato quanto si sposta il voto globale cambiandoli. Con voti di sezione compresi fra 41,8 e 69,3, però, nessuna ridistribuzione plausibile lo porta sopra 65.
