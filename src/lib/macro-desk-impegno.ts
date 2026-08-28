import {
  ASSET_PAYLOAD_A_RECORD,
  parseWeeklyBiasRecord,
  type AssetBiasRecord,
  type BiasBranch,
  type BiasInvalidation,
  type WeeklyBiasRecord,
} from "@/lib/macro-desk-bias-record";

/**
 * L'IMPEGNO DELLA DOMENICA — modulo PURO, nessun I/O.
 *
 * ── IL PROBLEMA ──────────────────────────────────────────────────────────
 *
 * Il Weekly Bias Record è una DICHIARAZIONE fatta la domenica: questo bias,
 * questo prezzo di riferimento, questo Expected Move, queste soglie dei rami.
 * La Scorecard misura quanto quella dichiarazione abbia poi retto.
 *
 * I report DAILY della settimana rispediscono lo stesso record aggiornandone
 * il monitoraggio, e l'upsert scriveva tutto quello che arrivava. Un daily che
 * avesse rispedito un `p0` diverso, o una soglia di ramo spostata, avrebbe
 * riscritto l'impegno: la Scorecard avrebbe misurato l'ULTIMA versione, e
 * nessuno se ne sarebbe accorto. L'unica difesa era la disciplina scritta
 * nelle istruzioni del task — e quelle istruzioni le applica un modello.
 *
 * ── LA REGOLA ────────────────────────────────────────────────────────────
 *
 * A settimana aperta (stesso `weekStart`) i campi si dividono in due:
 *
 *  IMMUTABILI — sono l'impegno. `windowEnd`; per asset `bias`, `confidence`,
 *  `p0`, `em`, `emSource`, `ivUsed`; per ogni ramo `event`, `condition`,
 *  `effect`; per ogni invalidazione `condition` e `type`. Un daily che li
 *  cambia NON li cambia: vince la versione già registrata.
 *
 *  DI MONITORAGGIO — sono il motivo per cui i daily esistono. Per asset
 *  `status`, `mfeEm`, `maeEm`, `path`; per ogni ramo e ogni invalidazione lo
 *  `status`. Passano sempre.
 *
 * ── PERCHÉ NON SI RIFIUTA IL REPORT ──────────────────────────────────────
 *
 * Un 400 non è recuperabile: il desk genera e spedisce una volta, non c'è
 * coda di rispedizione, e il report è l'unica copia. Rifiutarlo perderebbe
 * TUTTO il monitoraggio di quella giornata — percorso, MFE/MAE, stato dei
 * rami — cioè l'unica parte che solo quel report possiede. I campi
 * immutabili, invece, sono già in archivio dalla domenica: tenerli non costa
 * niente.
 *
 * Accettare e congelare conserva il 100% dell'informazione insostituibile;
 * rifiutare la butta via tutta per proteggere una parte che non era in
 * pericolo. E un 400 direbbe anche la cosa sbagliata: il daily non è
 * malformato, sta CONTRADDICENDO un impegno, e chi legge i log deve poter
 * distinguere i due casi.
 *
 * Il difetto vero non era la sovrascrittura: era che avvenisse in silenzio.
 * Per questo la discrepanza non si limita a essere respinta — si registra,
 * torna nella risposta HTTP e si vede in pagina.
 */

/** Una modifica rifiutata, in forma leggibile e confrontabile. */
export interface ModificaRifiutata {
  /** `windowEnd` · `xau.p0` · `wti.ramo[b2].condition` … */
  campo: string;
  /** Valore che resta in archivio (quello dichiarato la domenica). */
  tenuto: string;
  /** Valore che il daily voleva scrivere. */
  rifiutato: string;
}

export interface EsitoImpegno {
  /** Il record da salvare: immutabili dall'archivio, monitoraggio dal nuovo. */
  record: WeeklyBiasRecord;
  /** Vuoto = nessuna discrepanza, il daily era in linea con l'impegno. */
  rifiutate: ModificaRifiutata[];
}

/** Rappresentazione stabile per il confronto e per il messaggio. */
function testo(valore: unknown): string {
  if (valore === null || valore === undefined) return "—";
  return String(valore);
}

/**
 * Confronta un campo e, se diverge, lo registra fra i rifiutati.
 * Restituisce SEMPRE il valore tenuto: è il chiamante a non poter sbagliare.
 */
