import { z } from "zod";
import { isValidCalendarDate } from "@/lib/dates";
import { isoUtc } from "@/lib/validations/macro-desk";
import {
  AREA_LETTURE,
  domenicaOnOrBefore,
  normalizzaAccenti,
} from "@/lib/macro-radar-testo";

/**
 * Radar di settore — confine d'ingresso del task «RADAR SETTORE».
 *
 * SCHEMA VERO, non `z.unknown()`. È la lezione del 13/08/2026: un `biasRecord`
 * non validato è passato fino a spegnere due pagine in produzione. Qui ogni
 * campo che la pagina legge ha un tipo, e le aree senza esito hanno la
 * struttura più stretta di tutte — perché è lì che si gioca il requisito non
 * negoziabile (vuoto ≠ non verificabile).
 *
 * Ma un 400 NON è recuperabile: il ponte non ritenta, e il registro della
 * settimana è perso. Quindi vale la stessa regola del Macro Desk: si
 * NORMALIZZA tutto ciò che è normalizzabile senza ambiguità, e si rifiuta
 * solo l'INDECIDIBILE. Le tre cose che qui sono indecidibili, e solo quelle:
 *
 *   1. una `weekOf` nel FUTURO — non so se è un fuso sbagliato o la settimana
 *      sbagliata, e indovinando sovrascriverei il run di domenica prossima;
 *   2. un'area non verificabile SENZA motivo — sarebbe indistinguibile in
 *      pagina da un'area vuota, che è esattamente ciò che non deve accadere;
 *   3. la stessa area dichiarata insieme vuota e non verificabile — è una
 *      contraddizione, e sceglierne una sarebbe inventare un fatto.
 */

// ───────────────────────── Mattoni ─────────────────────────

