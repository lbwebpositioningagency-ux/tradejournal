import { parseMacroPayload } from "@/lib/macro-desk-payload";

/**
 * LA SENTINELLA ALL'INGRESSO — modulo PURO, nessun I/O.
 * Proposta e motivazioni: `docs/macro-desk/SENTINELLA-INGRESSO-PROPOSTA.md`.
 *
 * ── Il fatto da cui nasce ───────────────────────────────────────────────
 * Il 18 agosto 2026 il generatore ha spedito un report con 11 notizie su 11
 * senza `title` (usava `t`/`note`) e la sintesi in `risk`/`concl`. È stato
 * accettato con 200, salvato, e reso in pagina come undici card mute, senza
 * Radar rischi e senza Verdetto. Nessuno lo ha saputo per DIECI GIORNI: non
 * c'è stato un errore, un log, una riga rossa. Il payload è `z.unknown()` al
 * confine e il parser è difensivo per scelta, quindi un campo che non si
 * riconosce diventa `undefined` e la UI degrada con eleganza.
 *
 * Il difetto non era la tolleranza. Era che la tolleranza non lasciasse
 * traccia.
 *
 * ── NON SI RIFIUTA MAI ──────────────────────────────────────────────────
 * Nessun rilievo produce un 400, per nessun motivo. Un 400 su questo endpoint
 * non è recuperabile: il desk genera e spedisce UNA volta, non c'è coda di
 * rispedizione, e il report è l'unica copia — la stessa ragione per cui
 * `applicaImpegno` accetta e congela invece di respingere. Un report
 * parzialmente illeggibile vale incomparabilmente più di nessun report.
 *
 * Questa funzione quindi non decide niente: produce RILIEVI, e chi la chiama
 * li mette dove qualcuno li legge (log, risposta HTTP, colonna, pagina).
 *
 * ── Perché non serve a riparare il 18/08 ────────────────────────────────
 * Quel report è in Neon e non si rigenera: a farlo parlare sono stati gli
 * alias nel parser (`t`/`note`, `risk`/`concl`, `synthesis` stringa). La
 * sentinella serve per il PROSSIMO campo che nessuno ha ancora immaginato.
 */

export interface Rilievo {
  /** Percorso nel payload, come lo scriverebbe chi va a guardare: `news[3].title`. */
  campo: string;
  /** Che cosa non torna, in una riga leggibile da chi ha spedito il report. */
  problema: string;
}

/** Oltre questa soglia si dice «e altri N»: un elenco di 200 righe non si legge. */
const MAX_RILIEVI_PER_CONTROLLO = 5;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Entità HTML nei campi di testo. Il generatore scrive `&lt;81` dove intende
 * «sotto 81»: la pagina lo rende letteralmente, perché quei campi NON passano
 * da `sanitizeInlineHtml` (e non devono passarci: la sanificazione serve a
 * togliere markup ostile, non a decodificare entità che non dovevano esserci).
 * Si corregge a monte; qui si vede.
 */
