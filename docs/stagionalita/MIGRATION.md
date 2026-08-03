# MIGRATION — lo SQL, per intero

File: `prisma/migrations/20260803120000_seasonality/migration.sql`

**Stato: applicata al Postgres LOCALE, NON a Neon.** La connection string di
Neon non è accessibile da questa macchina — `.env.production.local` contiene i
placeholder `[SENSITIVE]` scritti da `vercel env pull`, perché le variabili
sono marcate come sensibili sul progetto e non vengono esportate. Vedi le
azioni umane in fondo a questo file.

Le migrazioni del modulo sono **tre**:

| Migrazione | Contenuto |
|---|---|
| `20260803120000_seasonality` | 4 `CREATE TYPE` + 6 `CREATE TABLE` + 1 indice |
| `20260803160000_seasonality_monthly_obs` | 1 `CREATE TABLE` (osservazioni mensili per la heatmap) |
| `20260803190000_seasonality_path_positive` | 1 `ALTER TABLE ... ADD COLUMN` su `SeasonalityPathPoint` |

L'unico `ALTER` agisce su una tabella **creata dalla prima migrazione di
questo stesso branch**: nessuna tabella preesistente dell'applicazione viene
toccata da nessuna delle tre.

## Come è stata generata senza database

```bash
git show HEAD:prisma/schema.prisma > /tmp/old-schema.prisma
npx prisma migrate diff \
  --from-schema /tmp/old-schema.prisma \
  --to-schema  prisma/schema.prisma \
  --script -o prisma/migrations/20260803120000_seasonality/migration.sql
```

`migrate diff` fra **due file di schema** non richiede né database né shadow
database, e produce esattamente lo SQL che `prisma migrate deploy` applicherà
al deploy.

## Verifica di additività

| Istruzione | Conteggio |
|---|---|
| `CREATE TYPE` | 4 |
| `CREATE TABLE` | 6 |
| `CREATE INDEX` | 1 |
| **`ALTER TABLE`** | **0** |
| **`DROP` (qualunque)** | **0** |

Nessuna tabella, colonna, enum o indice **esistente** viene toccato: le
tabelle dell'app (`User`, `Trade`, `TradingAccount`, `CotWeek`, …) restano
identiche byte per byte. Applicarla su un database condiviso non ha effetto
sull'app in produzione — aggiunge soltanto oggetti nuovi che nessun codice
già deployato conosce.

## Quando verrà applicata

Al primo deploy del branch, perché `npm run build` esegue
`prisma migrate deploy`. Finché il branch non viene mergiato su `main` non
parte nessun deploy di produzione.

---

## SQL integrale

```sql
-- CreateEnum
CREATE TYPE "SeasonalityInstrument" AS ENUM ('XAUUSD', 'WTI', 'GER40', 'SPX', 'GVZ', 'OVX', 'VDAX', 'VIX');

-- CreateEnum
CREATE TYPE "SeasonalityKind" AS ENUM ('RETURN', 'LEVEL');

-- CreateEnum
CREATE TYPE "SeasonalityGranularity" AS ENUM ('MONTH', 'WEEK', 'WEEKDAY', 'SESSION', 'HOUR');

-- CreateEnum
CREATE TYPE "SeasonalityClock" AS ENUM ('UTC', 'ROME');

-- CreateTable
CREATE TABLE "SeasonalityDailyBar" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "date" DATE NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "SeasonalityDailyBar_pkey" PRIMARY KEY ("instrument","date")
);

-- CreateTable
CREATE TABLE "SeasonalityHourBar" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "SeasonalityHourBar_pkey" PRIMARY KEY ("instrument","ts")
);

-- CreateTable
CREATE TABLE "SeasonalityStat" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "kind" "SeasonalityKind" NOT NULL,
    "granularity" "SeasonalityGranularity" NOT NULL,
    "clock" "SeasonalityClock" NOT NULL,
    "scope" TEXT NOT NULL,
    "lookbackYears" INTEGER NOT NULL,
    "detrended" BOOLEAN NOT NULL,
    "bucket" INTEGER NOT NULL,
    "n" INTEGER NOT NULL,
    "mean" DECIMAL(18,8) NOT NULL,
    "median" DECIMAL(18,8) NOT NULL,
    "stdev" DECIMAL(18,8),
    "positiveShare" DECIMAL(18,8) NOT NULL,
    "p25" DECIMAL(18,8) NOT NULL,
    "p75" DECIMAL(18,8) NOT NULL,
    "firstDate" DATE NOT NULL,
    "lastDate" DATE NOT NULL,

    CONSTRAINT "SeasonalityStat_pkey" PRIMARY KEY ("instrument","granularity","clock","scope","lookbackYears","detrended","bucket")
);

-- CreateTable
CREATE TABLE "SeasonalityPathPoint" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "lookbackYears" INTEGER NOT NULL,
    "detrended" BOOLEAN NOT NULL,
    "dayOfYear" INTEGER NOT NULL,
    "meanCum" DECIMAL(18,8) NOT NULL,
    "medianCum" DECIMAL(18,8) NOT NULL,
    "p25Cum" DECIMAL(18,8) NOT NULL,
    "p75Cum" DECIMAL(18,8) NOT NULL,
    "n" INTEGER NOT NULL,

    CONSTRAINT "SeasonalityPathPoint_pkey" PRIMARY KEY ("instrument","lookbackYears","detrended","dayOfYear")
);

-- CreateTable
CREATE TABLE "SeasonalityCoverage" (
    "instrument" "SeasonalityInstrument" NOT NULL,
    "kind" "SeasonalityKind" NOT NULL,
    "dailySource" TEXT,
    "dailyFirst" DATE,
    "dailyLast" DATE,
    "dailyRows" INTEGER NOT NULL DEFAULT 0,
    "hourSource" TEXT,
    "hourFirst" TIMESTAMPTZ(3),
    "hourLast" TIMESTAMPTZ(3),
    "hourRows" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalityCoverage_pkey" PRIMARY KEY ("instrument")
);

-- CreateTable
CREATE TABLE "SeasonalityRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "detail" JSONB,

    CONSTRAINT "SeasonalityRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonalityRun_startedAt_idx" ON "SeasonalityRun"("startedAt");
```


---

## Come applicarle a Neon

Il comando è uno solo e applica **solo le migrazioni non ancora applicate**
(le tre della Stagionalità; le 14 precedenti risultano già presenti):

```bash
npx prisma migrate deploy
```

Perché non l'ho eseguito io: `prisma migrate deploy` legge `DATABASE_URL`, che
in locale punta al Postgres Docker. Per farlo puntare a Neon serve la
connection string di produzione, che su questa macchina non è leggibile.

Le tre migrazioni verranno comunque applicate **da sole** al primo deploy del
branch, perché `npm run build` esegue `prisma migrate deploy`. Non serve fare
niente a mano se si preferisce aspettare il deploy.
