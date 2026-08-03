import { promises as fs } from "node:fs";
import { prisma } from "@/lib/db";
import { MAX_IMPORT_ROWS, persistTradeInputs } from "@/lib/import-core";
import { mt5RecordToImportRow, parseMt5File } from "@/lib/mt5-import";
import { MT5_PATH_FUORI_BASE, mt5BaseDir, resolveMt5Path } from "@/lib/mt5-path";

/**
 * Watcher MT5 in-app (avviato una volta da instrumentation.ts): ogni
 * POLL_INTERVAL_MS controlla i file NDJSON delle sorgenti abilitate.
 *
 * Architettura deliberatamente SENZA STATO su disco: quando il file cambia
 * (mtime/size) viene riletto per intero e la dedup su brokerTicketId scarta
 * il già importato — il watcher non può desincronizzarsi, un retry è gratis.
 *
 * Robustezza: ogni tick e ogni sorgente sono dentro try/catch (il loop non
 * muore mai); file mancante/lockato → si riprova al giro dopo; l'ultima riga
 * incompleta (EA a metà append) è skippata in silenzio dal parser.
 */

const POLL_INTERVAL_MS = 10_000;
/**
 * P-10 — con ZERO sorgenti configurate (il caso tipico in produzione Vercel,
 * dove peraltro il sync non può funzionare: vedi nota sotto) il polling a
 * 10s erano ~8.600 query/giorno per istanza senza alcun lavoro possibile:
 * a vuoto si rallenta, e si torna a 10s appena una sorgente compare.
 * In produzione serverless il watcher non parte proprio: serve
 * MT5_WATCHER_ENABLED=1, che si imposta solo dove MetaTrader gira davvero.
 */
const IDLE_INTERVAL_MS = 120_000;
/** Esiti/righe salvati in lastResult: troncati per non gonfiare il Json. */
const MAX_REPORTED_ITEMS = 20;

interface FileSnapshot {
  mtimeMs: number;
  size: number;
}

interface WatcherState {
  running: boolean;
  ticking: boolean;
  snapshots: Map<string, FileSnapshot>;
  /** Ultimo messaggio di stato per sorgente: evita scritture DB/log a raffica. */
  lastStatus: Map<string, string>;
}

// Sopravvive agli HMR/reimport in dev: una sola istanza per processo.
const GLOBAL_KEY = Symbol.for("lb-tradejournal.mt5-watcher");
type GlobalWithWatcher = typeof globalThis & {
  [GLOBAL_KEY]?: WatcherState;
};

function getState(): WatcherState {
  const g = globalThis as GlobalWithWatcher;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      running: false,
      ticking: false,
      snapshots: new Map(),
      lastStatus: new Map(),
    };
  }
  return g[GLOBAL_KEY];
}

/**
 * P2-9 — interruttore INVERTITO. Prima il watcher partiva da solo e si
 * spegneva con MT5_WATCHER_DISABLED=1: dimenticare la variabile lo lasciava
 * acceso, ed è esattamente ciò che è successo in produzione su Vercel.
 * Ora parte solo se qualcuno lo chiede esplicitamente, e serve anche la
 * cartella base: senza, non ci sarebbe nessun percorso valido da leggere.
 */
