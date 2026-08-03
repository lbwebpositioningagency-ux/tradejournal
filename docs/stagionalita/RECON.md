# RECON — cosa c'è già nel repo e cosa riuso

Ricognizione del 03/08/2026, branch `feature/seasonality`.
Obiettivo: non reinventare nulla che il progetto abbia già.

---

## 1. Framework e versioni

| Cosa | Versione | Note |
|---|---|---|
| Next.js | **16.2.10**, App Router | `src/app/`, route group `(app)` per l'area autenticata |
| React | 19.2.4 | Server Components di default |
| TypeScript | 5.x, **strict** | `npm run typecheck` |
| Tailwind | v4 (`@tailwindcss/postcss`) | niente `tailwind.config.js`: i token stanno in `src/app/globals.css` |
| shadcn/ui | preset radix-nova | componenti in `src/components/ui/` |
| Recharts | 3.9.2 | vedi §6 |
| Zod | v4 | schemi in `src/lib/validations/` |
| Vitest | 4.1.10 | `npm test` |
| Auth.js | v5 beta (JWT) | `src/lib/auth.ts`, `auth()` nelle pagine server |

**Attenzione dichiarata in `AGENTS.md`:** questa versione di Next ha breaking
change rispetto alla conoscenza pregressa; la documentazione autorevole è
`node_modules/next/dist/docs/`.

## 2. ORM e migrazioni

- **Prisma 7.8.0** con driver adapter `@prisma/adapter-pg`.
- Client generato in **`src/generated/prisma`** (non `@prisma/client`): gli
  import nel codice sono `from "@/generated/prisma/client"`.
- La connection string **non sta nello schema** ma in `prisma.config.ts`, che
  legge `process.env.DATABASE_URL` (novità Prisma 7).
- `prisma generate` gira in `postinstall` **e** dentro `npm run build`.
- Il build di produzione esegue **`prisma migrate deploy`**: le migrazioni
  vengono applicate automaticamente al deploy su Vercel. → *È la ragione per
  cui il branch non va mergiato su `main` finché la migrazione non è
  approvata.*
- Migrazioni esistenti: 14, in `prisma/migrations/`, formato standard
  `<timestamp>_<nome>/migration.sql`.

**Come ho generato la nuova migrazione senza toccare il database:**
`prisma migrate diff --from-schema <schema di HEAD> --to-schema <schema nuovo> --script`.
Confronta due file, non richiede né database né shadow database, e produce
esattamente lo SQL che `migrate deploy` applicherà. Nessun comando ha toccato
Neon.

⚠️ `npm run db:seed` **non è stato eseguito e non lo sarà**: cancella l'utente
demo. Non serve a questo lavoro.

## 3. Env e secret

| File | Contenuto | Chi lo legge |
|---|---|---|
| `.env` | `DATABASE_URL`, `AUTH_SECRET`, credenziali Google, `AUTH_TRUST_HOST`, `MACRO_DESK_API_SECRET` | sviluppo locale |
| `.env.local` | `CRON_SECRET`, `GEMINI_API_KEY`, `VERCEL_OIDC_TOKEN` | sviluppo locale (creato da Vercel CLI) |
| `.env.production.local` | idem lato produzione | non letto in questa ricognizione |
| `.env.example` | modello senza valori | documentazione |

In produzione le variabili vivono nelle **Environment Variables del progetto
Vercel**. Nessun valore è stato stampato in questa sessione, e nessuno lo sarà.

**Pattern di autorizzazione dei job** (già in uso, lo riuso tale e quale):
`src/lib/macro-desk.ts` → `isAuthorizedMacroRequest(header, secret)` fa un
confronto **timing-safe** e **fail-closed** (se il secret non è configurato,
nega) sull'header `Authorization: Bearer <CRON_SECRET>`. È l'header che Vercel
aggiunge da sé alle invocazioni cron quando `CRON_SECRET` esiste sul progetto.

## 4. Dov'è il Macro Desk

```
src/app/(app)/macro-desk/
├── page.tsx            indice dei report
├── [id]/page.tsx       dettaglio report
├── scorecard/page.tsx
└── trends/page.tsx     ← il modello più vicino a quello che devo costruire
src/components/macro-desk/
├── primitives.tsx      PanelLabel · MonoChip · Callout · RangeBar · SectionEmpty · ToneArrow
├── trends-view.tsx     tab + sezioni in Suspense
├── trends-chart.tsx    grafico Recharts
├── cot-panel.tsx       usa RangeBar
└── termometro-volatilita.tsx
src/app/api/
├── macro-desk/route.ts endpoint protetto da MACRO_DESK_API_SECRET
└── cot-sync/route.ts   ← modello del job cron (vedi §3 e SCHEDULING.md)
src/lib/
├── fred.ts             client FRED riutilizzabile così com'è
├── cot-sync.ts         job con dipendenze iniettate (db/fetch/orologio)
└── macro-trends*.ts
```

