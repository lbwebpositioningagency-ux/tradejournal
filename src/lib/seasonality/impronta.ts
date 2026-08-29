/**
 * L'IMPRONTA DELLA STAGIONALITÀ: cos'è cambiato, quando, e da che valore.
 *
 * ── Perché esiste ─────────────────────────────────────────────────────────
 *
 * La Stagionalità si è rotta due volte in due giorni senza che nessuno se ne
 * accorgesse. Il 26/08 la serie dell'oro è passata da 8256 a 7944 barre — le
 * 312 sedute del 2005 — e il guasto è stato scoperto solo perché un numero in
 * pagina sembrava strano. Il 29/08 è successo di nuovo, con anni diversi,
 * perché la fonte restituisce storie parziali e la scrittura sostituiva invece
 * di unire.
 *
 * In entrambi i casi la riparazione è costata poco. È costato capire QUANDO
 * fosse cambiato e QUANTO valesse prima: quella risposta non esisteva da
 * nessuna parte, e si è dovuta ricostruire a mano dagli `xmin` di Postgres.
 *
 * Questo modulo è la risposta, scritta una volta per tutte.
 *
 * ── La decisione di progetto: si scrive solo quando CAMBIA ────────────────
 *
 * Tredici strumenti × cinque finestre × 365 notti fanno ~24.000 righe l'anno,
 * quasi tutte identiche alla precedente: un registro illeggibile, in cui
 * trovare il giorno del cambiamento sarebbe di nuovo un lavoro manuale.
 * Scrivendo una riga NUOVA solo quando l'impronta cambia — e limitandosi ad
 * aggiornare `ultimaVista` quando non cambia — la tabella resta a una
 * sessantina di righe e diventa un REGISTRO DELLE VARIAZIONI: «è cambiato il
 * giorno X, prima valeva Y» è leggere due righe consecutive.
 *
 * ── Le due regole d'allarme ───────────────────────────────────────────────
 *
 * Non tutti i cambiamenti sono guasti: una barra nuova ogni giorno è normale,
 * e a capodanno la finestra scorre e le medie si spostano legittimamente.
 * Diventa ROSSO solo:
 *
 *  1. quando si PERDE qualcosa — barre in meno, storia che comincia più tardi,
 *     `n` che scende, un mese che sparisce;
 *  2. quando una media cambia a `n` INVARIATO — stesso campione, risposta
 *     diversa: è sbagliato per costruzione, e non serve nessuna soglia
 *     arbitraria per dirlo.
 *
 * La seconda è la regola che serve davvero. È esatta: o il campione è lo
 * stesso, o non lo è.
 *
 * Modulo PURO: niente Prisma, niente `Date.now()`. La persistenza sta in
 * `impronta-store.ts`.
 */

export interface ImprontaMese {
  bucket: number;
  n: number;
  /** Media in LOG, come sta nel database: nessuna conversione di display. */
  media: number;
}

export interface ImprontaFinestra {
  lookbackYears: number;
  /** Un elemento per bucket presente, ordinato per bucket. */
  mesi: ImprontaMese[];
  /** Cumulato del percorso al 366° giorno, in log. Null se non c'è. */
  fineAnno: number | null;
}

export interface ImprontaSerie {
  /** Barre giornaliere in archivio. */
  barre: number;
  /** Estremi della serie grezza, `YYYY-MM-DD`. */
  primaData: string | null;
  ultimaData: string | null;
  /** Ordinate per finestra decrescente. */
  finestre: ImprontaFinestra[];
}

export type Gravita = "attesa" | "sospetta";

export interface Variazione {
  gravita: Gravita;
  testo: string;
}

/**
 * I `Decimal(18,8)` tornano da Postgres esatti; in JS diventano `number` e due
 * scritture identiche possono differire nell'ultimo bit. Si confronta la
 * rappresentazione a otto decimali, che è la precisione davvero memorizzata:
 * più in là non c'è informazione, solo rumore del formato.
 */
export function stessoNumero(a: number, b: number): boolean {
  return a.toFixed(8) === b.toFixed(8);
}

/**
 * Forma canonica su cui si calcola il digest. Serializzare l'oggetto così
 * com'è renderebbe l'impronta sensibile all'ordine delle chiavi, che nessuno
 * garantisce.
 */
export function formaCanonica(i: ImprontaSerie): string {
  const finestre = [...i.finestre]
    .sort((a, b) => b.lookbackYears - a.lookbackYears)
    .map((f) => [
      f.lookbackYears,
      [...f.mesi]
        .sort((a, b) => a.bucket - b.bucket)
        .map((m) => [m.bucket, m.n, m.media.toFixed(8)]),
      f.fineAnno === null ? null : f.fineAnno.toFixed(8),
    ]);
  return JSON.stringify([i.barre, i.primaData, i.ultimaData, finestre]);
}

/** Le due impronte descrivono esattamente gli stessi valori. */
export function improntaUguale(a: ImprontaSerie, b: ImprontaSerie): boolean {
  return formaCanonica(a) === formaCanonica(b);
}

function frase(gravita: Gravita, testo: string): Variazione {
  return { gravita, testo };
}