function tieni<T>(
  rifiutate: ModificaRifiutata[],
  campo: string,
  archivio: T,
  arrivato: T,
): T {
  if (testo(archivio) !== testo(arrivato)) {
    rifiutate.push({
      campo,
      tenuto: testo(archivio),
      rifiutato: testo(arrivato),
    });
  }
  return archivio;
}

function fondiRami(
  rifiutate: ModificaRifiutata[],
  prefisso: string,
  archivio: BiasBranch[],
  arrivati: BiasBranch[],
): BiasBranch[] {
  const perId = new Map(arrivati.map((r) => [r.id, r]));
  const fusi = archivio.map((base) => {
    const nuovo = perId.get(base.id);
    /* Un ramo sparito dal daily NON si cancella: l'elenco dei rami è parte
       dell'impegno, e un impegno che si accorcia strada facendo è il modo più
       comodo di non sbagliare mai una previsione. */
    if (!nuovo) return base;
    const p = `${prefisso}.ramo[${base.id}]`;
    return {
      id: base.id,
      event: tieni(rifiutate, `${p}.event`, base.event, nuovo.event),
      condition: tieni(rifiutate, `${p}.condition`, base.condition, nuovo.condition),
      effect: tieni(rifiutate, `${p}.effect`, base.effect, nuovo.effect),
      // lo stato del ramo è monitoraggio: passa
      status: nuovo.status,
    };
  });
  /* Un ramo NUOVO comparso a settimana aperta non entra: sarebbe un impegno
     aggiunto dopo aver visto il mercato. Si registra e basta. */
  for (const nuovo of arrivati) {
    if (archivio.some((b) => b.id === nuovo.id)) continue;
    rifiutate.push({
      campo: `${prefisso}.ramo[${nuovo.id}]`,
      tenuto: "—",
      rifiutato: `ramo aggiunto a settimana aperta (${nuovo.condition})`,
    });
  }
  return fusi;
}

function fondiInvalidazioni(
  rifiutate: ModificaRifiutata[],
  prefisso: string,
  archivio: BiasInvalidation[],
  arrivate: BiasInvalidation[],
): BiasInvalidation[] {
  const perId = new Map(arrivate.map((i) => [i.id, i]));
  const fuse = archivio.map((base) => {
    const nuova = perId.get(base.id);
    if (!nuova) return base;
    const p = `${prefisso}.invalidazione[${base.id}]`;
    return {
      id: base.id,
      condition: tieni(rifiutate, `${p}.condition`, base.condition, nuova.condition),
      type: tieni(rifiutate, `${p}.type`, base.type, nuova.type),
      // armamento e scatto sono monitoraggio: passano
      status: nuova.status,
    };
  });
  for (const nuova of arrivate) {
    if (archivio.some((i) => i.id === nuova.id)) continue;
    rifiutate.push({
      campo: `${prefisso}.invalidazione[${nuova.id}]`,
      tenuto: "—",
      rifiutato: `invalidazione aggiunta a settimana aperta (${nuova.condition})`,
    });
  }
  return fuse;
}

function fondiAsset(
  rifiutate: ModificaRifiutata[],
  archivio: AssetBiasRecord,
  arrivato: AssetBiasRecord,
): AssetBiasRecord {
  const p = archivio.asset;
  return {
    asset: archivio.asset,
    bias: tieni(rifiutate, `${p}.bias`, archivio.bias, arrivato.bias),
    confidence: tieni(rifiutate, `${p}.confidence`, archivio.confidence, arrivato.confidence),
    p0: tieni(rifiutate, `${p}.p0`, archivio.p0, arrivato.p0),
    em: tieni(rifiutate, `${p}.em`, archivio.em, arrivato.em),
    emSource: tieni(rifiutate, `${p}.emSource`, archivio.emSource, arrivato.emSource),
    ivUsed: tieni(rifiutate, `${p}.ivUsed`, archivio.ivUsed, arrivato.ivUsed),
    branches: fondiRami(rifiutate, p, archivio.branches, arrivato.branches),
    invalidations: fondiInvalidazioni(
      rifiutate,
      p,
      archivio.invalidations,
      arrivato.invalidations,
    ),
    // ── da qui in giù è tutto monitoraggio, e passa senza discutere ──
    status: arrivato.status,
    mfeEm: arrivato.mfeEm,
    maeEm: arrivato.maeEm,
    path: arrivato.path,
  };
}