Voce di navigazione: `src/components/layout/sidebar.tsx`, array `NAV_ITEMS`.
Regola documentata lì (**D-02**): *la label della voce deve coincidere
esattamente con l'`h1` e col `metadata.title` della pagina di destinazione.*
La nuova sezione si chiamerà **Stagionalità** in tutti e tre i punti.

**`src/lib/fred.ts` è riusabile senza modifiche.** Fa già: API con chiave →
fallback CSV keyless, scarto dei `.` (osservazione mancante, mai zero),
timeout esplicito 15 s, cache giornaliera con scadenze scaglionate
deterministiche per ID, parser puri esportati e testati.

## 5. Sessioni in ora italiana e DST

`src/lib/sessions.ts` — già deciso e testato nella Fase 35, **lo riuso**:

```
ASIA     00:00–08:00   (Tokyo)
LONDON   08:00–14:00   (Europa)
NEWYORK  14:00–22:00   (America)
OFF      22:00–24:00   (fuori sessione)
```

Proprietà che contano per me: è una **partizione contigua** dell'orologio
italiano — ogni minuto appartiene a esattamente una sessione, nessuna regola
di precedenza. Il fuso è `Europe/Rome` (costante `SESSION_TIMEZONE`) e la DST
è gestita dal fuso IANA, **mai** da un offset fisso.

Nel resto dell'app la conversione avviene in SQL col **doppio `AT TIME ZONE`**
(timestamp naive UTC → `Europe/Rome`). Nel mio job la conversione avviene in
TypeScript con `Intl.DateTimeFormat` + `timeZone`, che usa lo stesso database
IANA: stessa correttezza su CET/CEST, ma applicabile a centinaia di migliaia
di barre orarie in memoria durante il precalcolo. La regola sostanziale —
*mai un offset fisso* — è rispettata identica.

Giorni della settimana: `src/lib/weekdays.ts`, **solo lunedì-venerdì**
(decisione della Fase 59, cinque righe stabili e confrontabili). La
stagionalità di mercato la eredita, e qui ha anche una ragione propria: il
sabato non si scambia e la domenica esistono solo le due-tre ore serali di
riapertura, un campione non confrontabile con una giornata piena.

## 6. Grafici Recharts — come sono lazy-loadati

`src/components/charts/lazy-charts.tsx` (**"use client"**):

```tsx
export const TradeSequenceChart = dynamic(
  () => import("./trade-sequence-chart").then((m) => m.TradeSequenceChart),
  { ssr: false, loading: () => <ChartFallback /> },
);
```

Tre vincoli da rispettare:
1. `ssr: false` **deve** stare in un client module (regola Next): per questo
   il wrapper è un file separato che le pagine server importano.
2. Il fallback è uno `Skeleton` con **la stessa altezza** del grafico
   (`CHART.height`): nessun layout shift allo swap.
3. Ogni valore visivo viene da **`src/components/charts/chart-spec.ts`**
   (`CHART.height/margin/strokeWidth/axisTick/tooltipStyle/…`), mai
   ridefinito localmente. Include anche `tooltipItemStyle` e
   `tooltipLabelStyle`, che esistono per un motivo preciso: Recharts scrive
   `color:#000` hardcodato sulle righe di tooltip delle serie senza colore
   proprio, illeggibile in dark mode.

→ I grafici della Stagionalità aggiungono le loro voci **in questo stesso
file** e consumano `CHART`.

## 7. Token del design system

Due palette distinte, e la Stagionalità userà la seconda:

**App** (`src/app/globals.css`): `--profit` / `--loss` / `--breakeven`,
accento primario blu, classi `text-profit` / `text-loss` / `text-breakeven`.

**Terminale Macro Desk**, scoped a `.macro-report`:

```
--md-bg  --md-surface  --md-surface-2  --md-surface-3  --md-border
--md-text  --md-text-2  --md-muted
--md-up  --md-down  --md-warn  --md-info
--md-gold  --md-oil  --md-idx  --md-cross
--md-r-lg (18px)  --md-r-md (13px)  --md-r-sm (9px)
```

