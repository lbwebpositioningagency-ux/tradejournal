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
- **Sicurezza dati**: ogni query su dati utente filtra per `userId` (vedi pattern `updateMany({ where: { id, userId } })` in `src/server/accounts.ts`).
- **Script che scrivono sul DB** (seed, backfill, cleanup, sonde di scrittura): la connection string si prende SOLO da `src/lib/db-guard.ts` (`guardedPgAdapter` / `resolveWritableDatabaseUrl`). Mai `new PrismaPg({ connectionString: process.env.DATABASE_URL })` diretto, mai un fallback hardcoded: se l'host non è locale lo script deve morire, a meno di `ALLOW_REMOTE_DB=1` esplicito da chi lancia il comando.
- Le metriche (FASE 4) vanno in `src/lib/metrics/` come modulo puro con unit test per ogni formula (inclusi divisione per zero, zero trade, tutti loss).

## Struttura
- `src/server/*.ts` — server actions ("use server"): solo export di funzioni async; le costanti condivise stanno in `src/lib/constants.ts`.
- `src/lib/validations/*.ts` — schemi Zod per ogni input.
- Modello `Account` = OAuth Auth.js; il conto di trading è `TradingAccount`.
- Conto attivo selezionato via cookie `tj-account` (`ALL_ACCOUNTS` = tutti).

## Comandi
- `npm run db:up` (docker compose: Postgres 17 + Adminer su :8080) · `db:migrate` · `db:seed`
- `npm test` · `npm run lint` · `npm run typecheck` · `npm run build`
- Ogni fase si chiude con: build verde, test verdi, nota in PROGRESS.md.

## Attenzioni pratiche
- Prisma 7: connection string in `prisma.config.ts` (non nello schema); `prisma generate` gira in postinstall e nel build.
- Non usare PowerShell `Get-Content/Set-Content` per modificare file sorgente: corrompe le lettere accentate (usare i tool di edit).