/**
 * Applica l'impegno a un record in arrivo.
 *
 * `archivioGrezzo` è il `biasRecord` già salvato per lo stesso `type` e
 * `reportDate`, oppure il record della stessa settimana già registrato da un
 * report precedente. Quando non c'è nulla in archivio, o quando la settimana è
 * DIVERSA, il nuovo record passa intero: un impegno nuovo non ha nulla da
 * proteggere, ed è esattamente ciò che deve succedere la domenica.
 */
export function applicaImpegno(
  archivioGrezzo: unknown,
  arrivato: WeeklyBiasRecord,
): EsitoImpegno {
  const archivio = parseWeeklyBiasRecord(archivioGrezzo);
  if (!archivio || archivio.weekStart !== arrivato.weekStart) {
    return { record: arrivato, rifiutate: [] };
  }

  const rifiutate: ModificaRifiutata[] = [];
  const perAsset = new Map(arrivato.assets.map((a) => [a.asset, a]));

  const assets = archivio.assets.map((base) => {
    const nuovo = perAsset.get(base.asset);
    /* Un asset sparito dal daily resta com'era: l'impegno riguarda tutti e
       tre, e farne sparire uno equivarrebbe a ritirarlo. */
    return nuovo ? fondiAsset(rifiutate, base, nuovo) : base;
  });

  for (const nuovo of arrivato.assets) {
    if (archivio.assets.some((a) => a.asset === nuovo.asset)) continue;
    rifiutate.push({
      campo: `${nuovo.asset}`,
      tenuto: "—",
      rifiutato: "asset aggiunto a settimana aperta",
    });
  }

  return {
    record: {
      weekStart: archivio.weekStart,
      windowEnd: tieni(
        rifiutate,
        "windowEnd",
        archivio.windowEnd,
        arrivato.windowEnd,
      ),
      assets,
    },
    rifiutate,
  };
}

/* ── La confidenza del PAYLOAD contro l'impegno ───────────────────────── */

/**
 * IL PUNTO CIECO DEL GUARDIANO, chiuso il 28/08/2026 e corretto la sera stessa.
 *
 * `applicaImpegno` confronta il `biasRecord` in arrivo con quello in archivio,
 * e in 23 report non ha mai rilevato niente: il desk quel blocco lo rispediva
 * identico. Intanto, però, la stessa confidenza scritta nell'ALTRO posto —
 * `payload.assets[].weekly.confidence`, che è ciò che la card mostra —
 * divergeva dall'impegno in 13 casi su 42. Il guardiano sorvegliava la porta
 * chiusa.
 *
 * ── CONTRO CHE COSA SI CONFRONTA, e perché è cambiato ───────────────────
 * La prima versione confrontava il payload in arrivo col payload ARCHIVIATO, e
 * al primo giro su dati veri ha segnalato una violazione che era l'esatto
 * contrario: il 28/08 il desk ha portato `oil` da 43 a 45 — cioè ha ALLINEATO
 * il payload al `biasRecord`, che 45 lo diceva da domenica. Il riferimento era
 * il valore sbagliato, e il guardiano difendeva l'errore.
 *
 * Ora il confronto è con `biasRecord.<asset>.confidence` dell'archivio, che è
 * l'impegno vero. Ne seguono le due proprietà che servono:
 *  - una correzione VERSO il record non produce più falso allarme;
 *  - uno scostamento DAL record continua a produrlo — anche quando il report
 *    è internamente coerente, cioè quando il desk muove payload e record
 *    insieme. In quel caso il record viene congelato da `applicaImpegno` e la
 *    coerenza interna del report non basta più a nascondere la deriva.
 *
 * ── Si REGISTRA, non si riscrive ────────────────────────────────────────
 * A differenza del `biasRecord`, qui non si congela nulla. Tre ragioni, in
 * ordine di peso:
 *
 *  1. il payload si salva byte per byte, per scelta: è l'unica copia del
 *     report e il desk può mandare campi che il parser non conosce ancora.
 *     Riscriverne uno significherebbe archiviare un payload che il desk non
 *     ha mai spedito — cioè fabbricare la fonte invece di custodirla;
 *  2. l'impegno che la Scorecard misura sta nel `biasRecord`, ed è già
 *     congelato da `applicaImpegno`: qui non c'è niente da proteggere che non
 *     sia già protetto. Quel che manca è solo la visibilità;
 *  3. la divergenza è essa stessa il dato interessante — dice che il desk ha
 *     cambiato idea a settimana aperta. Sovrascriverla la cancellerebbe.
 */