Classi utili: `.md-card`, `.md-panel`, `.md-mono`.
Tipografia del terminale: `Inter` + `JetBrains_Mono` via `next/font/google`,
esposte come `--md-font-ui` / `--md-font-mono`.

**Daltonismo:** esiste un override della palette (`globals.css` ~riga 520) che
rimappa `--md-up` → `#4a87ff` e `--md-down` → `#9970ff` (blu/viola invece di
verde/rosso). Usare i token `--md-up`/`--md-down` fa ereditare la variante
accessibile **gratis**; scrivere un verde letterale la romperebbe. I colori
strumento sono già pronti: `--md-gold` per l'oro, `--md-oil` per il petrolio,
`--md-idx` per gli indici.

## 8. `RangeBar` — la primitiva da riusare

`src/components/macro-desk/primitives.tsx`.

```tsx
<RangeBar position={0..100} color="var(--md-up)" ticks={[20,80]}
         ariaLabel="…" title="…" />
```

È un indicatore di **posizione**, non di quantità: un punto su una scala, non
un riempimento (le barre di riempimento sono `bias-gauge` / `report-tabs` e
misurano un "quanto"). La traccia usa `--md-surface-3`; il colore
dell'indicatore lo decide il chiamante, che conosce la semantica.

Nota lasciata nel codice e da non far ricadere: **niente `flex-1` sulla
traccia** — dentro un contenitore `flex-col`, `flex:1 1 0%` azzera la
flex-basis sull'altezza e la barra sparisce. La larghezza piena si ottiene con
`w-full`.

**Uso previsto nella Stagionalità:** posizione del bucket corrente (mese/ora
di oggi) dentro il range storico dello strumento.

## 9. Tabelle di breakdown — lo stile da imitare

Tre componenti, non uno; le **funzioni di calcolo** sono centralizzate ma il
rendering è separato (decisione della Fase 60, da non ribaltare):

- `BreakdownTable` in `src/app/(app)/reports/page.tsx`
- `PerformanceBarTable` in `src/components/dashboard/`
- `SegmentTable` in `src/components/analytics/`

Struttura ricorrente di `BreakdownTable`, che riprendo:

- **Doppio rendering responsivo**: sotto `md` una `<ul>` di card impilate con
  il numero più importante *sempre in vista*; da `md` in su la tabella vera.
  Mai colonne che scompaiono oltre il bordo destro senza indizi (**F27**).
- Numeri sempre `tabular-nums`.
- Colore semantico via `pnlColorClass(value)`, mai colori letterali.
- Icona «i» (`src/components/metric-info.tsx`) su ogni metrica non ovvia.
- Set di colonne standardizzato e ordine fisso (Fase 60). *La Stagionalità
  non è una tabella di P&L: avrà il suo set — media, mediana, StDev, Pos%, n —
  ma erediterà responsività, tabular-nums, tooltip «i» e token di colore.*
- Formattatori da `src/lib/money.ts`: `formatPercent`, `formatRatio`,
  `formatSignedShort`, `pnlColorClass`.

## 10. Vincoli di progetto che questo lavoro deve rispettare

Da `AGENTS.md`, non negoziabili:

1. **Denaro/prezzi/quantità sempre `Decimal` Postgres** — le barre grezze e le
   statistiche salvate usano `DECIMAL(18,8)`. Deroga circoscritta e dichiarata
   in `SPEC.md` §4: il *kernel statistico* lavora in `number`, perché media e
   deviazione standard di rendimenti logaritmici sono irrazionali e una
   precisione decimale sarebbe finta. Il float non esce mai da quel modulo.
2. **Timezone**: salvato in UTC, mostrato nel fuso utente. Rispettato.
3. **Aggregazioni pesanti mai in memoria JS** riga per riga. Qui il precalcolo
   *è* l'aggregazione: gira una volta a notte nel job, e la pagina legge solo
   righe già aggregate — che è la forma più forte della stessa regola.
4. **Ogni query su dati utente filtra per `userId`.** Non si applica: la
   stagionalità è dato di mercato, senza `userId`, come `CotWeek` e
   `MacroDeskReport`. Resta il gate di autenticazione sulla pagina.
5. **Non usare PowerShell `Get-Content`/`Set-Content` sui sorgenti**: corrompe
   le lettere accentate. Usati solo i tool di edit.