/** "YYYY-MM-DD" che sia una data di calendario REALE (niente rollover V8). */
function chiaveData(nome: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${nome} non valida (atteso YYYY-MM-DD)`)
    .refine((value) => {
      const year = Number(value.slice(0, 4));
      const month = Number(value.slice(5, 7));
      const day = Number(value.slice(8, 10));
      return isValidCalendarDate(year, month, day);
    }, `${nome} inesistente`);
}

/** Testo obbligatorio: ripulito dagli spazi e dagli apostrofi sostitutivi. */
function testo(nome: string, max = 8000) {
  return z
    .string()
    .transform((v) => normalizzaAccenti(v.trim()))
    .pipe(z.string().min(1, `${nome} non può essere vuoto`).max(max, `${nome} troppo lungo`));
}

/** Testo facoltativo: assente, `null` o vuoto diventano tutti `undefined`. */
function testoOpzionale(max = 8000) {
  return z
    .unknown()
    .transform((v) => {
      if (typeof v !== "string") return undefined;
      const pulito = normalizzaAccenti(v.trim());
      // Il troncamento è preferibile al rifiuto: è un campo accessorio, il
      // registro della settimana no.
      return pulito.length === 0 ? undefined : pulito.slice(0, max);
    })
    .optional();
}

/** Una lettera d'area, normalizzata in maiuscolo. Aperta: "H" domani è valida. */
const areaChiave = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().min(1, "Area vuota").max(24, "Area non plausibile"));

/** Data facoltativa: `null` è un valore LEGITTIMO (annuncio senza efficacia). */
function chiaveDataOpzionale(nome: string) {
  return chiaveData(nome).nullish().transform((v) => v ?? null);
}

/** URL http(s). Uno malformato non fa cadere il report: diventa assente. */
const urlFonte = z
  .unknown()
  .transform((v) => {
    if (typeof v !== "string") return undefined;
    const pulito = v.trim();
    if (!/^https?:\/\//i.test(pulito)) return undefined;
    return pulito.slice(0, 2000);
  })
  .optional();

// ───────────────────────── weekOf ─────────────────────────

/**
 * La domenica della settimana del run.
 *
 * Normalizza qualsiasi giorno alla domenica on-or-before (un run di giovedì
 * appartiene alla settimana cominciata domenica: non c'è altra lettura), e
 * RIFIUTA una domenica futura. Il payload del collaudo del 27/08 dichiarava
 * `2026-08-30`, cioè la domenica del run SUCCESSIVO: ingerirlo così avrebbe
 * occupato la settimana del 30 e il run automatico di domenica l'avrebbe
 * sovrascritto — due settimane diverse nella stessa riga.
 */
export const weekOfChiave = chiaveData("weekOf")
  .transform(domenicaOnOrBefore)
  .refine(
    (domenica) => domenica <= domenicaOnOrBefore(new Date().toISOString().slice(0, 10)),
    "weekOf è nel futuro: la settimana del run non può essere una domenica che deve ancora arrivare",
  );

// ───────────────────────── Blocchi ─────────────────────────

/** La finestra osservata. OBBLIGATORIA: la pagina deve mostrarla sempre, e
 * una finestra assente non si può dedurre da nulla. */
const coverage = z
  .object({
    from: chiaveData("coverage.from"),
    to: chiaveData("coverage.to"),
    extended: z.boolean().optional().transform((v) => v ?? false),
  })
  .refine((c) => c.from <= c.to, {
    message: "coverage.from è successivo a coverage.to",
    path: ["from"],
  });

/** «Le cose che contano»: hanno un'AZIONE, ed è ciò che le distingue. */
const highlight = z.object({
  title: testo("top[].title", 500),
  whatChanged: testo("top[].whatChanged"),
  action: testo("top[].action"),
  sourceUrl: urlFonte,
  sourceName: testoOpzionale(500),
});

/**
 * Una voce del registro. `id` è la chiave stabile fra settimane: senza, la
 * deduplica e l'evoluzione annunciato→attivo non esistono, quindi è
 * obbligatoria. Tutto il resto del payload che non ha una colonna resta
 * catturato da `.passthrough()` e finisce in `extra`.
 */
const voce = z
  .object({
    id: testo("items[].id", 200),
    area: areaChiave,
    title: testo("items[].title", 500),
    whatChanged: testo("items[].whatChanged"),
    who: testoOpzionale(200),
    announcedOn: chiaveDataOpzionale("items[].announcedOn"),
    effectiveFrom: chiaveDataOpzionale("items[].effectiveFrom"),
    status: testo("items[].status", 60),
    impact: testoOpzionale(),
    sourceUrl: urlFonte,
    sourceName: testoOpzionale(500),
  })
  .passthrough();

/**
 * «In osservazione». Nel run di collaudo `watchlist` è VUOTA, quindi la sua
 * forma piena non l'ho mai vista: si validano i due campi senza i quali la
 * pagina non può renderla (`id` e `title`) e si tiene tutto il resto con
 * `.passthrough()`. È uno schema vero e stretto su ciò che si sa, non un
 * `z.unknown()` — e non una forma immaginata su ciò che non si sa.
 */
const osservazione = z
  .object({
    id: testo("watchlist[].id", 200),
    area: areaChiave.optional(),
    title: testo("watchlist[].title", 500),
    note: testoOpzionale(),
    status: testoOpzionale(60),
    sourceUrl: urlFonte,
    sourceName: testoOpzionale(500),
  })
  .passthrough();

/**
 * Area NON verificabile: `reason` è OBBLIGATORIA e non vuota.
 *
 * È il punto in cui lo schema difende il requisito non negoziabile. Una voce
 * senza motivo non è renderizzabile come avviso — direbbe solo «area X:
 * niente», che è la frase di un'area vuota. Meglio un 400 rumoroso che una
 * pagina che mente su cosa è stato guardato.
 */
const areaNonVerificabile = z.object({
  area: areaChiave,
  reason: testo("unverifiableAreas[].reason", 2000),
});

// ───────────────────────── Il payload ─────────────────────────

const radarPayloadBase = z.object({
  // Il tipo è il contratto dell'endpoint: se arriva ed è un altro, il mittente
  // ha sbagliato porta e un upsert silenzioso sarebbe peggio di un 400.
  type: z.literal("radar-settore").optional(),
  weekOf: weekOfChiave,
  generatedAt: isoUtc,
  coverage,

  top: z.array(highlight).max(50).optional().transform((v) => v ?? []),
  items: z.array(voce).max(500).optional().transform((v) => v ?? []),
  watchlist: z.array(osservazione).max(500).optional().transform((v) => v ?? []),

  emptyAreas: z.array(areaChiave).max(100).optional().transform((v) => v ?? []),
  unverifiableAreas: z
    .array(areaNonVerificabile)
    .max(100)
    .optional()
    .transform((v) => v ?? []),

  discarded: z
    .number()
    .int("discarded deve essere un intero")
    .min(0, "discarded non può essere negativo")
    .optional(),
  notes: testoOpzionale(20000),
});

export const radarReportSchema = radarPayloadBase
  .passthrough()
  .superRefine((dati, ctx) => {
    // ── Contraddizione INDECIDIBILE: la stessa area vuota e non verificabile.
    const vuote = new Set(dati.emptyAreas);
    for (const { area } of dati.unverifiableAreas) {
      if (vuote.has(area)) {
        ctx.addIssue({
          code: "custom",
          path: ["unverifiableAreas"],
          message: `L'area ${area} è dichiarata insieme vuota e non verificabile: sono due cose diverse e non posso sceglierne una`,
        });
      }
    }
    // ── Slug duplicati dentro la stessa settimana: la chiave non sarebbe più
    //    una chiave, e l'upsert perderebbe silenziosamente una voce.
    const visti = new Set<string>();
    for (const item of dati.items) {
      if (visti.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: `id duplicato nella stessa settimana: ${item.id}`,
        });
      }
      visti.add(item.id);
    }
    const vistiWatch = new Set<string>();
    for (const w of dati.watchlist) {
      if (vistiWatch.has(w.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["watchlist"],
          message: `id duplicato in watchlist: ${w.id}`,
        });
      }
      vistiWatch.add(w.id);
    }
  })
  .transform((dati) => {
    // ── NORMALIZZAZIONE (non rifiuto): un'area dichiarata vuota che però ha
    //    voci non è indecidibile — le voci SONO la prova che non è vuota. Si
    //    toglie dall'elenco delle vuote e non si perde nulla.
    const areeConVoci = new Set(dati.items.map((i) => i.area));
    const emptyAreas = dati.emptyAreas.filter((a) => !areeConVoci.has(a));

    // ── Le «Letture» (area G) sono ricerca, non cambiamenti operativi: si
    //    separano QUI, una volta sola, così la pagina non può confonderle.
    //    Un'area G può comunque essere non verificabile: le due cose convivono.
    const changes = dati.items.filter((i) => i.area !== AREA_LETTURE);
    const readings = dati.items.filter((i) => i.area === AREA_LETTURE);

    return { ...dati, emptyAreas, changes, readings };
  });

export type RadarReportInput = z.infer<typeof radarReportSchema>;
export type RadarVoceInput = z.infer<typeof voce>;
export type RadarOsservazioneInput = z.infer<typeof osservazione>;