const ENTITA_HTML = /&(?:lt|gt|amp|quot|#39|nbsp);/;

/** I campi testuali che finiscono in pagina come prosa, per asset e orizzonte. */
function testiDiOrizzonte(
  prefisso: string,
  orizzonte: unknown,
): { campo: string; testo: string }[] {
  if (!isRecord(orizzonte)) return [];
  const fuori: { campo: string; testo: string }[] = [];
  for (const chiave of ["edge", "invalid", "narrative"]) {
    const v = orizzonte[chiave];
    if (typeof v === "string") fuori.push({ campo: `${prefisso}.${chiave}`, testo: v });
  }
  const pillars = Array.isArray(orizzonte.pillars) ? orizzonte.pillars : [];
  pillars.forEach((p, i) => {
    if (isRecord(p) && typeof p.note === "string") {
      fuori.push({ campo: `${prefisso}.pillars[${i}].note`, testo: p.note });
    }
  });
  return fuori;
}

/** Tutti i testi del payload che vale la pena controllare, con il loro percorso. */
function testiDelPayload(p: Record<string, unknown>): { campo: string; testo: string }[] {
  const fuori: { campo: string; testo: string }[] = [];
  const assets = Array.isArray(p.assets) ? p.assets : [];
  assets.forEach((a, i) => {
    if (!isRecord(a)) return;
    const nome = typeof a.id === "string" ? a.id : String(i);
    fuori.push(...testiDiOrizzonte(`assets[${nome}].weekly`, a.weekly));
    fuori.push(...testiDiOrizzonte(`assets[${nome}].quarterly`, a.quarterly));
  });
  const s = isRecord(p.synthesis) ? p.synthesis : undefined;
  for (const chiave of ["conclusion", "concl"]) {
    const v = s?.[chiave];
    if (typeof v === "string") fuori.push({ campo: `synthesis.${chiave}`, testo: v });
  }
  /* `synthesis.risks` e `watch` NON entrano: quelli arrivano come HTML per
     contratto e passano da `sanitizeInlineHtml`, dove le entità sono attese. */
  const vol = isRecord(p.volPanel) ? p.volPanel : undefined;
  if (typeof vol?.reading === "string") {
    fuori.push({ campo: "volPanel.reading", testo: vol.reading });
  }
  return fuori;
}

/**
 * I rilievi di un report in arrivo. Array vuoto = niente da dire, che è il
 * caso normale e quello in cui non deve succedere assolutamente nulla.
 *
 * Fino al 15/09/2026 riceveva anche il `biasRecord`, che serviva solo al
 * confronto delle due confidenze (controllo 4, tolto).
 */
export function controllaContratto(payload: unknown): Rilievo[] {
  const rilievi: Rilievo[] = [];
  if (!isRecord(payload)) {
    return [{ campo: "payload", problema: "non è un oggetto: nessuna sezione è leggibile" }];
  }

  /* ── 1 e 2 · le notizie ────────────────────────────────────────────────
     Si guarda il payload GIÀ PASSATO dal parser: gli alias `t`/`note` sono
     già risolti, quindi un rilievo qui significa che manca davvero, non che
     è scritto in un altro modo. È la differenza fra segnalare un problema e
     segnalare la propria ignoranza. */
  const lette = parseMacroPayload(payload);
  const senzaTesto: string[] = [];
  const senzaProvenienza: string[] = [];
  lette.news.forEach((n, i) => {
    const mancanti: string[] = [];
    if (!n.title) mancanti.push("title");
    if (!n.impl) mancanti.push("impl");
    if (mancanti.length > 0) senzaTesto.push(`news[${i}]: manca ${mancanti.join(", ")}`);

    const provenienza: string[] = [];
    if (!n.src) provenienza.push("src");
    if (!n.url) provenienza.push("url");
    if (!n.when) provenienza.push("when");
    if (provenienza.length > 0) {
      senzaProvenienza.push(`news[${i}]: manca ${provenienza.join(", ")}`);
    }
  });
  aggiungi(rilievi, "news", "voce senza testo leggibile", senzaTesto);
  aggiungi(rilievi, "news", "voce senza provenienza", senzaProvenienza);

  /* ── 3 · entità HTML nei campi testuali ───────────────────────────────── */
  const conEntita = testiDelPayload(payload)
    .filter((t) => ENTITA_HTML.test(t.testo))
    .map((t) => `${t.campo}: entità HTML nel testo (es. «&lt;» al posto di «<»)`);
  aggiungi(rilievi, "testi", "entità HTML non decodificata", conEntita);

  /* ── 4 e 6 · confidenza — TOLTI il 15/09/2026 ─────────────────────────
     Controllavano la stessa confidenza scritta due volte e la confidenza fuori
     scala. La confidenza del report non si mostra più in nessuna pagina: una
     sentinella su un dato che nessuno legge produrrebbe rilievi senza lettore.
     Il dato continua ad arrivare e resta intatto nel payload salvato. */

  /* ── 5 · la sintesi c'è, ed è un oggetto ──────────────────────────────
     Il 31/07 mandava `synthesis` come STRINGA di 533 caratteri: il quadro, il
     Radar rischi e il Verdetto cadevano tutti insieme, in silenzio. Il parser
     ora la salva leggendola come verdetto, ma resta una forma sbagliata e va
     detto — altrimenti la riparazione a valle diventa il modo di non
     accorgersi mai che a monte è rimasta storta. */
  if (payload.synthesis === undefined || payload.synthesis === null) {
    rilievi.push({ campo: "synthesis", problema: "assente: niente quadro, verdetto né rischi" });
  } else if (!isRecord(payload.synthesis)) {
    rilievi.push({
      campo: "synthesis",
      problema:
        `è ${typeof payload.synthesis}, atteso un oggetto {pills, risks, conclusion}: ` +
        "letta come solo verdetto, pills e rischi persi",
    });
  } else {
    const s = payload.synthesis;
    for (const [canonica, alias] of [
      ["risks", "risk"],
      ["conclusion", "concl"],
    ] as const) {
      if (s[canonica] === undefined && s[alias] !== undefined) {
        rilievi.push({
          campo: `synthesis.${alias}`,
          problema: `grafia non canonica: atteso «${canonica}». Letto lo stesso, ma va corretto a monte`,
        });
      }
    }
  }

  return rilievi;
}

/**
 * Raggruppa i casi ripetuti di uno stesso controllo. Undici notizie senza
 * titolo devono produrre un rilievo che dice «undici», non undici rilievi che
 * spingono fuori pagina tutto il resto.
 */
function aggiungi(
  rilievi: Rilievo[],
  campo: string,
  titolo: string,
  casi: string[],
): void {
  if (casi.length === 0) return;
  const mostrati = casi.slice(0, MAX_RILIEVI_PER_CONTROLLO);
  const resto = casi.length - mostrati.length;
  rilievi.push({
    campo,
    problema:
      `${casi.length} × ${titolo} — ${mostrati.join(" · ")}` +
      (resto > 0 ? ` · e altri ${resto}` : ""),
  });
}

/** Riga sola per il log del server, come `riassuntoRifiuti` per l'impegno. */
export function riassuntoRilievi(rilievi: Rilievo[]): string {
  return rilievi.map((r) => `${r.campo}: ${r.problema}`).join(" · ");
}
