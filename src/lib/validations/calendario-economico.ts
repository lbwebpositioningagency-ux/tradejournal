import { z } from "zod";

/**
 * CONFINE ZOD del calendario economico di TradingView.
 *
 * La lezione del 13/08/2026 è scritta in `macro-desk-bias-record.ts` e vale
 * identica qui: un campo esterno non validato aveva fatto cadere due pagine
 * intere. Questa fonte è di terze parti, senza contratto e senza versione —
 * cioè può cambiare forma un martedì mattina senza avvisare nessuno.
 *
 * Due regole, e sono quelle del resto del desk:
 *
 * 1. **Mai un crash.** Il singolo evento malformato si scarta, gli altri
 *    restano. Un campo nuovo che non conosciamo si ignora (`.passthrough()`
 *    non serve: Zod di default scarta le chiavi in più, non fallisce).
 * 2. **Mai un numero inventato.** Se `result` non è una lista, o la risposta
 *    non ha `status: "ok"`, la pagina dichiara che il dato non c'è. Non
 *    esiste una tabella vuota che assomiglia a «oggi non succede niente»:
 *    quella è una bugia, e in un calendario è la bugia peggiore possibile.
 *
 * I CAMPI GIÀ SCALATI (`actual`, `forecast`, `previous`) SONO DELIBERATAMENTE
 * FUORI da questo schema. Non è una dimenticanza: sono la trappola di questa
 * fonte. TradingView pubblica i Non Farm Payrolls come `forecast: 45` con
 * `scale: "K"`, e come `forecastRaw: 45000`. I due numeri sono lo stesso
 * fatto, ma solo uno si può confrontare con il precedente senza sapere che
 * scala aveva quello. Leggendo solo i `*Raw` il problema non si pone: la
 * scala la applichiamo noi, una volta, in `calendario-economico.ts`.
 */

/** Le scale che la fonte usa. Tutto il resto è un valore che non sappiamo leggere. */
export const SCALE_CALENDARIO = ["K", "M", "B", "T"] as const;
export type ScalaCalendario = (typeof SCALE_CALENDARIO)[number];

/**
 * Importanza dichiarata dalla fonte: −1 bassa, 0 media, 1 alta.
 *
 * Non è una scala nostra e non la reinterpretiamo: è il numero di «tori» che
 * TradingView mostra accanto all'evento. La pagina la traduce in parole, non
 * la ricalcola.
 */
export const IMPORTANZE_CALENDARIO = [-1, 0, 1] as const;

const numeroFinito = z
  .number()
  .refine(Number.isFinite, "valore non finito")
  .nullable();

/**
 * Un evento come arriva dalla fonte.
 *
 * `date` è un istante UTC in ISO: resta UTC fino alla resa, dove diventa
 * l'ora del fuso di `User.timezone`, come ogni altro orario del progetto.
 */
export const eventoCalendarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  country: z.string().min(1),
  /* La sigla ISO della valuta è la chiave del filtro in pagina: senza, la
     riga non è filtrabile e non ha senso mostrarla. */
  currency: z.string().min(1),
  date: z.iso.datetime(),
  importance: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  /* Il periodo di riferimento («Ago», «Q2»): dice a QUALE mese si riferisce
     un dato che esce oggi. Facoltativo alla fonte, spesso stringa vuota. */
  period: z.string().optional().default(""),
  indicator: z.string().optional().default(""),
  /* Provenienza originale del numero (BLS, ECB, …) e il suo link. Il desk
     mostra fatti con la loro fonte, non verdetti: queste due non sono
     decorazione. */
  source: z.string().optional().default(""),
  source_url: z.string().optional().default(""),
  unit: z.string().nullish(),
  scale: z.enum(SCALE_CALENDARIO).nullish(),
  /* SOLO i grezzi: v. la nota in testa al file. */
  actualRaw: numeroFinito.optional().default(null),
  forecastRaw: numeroFinito.optional().default(null),
  previousRaw: numeroFinito.optional().default(null),
});

export type EventoCalendario = z.infer<typeof eventoCalendarioSchema>;

/**
 * L'involucro della risposta.
 *
 * `result` è volutamente `z.array(z.unknown())`: la validazione del singolo
 * evento avviene una riga alla volta in `calendario-economico.ts`, così un
 * evento storto non porta giù gli altri 355. Se validassimo qui l'array
 * intero, un solo `title: null` a Wellington cancellerebbe la settimana.
 */
export const rispostaCalendarioSchema = z.object({
  status: z.literal("ok"),
  result: z.array(z.unknown()),
});
