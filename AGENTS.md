<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# L&B TradeJournal — regole di progetto

Trading journal SaaS (MVP). Blueprint funzionale: specifica esterna, fasi 1-8 in PROGRESS.md.

## Stack (vincolante)
Next.js 16 App Router · TypeScript strict · PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`, client generato in `src/generated/prisma`) · Tailwind v4 + shadcn/ui (preset radix-nova) · Auth.js v5 (JWT session, credentials + Google) · Zod v4 · Vitest. In arrivo nelle fasi successive: TanStack Table, Papaparse, Recharts.

## Regole non negoziabili
- **Denaro/prezzi/quantità**: sempre `Decimal` Postgres (importi 14,2 · prezzi/qty 18,8). Mai `number` JS per i calcoli: i valori viaggiano come stringhe decimali, la conversione a `Number` è ammessa SOLO per la formattazione display (`src/lib/money.ts`).
- **Timezone**: timestamp salvati in UTC; bucketing giornaliero e display nel fuso di `User.timezone` (default Europe/Rome).
- **Aggregazioni** pesanti in SQL/Prisma (`groupBy`, raw query) — mai caricare tutti i trade in memoria JS.
- **Colori P&L** coerenti ovunque: verde profitto (`text-profit`), rosso perdita (`text-loss`), grigio breakeven (`text-breakeven`) — variabili in `globals.css`. Accento primario: blu.
- **Mai stato a livello di MODULO nel codice che serve richieste**: in un server component, route handler, middleware o server action il modulo è condiviso fra le richieste e vive quanto il processo — un `let`, un oggetto o una Map scritti durante una richiesta finiscono nella pagina di un altro utente. Passa il valore come prop/argomento. La regola è imposta da eslint su `src/app/**` e `src/server/**`; in `src/lib/**` restano leciti i casi valutati e chiavati (rate limiter, memoizzazioni non legate all'utente), ma vanno motivati nel commento.
- **Sicurezza dati**: ogni query su dati utente filtra per `userId` (vedi pattern `updateMany({ where: { id, userId } })` in `src/server/accounts.ts`).
- **Script che scrivono sul DB** (seed, backfill, cleanup, sonde di scrittura): la connection string si prende SOLO da `src/lib/db-guard.ts` (`guardedPgAdapter` / `resolveWritableDatabaseUrl`). Mai `new PrismaPg({ connectionString: process.env.DATABASE_URL })` diretto, mai un fallback hardcoded: se l'host non è locale lo script deve morire, a meno di `ALLOW_REMOTE_DB=1` esplicito da chi lancia il comando.
- Le metriche (FASE 4) vanno in `src/lib/metrics/` come modulo puro con unit test per ogni formula (inclusi divisione per zero, zero trade, tutti loss).
- **Una sola serie giornaliera**: `dailyReturns()` in `src/lib/metrics/daily-series.ts` (sedute feriali, giornate senza trade a P&L 0). Ogni metrica per-giornata — Sortino, Sharpe, Ulcer, Max Drawdown, Underwater, rolling — consuma quella. Non ricostruire serie temporali dai bucket grezzi di `getDailyPnl`: contengono i soli giorni con trade, ed è così che lo stesso Sortino era arrivato a valere due cose diverse in due pagine.
- **Debito tecnico noto** in `docs/DEBITO-TECNICO.md`: leggerlo prima di toccare metriche o seed, per non riscoprire problemi già registrati (in particolare il generatore di `prisma/seed.ts`, che produce serie troppo regolari e va rigenerato in un intervento a sé).

## Struttura
- `src/server/*.ts` — server actions ("use server"): solo export di funzioni async; le costanti condivise stanno in `src/lib/constants.ts`.
- `src/lib/validations/*.ts` — schemi Zod per ogni input.
- Modello `Account` = OAuth Auth.js; il conto di trading è `TradingAccount`.
- Conto attivo selezionato via cookie `tj-account` (`ALL_ACCOUNTS` = tutti).

## Comandi
- `npm run db:up` (docker compose: Postgres 17 + Adminer su :8080) · `db:migrate` · `db:seed`
- `npm test` · `npm run lint` · `npm run typecheck` · `npm run build`
- Ogni fase si chiude con: build verde, test verdi, nota in PROGRESS.md.

## Pubblicare: le migrazioni NON partono da sole
**La build non applica più le migrazioni.** Dal 28/08/2026 lo script di build è
`prisma generate && … && next build`: `prisma migrate deploy` è stato tolto, perché su Vercel
`DATABASE_URL` è **un solo record** valido sia per Production sia per Preview — finché quel
comando stava nella build, *pubblicare un branch qualsiasi applicava migrazioni al database di
produzione*. Ora nessuna build tocca lo schema, e applicarlo è compito di chi pubblica.

**Se il tuo push contiene una nuova cartella in `prisma/migrations/`, prima di pushare:**

```
ALLOW_REMOTE_DB=1 npm run db:deploy      # con l'ambiente di produzione caricato
```

- **L'ordine è: migrazione PRIMA, push DOPO. Mai il contrario.** Al contrario si ottiene codice
  in produzione che cerca colonne inesistenti, e l'errore salta fuori a caso, in una pagina a
  caso, anche giorni dopo.
- Senza `ALLOW_REMOTE_DB=1` il comando **muore apposta** se il database non è locale: è la
  guardia di `src/lib/db-guard.ts`, non un intoppo. Stampa l'host prima di agire: leggilo.
- Se il push non aggiunge migrazioni, non devi fare nulla.

**Come si verifica, dopo il deploy** (`CRON_SECRET` è la stessa dei cron):

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/health/migrazioni
```

**200** = schema allineato. **500** = schema indietro rispetto al codice, e la risposta
**elenca i nomi** delle migrazioni mancanti e il comando per applicarle. Lo stesso controllo
gira da solo ogni notte dentro `/api/seasonality-sync`, che diventa rosso in Vercel se qualcosa
manca: è la rete di sicurezza, non un sostituto della regola qui sopra.

## Attenzioni pratiche
- Prisma 7: connection string in `prisma.config.ts` (non nello schema); `prisma generate` gira in postinstall e nel build.
- Non usare PowerShell `Get-Content/Set-Content` per modificare file sorgente: corrompe le lettere accentate (usare i tool di edit).