export function startMt5Watcher(): void {
  if (process.env.MT5_WATCHER_ENABLED !== "1") return;
  if (!mt5BaseDir()) {
    console.warn(
      "[mt5-sync] MT5_WATCHER_ENABLED=1 ma MT5_WATCH_DIR non è configurata: watcher non avviato",
    );
    return;
  }
  const state = getState();
  if (state.running) return;
  state.running = true;

  console.log(
    `[mt5-sync] watcher attivo (polling ${POLL_INTERVAL_MS / 1000}s · ${IDLE_INTERVAL_MS / 1000}s senza sorgenti)`,
  );
  // Catena di setTimeout invece di setInterval: il prossimo giro parte solo
  // a tick concluso (niente re-entrancy possibile) e con l'intervallo scelto
  // dall'esito — lento a zero sorgenti, pieno appena ne compare una.
  const run = () => {
    state.ticking = true;
    void tick(state)
      .then((sourceCount) => {
        setTimeout(run, sourceCount === 0 ? IDLE_INTERVAL_MS : POLL_INTERVAL_MS);
      })
      .catch((error) => {
        // Mai far morire il loop: DB giù o altro → si riprova al prossimo giro.
        logOnce(state, "__tick__", `tick fallito: ${describe(error)}`);
        setTimeout(run, POLL_INTERVAL_MS);
      })
      .finally(() => {
        state.ticking = false;
      });
  };
  setTimeout(run, POLL_INTERVAL_MS);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Logga solo quando il messaggio cambia (niente spam ogni 10s). */
function logOnce(state: WatcherState, key: string, message: string): void {
  if (state.lastStatus.get(key) === message) return;
  state.lastStatus.set(key, message);
  console.warn(`[mt5-sync] ${message}`);
}

/** @returns il numero di sorgenti abilitate (per il backoff a zero). */
async function tick(state: WatcherState): Promise<number> {
  const sources = await prisma.mt5SyncSource.findMany({
    where: { enabled: true },
    include: { user: { select: { timezone: true } } },
  });

  for (const source of sources) {
    try {
      await syncSource(state, source);
    } catch (error) {
      logOnce(state, source.id, `sorgente ${source.filePath}: ${describe(error)}`);
    }
  }
  return sources.length;
}

type SourceWithUser = Awaited<
  ReturnType<typeof prisma.mt5SyncSource.findMany>
>[number] & { user: { timezone: string } };

async function syncSource(
  state: WatcherState,
  source: SourceWithUser,
): Promise<void> {
  /*
   * P2-9 — il percorso si ri-valida QUI, non solo quando l'utente lo salva:
   * la riga a database potrebbe essere più vecchia del confinamento, o la
   * cartella base essere cambiata. È il punto immediatamente prima delle
   * uniche due chiamate al filesystem, quindi è quello che conta davvero.
   */
  const percorso = resolveMt5Path(mt5BaseDir(), source.filePath);
  if (!percorso) {
    logOnce(state, source.id, `sorgente ${source.filePath}: ${MT5_PATH_FUORI_BASE}`);
    return;
  }

  let stat;
  try {
    stat = await fs.stat(percorso);
  } catch {
    // File non (ancora) presente: stato annotato una volta, si riprova dopo.
    const message = "file non trovato (in attesa dell'EA)";
    if (state.lastStatus.get(source.id) !== message) {
      state.lastStatus.set(source.id, message);
      await prisma.mt5SyncSource.update({
        where: { id: source.id },
        data: { lastResult: { error: message } },
      });
    }
    return;
  }

  const snapshot = state.snapshots.get(source.id);
  if (snapshot && snapshot.mtimeMs === stat.mtimeMs && snapshot.size === stat.size) {
    return; // File invariato: nessun lavoro, nessuna scrittura.
  }

  const content = await fs.readFile(percorso, "utf8");
  const { records, malformed, partialTail } = parseMt5File(content);

  const rows = records.map((record) =>
    mt5RecordToImportRow(record, {
      timezone: source.user.timezone,
      assetClass: source.assetClass,
    }),
  );

  // A blocchi: file molto grandi non devono produrre transazioni monstre.
  let imported = 0;
  let duplicates = 0;
  const failed: { row: number; error: string }[] = [];
  const divergences: {
    row: number;
    brokerTicketId: string;
    computedNet: string;
    brokerProfit: string;
  }[] = [];
  for (let offset = 0; offset < rows.length; offset += MAX_IMPORT_ROWS) {
    const chunk = rows.slice(offset, offset + MAX_IMPORT_ROWS);
    const result = await persistTradeInputs({
      userId: source.userId,
      tradingAccountId: source.tradingAccountId,
      timezone: source.user.timezone,
      rows: chunk,
    });
    imported += result.imported;
    duplicates += result.duplicates;
    failed.push(
      ...result.failed.map((f) => ({ ...f, row: f.row + offset })),
    );
    divergences.push(
      ...result.divergences.map((d) => ({ ...d, row: d.row + offset })),
    );
  }

  await prisma.mt5SyncSource.update({
    where: { id: source.id },
    data: {
      lastSyncAt: new Date(),
      lastResult: {
        imported,
        duplicates,
        malformed: malformed.slice(0, MAX_REPORTED_ITEMS),
        failed: failed.slice(0, MAX_REPORTED_ITEMS),
        divergences: divergences.slice(0, MAX_REPORTED_ITEMS),
        partialTail,
      },
    },
  });

  // Snapshot aggiornato SOLO a elaborazione riuscita: un errore sopra
  // lascia il file "da riprovare" al prossimo tick.
  state.snapshots.set(source.id, { mtimeMs: stat.mtimeMs, size: stat.size });
  state.lastStatus.delete(source.id);

  if (imported > 0 || failed.length > 0 || malformed.length > 0) {
    console.log(
      `[mt5-sync] ${source.filePath}: +${imported} importati · ${duplicates} duplicati skippati · ${failed.length + malformed.length} scarti${divergences.length > 0 ? ` · ${divergences.length} divergenze P&L` : ""}`,
    );
  }
}