/**
 * Cosa è cambiato fra due impronte, e quanto è grave. Lista vuota = identiche.
 *
 * L'ordine è quello della lettura: prima la serie grezza, poi le finestre.
 */
export function confrontaImpronte(
  prima: ImprontaSerie,
  dopo: ImprontaSerie,
): Variazione[] {
  const out: Variazione[] = [];

  // ── La serie grezza ──────────────────────────────────────────────────────
  if (dopo.barre < prima.barre) {
    out.push(
      frase(
        "sospetta",
        `barre scese da ${prima.barre} a ${dopo.barre} (${prima.barre - dopo.barre} sedute perse)`,
      ),
    );
  } else if (dopo.barre > prima.barre) {
    out.push(
      frase("attesa", `barre salite da ${prima.barre} a ${dopo.barre}`),
    );
  }

  if (
    prima.primaData !== null &&
    dopo.primaData !== null &&
    dopo.primaData !== prima.primaData
  ) {
    out.push(
      dopo.primaData > prima.primaData
        ? frase(
            "sospetta",
            `la storia comincia più tardi: ${prima.primaData} → ${dopo.primaData}`,
          )
        : frase(
            "attesa",
            `la storia comincia prima: ${prima.primaData} → ${dopo.primaData}`,
          ),
    );
  }

  if (
    prima.ultimaData !== null &&
    dopo.ultimaData !== null &&
    dopo.ultimaData < prima.ultimaData
  ) {
    out.push(
      frase(
        "sospetta",
        `la serie si ferma prima: ${prima.ultimaData} → ${dopo.ultimaData}`,
      ),
    );
  }

  // ── Le finestre ──────────────────────────────────────────────────────────
  const finestrePrima = new Map(
    prima.finestre.map((f) => [f.lookbackYears, f]),
  );
  for (const f of [...dopo.finestre].sort(
    (a, b) => b.lookbackYears - a.lookbackYears,
  )) {
    const p = finestrePrima.get(f.lookbackYears);
    if (!p) continue; // finestra nuova: non c'è niente da confrontare
    const etichetta = `${f.lookbackYears} anni`;

    const mesiPrima = new Map(p.mesi.map((m) => [m.bucket, m]));
    const mesiDopo = new Map(f.mesi.map((m) => [m.bucket, m]));
    let campioneIntatto = true;
    let valoriIntatti = true;

    for (const [bucket, mp] of [...mesiPrima].sort((a, b) => a[0] - b[0])) {
      const md = mesiDopo.get(bucket);
      if (!md) {
        campioneIntatto = false;
        out.push(
          frase(
            "sospetta",
            `${etichetta}: il bucket ${bucket} è sparito (aveva n=${mp.n})`,
          ),
        );
        continue;
      }
      if (md.n < mp.n) {
        campioneIntatto = false;
        out.push(
          frase(
            "sospetta",
            `${etichetta}, bucket ${bucket}: n sceso da ${mp.n} a ${md.n}`,
          ),
        );
      } else if (md.n > mp.n) {
        campioneIntatto = false;
        out.push(
          frase(
            "attesa",
            `${etichetta}, bucket ${bucket}: n salito da ${mp.n} a ${md.n}`,
          ),
        );
      }
      if (!stessoNumero(mp.media, md.media)) {
        valoriIntatti = false;
        /* LA REGOLA CHIAVE. Stesso campione e risposta diversa: non c'è
           spiegazione benigna, quindi non c'è soglia da tarare. Se invece n è
           cambiato, la media DOVEVA cambiare — sarebbe stato strano il
           contrario. */
        if (md.n === mp.n) {
          out.push(
            frase(
              "sospetta",
              `${etichetta}, bucket ${bucket}: media cambiata da ${mp.media.toFixed(6)} a ${md.media.toFixed(6)} a n INVARIATO (${md.n})`,
            ),
          );
        }
      }
    }

    /* Il percorso è un calcolo a sé: può muoversi anche quando la tabella
       mensile non si muove. Si allarma solo se TUTTO il resto della finestra è
       rimasto identico — stesso campione, stesse medie — perché allora non
       resta nessuna causa legittima. */
    const fineCambiato =
      (p.fineAnno === null) !== (f.fineAnno === null) ||
      (p.fineAnno !== null &&
        f.fineAnno !== null &&
        !stessoNumero(p.fineAnno, f.fineAnno));
    if (fineCambiato) {
      const testo = `${etichetta}: percorso di fine anno da ${p.fineAnno === null ? "assente" : p.fineAnno.toFixed(6)} a ${f.fineAnno === null ? "assente" : f.fineAnno.toFixed(6)}`;
      out.push(
        frase(
          campioneIntatto && valoriIntatti ? "sospetta" : "attesa",
          campioneIntatto && valoriIntatti
            ? `${testo}, ma mesi e n sono identici`
            : testo,
        ),
      );
    }
  }

  return out;
}

/** Solo le variazioni che devono far diventare rosso il giro. */
export function sospette(v: readonly Variazione[]): string[] {
  return v.filter((x) => x.gravita === "sospetta").map((x) => x.testo);
}