function confidenzeSettimanaliDalPayload(payload: unknown): Map<string, number> {
  const fuori = new Map<string, number>();
  const p = payload as Record<string, unknown> | null | undefined;
  const assets = p && typeof p === "object" && Array.isArray(p.assets) ? p.assets : [];
  for (const grezzo of assets) {
    if (typeof grezzo !== "object" || grezzo === null) continue;
    const a = grezzo as Record<string, unknown>;
    const id = typeof a.id === "string" ? a.id : null;
    const weekly = a.weekly;
    if (!id || typeof weekly !== "object" || weekly === null) continue;
    const conf = (weekly as Record<string, unknown>).confidence;
    if (typeof conf === "number" && Number.isFinite(conf)) fuori.set(id, conf);
  }
  return fuori;
}

/**
 * Le confidenze settimanali del payload in arrivo che divergono dall'IMPEGNO
 * già registrato per la stessa settimana. Un asset che l'impegno non copre non
 * è una divergenza: è un cambio di composizione, che il confronto sul
 * `biasRecord` già intercetta per quel che vale.
 */
export function confidenzaPayloadRifiutata(
  biasRecordArchivio: unknown,
  payloadArrivato: unknown,
): ModificaRifiutata[] {
  const impegno = parseWeeklyBiasRecord(biasRecordArchivio);
  if (!impegno) return [];
  const perAsset = new Map(impegno.assets.map((a) => [a.asset, a.confidence]));

  const fuori: ModificaRifiutata[] = [];
  for (const [id, valore] of confidenzeSettimanaliDalPayload(payloadArrivato)) {
    const chiave = ASSET_PAYLOAD_A_RECORD[id];
    const dichiarata = chiave ? perAsset.get(chiave) : undefined;
    if (dichiarata === undefined || dichiarata === null || dichiarata === valore) {
      continue;
    }
    fuori.push({
      campo: `payload.assets[${id}].weekly.confidence`,
      tenuto: testo(dichiarata),
      rifiutato: testo(valore),
    });
  }
  return fuori;
}

/** Riga sola per il log del server: dice cosa e quante, non un oggetto muto. */
export function riassuntoRifiuti(rifiutate: ModificaRifiutata[]): string {
  return rifiutate
    .map((r) => `${r.campo}: tenuto ${r.tenuto}, rifiutato ${r.rifiutato}`)
    .join(" · ");
}

/**
 * Riscrive un record NELLA FORMA CHE IL DESK SPEDISCE E CHE IL PARSER LEGGE.
 *
 * Serve perché `applicaImpegno` lavora sulla forma normalizzata — `assets`
 * come ARRAY — mentre sul filo e in colonna `assets` è un DIZIONARIO per
 * chiave, e `parseWeeklyBiasRecord` legge solo quella: `isRecord` rifiuta
 * esplicitamente gli array. Salvare la forma normalizzata renderebbe il record
 * ILLEGGIBILE alla lettura successiva — `assets.length === 0`, quindi
 * `parseWeeklyBiasRecord` torna `null` e la settimana sparisce dalla Scorecard.
 * Il difetto è stato preso da un test di integrazione prima di uscire.
 *
 * Si emettono le chiavi originali (`P0`, `mfe_EM`, `mae_EM`, `move_EM`) e non
 * le loro varianti camel-case, che il parser accetta ma che nel database non
 * sono mai comparse: una sola forma in colonna, quella che c'è già.
 */
export function versoJsonDesk(record: WeeklyBiasRecord): Record<string, unknown> {
  const assets: Record<string, unknown> = {};
  for (const a of record.assets) {
    assets[a.asset] = {
      bias: a.bias,
      confidence: a.confidence,
      P0: a.p0,
      em: a.em,
      emSource: a.emSource,
      ivUsed: a.ivUsed,
      branches: a.branches.map((b) => ({ ...b })),
      invalidations: a.invalidations.map((i) => ({ ...i })),
      status: a.status,
      mfe_EM: a.mfeEm,
      mae_EM: a.maeEm,
      path: a.path.map((p) => ({
        date: p.date,
        px: Number.isFinite(p.px) ? p.px : null,
        move_EM: p.moveEm,
      })),
    };
  }
  return {
    weekStart: record.weekStart,
    windowEnd: record.windowEnd,
    assets,
  };
}
